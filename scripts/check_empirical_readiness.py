#!/usr/bin/env python3
"""Check field-kit structure; this tool does not fit or validate the model."""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

HEADERS = {
    "visits.csv": """
        visit_id visit_date day_type observation_start_at observation_end_at completeness
        initial_shop_state reported_staff_by_pool clock_precision clock_basis source_id
        source_reference observer_id unknown_reason
    """.split(),
    "orders.csv": """
        visit_id order_id group_id group_link_status observed_group_size group_size_status
        arrival_at arrival_status arrival_definition outcome withdrawal_at final_delivery_at
        censoring_status source_id source_reference unknown_reason
    """.split(),
    "order_people.csv": """
        visit_id order_id person_id link_status link_basis source_id source_reference
        unknown_reason
    """.split(),
    "worker_segments.csv": """
        segment_id visit_id worker_id pool order_id order_link_status segment_type
        segment_start_at segment_end_at interval_status payment_medium source_id
        source_reference unknown_reason
    """.split(),
    "source_manifest.csv": """
        source_id source_name source_kind sha256 read_only_preserved clock_basis
        reference_scheme unknown_reason
    """.split(),
    "visit_split.csv": """
        visit_id subset split_version rationale frozen_by_id frozen_at decision_status
    """.split(),
    "parameter_provenance.csv": """
        parameter_id parameter_name value unit method source_visit_ids
        source_record_references uncertainty decision_status approved_by_id approved_at
        unknown_reason
    """.split(),
    "scenario_design.csv": """
        experiment_id scenario_id comparison_role configuration_reference
        configuration_sha256 parameter_ids demand_tape_policy replication_count estimand
        output_measures rationale decision_status approved_by_id approved_at unknown_reason
    """.split(),
}
EVENTS = """
    arrival payment_start active_payment_end external_confirmation_start
    external_confirmation_end preparation_start partial_receipt final_delivery
    withdrawal worker_segment_types
""".split()
DECISIONS = {
    "event_definitions": ("version", "definitions"),
    "privacy_handling": ("reference",),
    "collection_coverage": ("day_types", "operating_periods", "coverage_rationale"),
    "calibration_validation_split": ("version", "rationale"),
    "sample_targets": ("by_day_type", "rationale"),
    "target_precision": ("estimand", "target", "unit", "rationale"),
    "tolerances": ("metrics", "rationale"),
    "calibration_method": ("method", "eligible_records_rule", "uncertainty_method"),
    "censoring_treatment": ("value",),
    "validation_summaries": ("measures", "rationale"),
    "acceptance_criteria": ("criteria", "rationale"),
}
UNKNOWN = {"unknown", "unobserved", "not_recorded"}
SHA256 = re.compile(r"^[0-9a-fA-F]{64}$")
DATETIME_COMPONENT = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}")


class DuplicateJSONKey(ValueError):
    pass


class NonstandardJSONConstant(ValueError):
    pass


def unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, item in pairs:
        if key in result:
            raise DuplicateJSONKey(key)
        result[key] = item
    return result


def reject_json_constant(constant: str) -> None:
    raise NonstandardJSONConstant(constant)


class Report:
    def __init__(self) -> None:
        self.issues: list[dict[str, str]] = []

    def add(self, severity: str, code: str, path: str, message: str) -> None:
        self.issues.append({"severity": severity, "code": code, "path": path, "message": message})

    def error(self, code: str, path: str, message: str) -> None:
        self.add("error", code, path, message)

    def pending(self, code: str, path: str, message: str) -> None:
        self.add("pending", code, path, message)

    def output(self) -> tuple[dict[str, Any], int]:
        self.issues.sort(key=lambda item: (item["path"], item["code"]))
        if any(item["severity"] == "error" for item in self.issues):
            status, code = "INVALID", 1
        elif self.issues:
            status, code = "NOT_READY", 2
        else:
            status, code = "STRUCTURALLY_READY", 0
        return (
            {
                "schema_version": 1,
                "status": status,
                "exit_code": code,
                "empirical_validity": "NOT_ASSESSED",
                "statistical_adequacy": "NOT_ASSESSED",
                "cross_visit_identity_independence": "NOT_ASSESSED",
                "scope": "Structural checks only; no fitting or empirical validity assessment.",
                "issues": self.issues,
            },
            code,
        )


def value(raw: Any) -> str:
    return "" if raw is None else str(raw).strip()


def is_unknown(raw: Any) -> bool:
    return value(raw).casefold() in UNKNOWN


def populated(raw: Any) -> bool:
    if raw is None:
        return False
    return bool(raw) if not isinstance(raw, str) else bool(raw.strip()) and not is_unknown(raw)


def loc(filename: str, row: dict[str, Any], field: str = "") -> str:
    suffix = f" ({field})" if field else ""
    return f"{filename}:{row.get('_line', '?')}{suffix}"


def reason(row: dict[str, Any], field: str) -> bool:
    for item in value(row.get("unknown_reason")).split(";"):
        name, sep, explanation = item.partition(":")
        if sep and name.strip() == field and explanation.strip():
            return True
    return False


def require(report: Report, row: dict[str, Any], filename: str, field: str) -> str:
    e, p, at = report.error, report.pending, loc
    found = value(row.get(field))
    if not found or is_unknown(found):
        path = at(filename, row, field)
        if reason(row, field):
            p("value_unknown", path, "Unknown value retained with a reason.")
        else:
            e("unknown_reason_missing", path, f"Supply the value or add '{field}: reason'.")
    return found


def timestamp(report: Report, raw: Any, path: str) -> datetime | None:
    e = report.error
    text = value(raw)
    if not text or is_unknown(text):
        return None
    if not DATETIME_COMPONENT.match(text):
        e(
            "timestamp_datetime_required",
            path,
            "Record an hour and minute; a date alone is not a timestamp.",
        )
        return None
    try:
        return datetime.fromisoformat(text[:-1] + "+00:00" if text.endswith("Z") else text)
    except ValueError:
        e("timestamp_invalid", path, "Use an ISO 8601 timestamp.")
        return None


def ordered(
    report: Report, start: datetime | None, end: datetime | None, path: str, code: str
) -> None:
    e = report.error
    if start is None or end is None:
        return
    try:
        if start > end:
            e(code, path, "Start is after end; correct from the source.")
    except TypeError:
        e("timestamp_basis_mixed", path, "Use one clock basis for both timestamps.")


def read_csv(data_dir: Path, filename: str, report: Report) -> list[dict[str, str]]:
    e = report.error
    try:
        with (data_dir / filename).open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream, strict=True)
            header = reader.fieldnames or []
            if len(header) != len(set(header)):
                e("csv_header_duplicate", filename, "Remove duplicate header columns.")
            missing = sorted(set(HEADERS[filename]) - set(header))
            if missing:
                e(
                    "csv_header_incomplete",
                    filename,
                    f"Restore required columns: {', '.join(missing)}.",
                )
            rows = []
            for line, raw in enumerate(reader, start=2):
                if None in raw:
                    e("csv_row_too_wide", f"{filename}:{line}", "Check delimiters and quoting.")
                if any(cell is None for cell in raw.values()):
                    e(
                        "csv_row_too_short",
                        f"{filename}:{line}",
                        "Supply all cells or an explicit unknown value.",
                    )
                row = {key: value(cell) for key, cell in raw.items() if key is not None}
                row["_line"] = str(line)
                if any(cell for key, cell in row.items() if key != "_line"):
                    rows.append(row)
            return rows
    except FileNotFoundError:
        e("file_missing", filename, "Restore from docs/field-kit/templates.")
    except (OSError, UnicodeError, csv.Error) as exc:
        e("csv_unreadable", filename, f"Cannot read UTF-8 CSV ({type(exc).__name__}).")
    return []


def read_plan(data_dir: Path, report: Report) -> dict[str, Any]:
    e = report.error
    try:
        plan = json.loads(
            (data_dir / "analysis_plan.json").read_text(encoding="utf-8-sig"),
            object_pairs_hook=unique_json_object,
            parse_constant=reject_json_constant,
        )
    except FileNotFoundError:
        e("file_missing", "analysis_plan.json", "Restore it from docs/field-kit/templates.")
        return {}
    except DuplicateJSONKey as exc:
        e("json_duplicate_key", "analysis_plan.json", f"Duplicate key {str(exc)!r} is ambiguous.")
        return {}
    except NonstandardJSONConstant as exc:
        e(
            "json_nonstandard_constant",
            "analysis_plan.json",
            f"Reject nonstandard numeric constant {str(exc)!r}.",
        )
        return {}
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        e("json_unreadable", "analysis_plan.json", f"Cannot read JSON ({type(exc).__name__}).")
        return {}
    if not isinstance(plan, dict):
        e("plan_not_object", "analysis_plan.json", "Top-level JSON value must be an object.")
        return {}
    if plan.get("schema_version") != 1:
        e("plan_schema_unsupported", "analysis_plan.json:schema_version", "Use schema version 1.")
    return plan


def check_plan(plan: dict[str, Any], report: Report) -> None:
    e, p = report.error, report.pending
    if not plan:
        return
    question_ok = populated(plan.get("study_question"))
    if not question_ok:
        p(
            "study_question_pending",
            "analysis_plan.json:study_question",
            "Define the study question.",
        )
    approvals_ok = True
    approvals = plan.get("approvals")
    if not isinstance(approvals, dict):
        e(
            "plan_approvals_missing",
            "analysis_plan.json:approvals",
            "Restore owner and operator approval records.",
        )
        approvals = {}
        approvals_ok = False
    for role in ("study_owner", "operator"):
        item = approvals.get(role)
        path = f"analysis_plan.json:approvals.{role}"
        state = value(item.get("status")).casefold() if isinstance(item, dict) else ""
        if state == "pending":
            p("approval_pending", path, "Record actual approval when granted.")
            approvals_ok = False
        elif state != "approved":
            e("approval_status_invalid", f"{path}.status", "Use pending or approved.")
            approvals_ok = False
        elif (
            not populated(item.get("anonymous_id"))
            or timestamp(report, item.get("approved_at"), f"{path}.approved_at") is None
        ):
            e(
                "approval_incomplete",
                path,
                "Approved entries need anonymous ID and actual timestamp.",
            )
            approvals_ok = False

    decisions_ok = True
    decisions = plan.get("decisions")
    if not isinstance(decisions, dict):
        e("plan_decisions_missing", "analysis_plan.json:decisions", "Restore the decision groups.")
        decisions = {}
        decisions_ok = False
    for name, required in DECISIONS.items():
        item = decisions.get(name)
        path = f"analysis_plan.json:decisions.{name}"
        state = value(item.get("status")).casefold() if isinstance(item, dict) else ""
        if state in {"pending", "unset"}:
            p("decision_pending", path, "Decide and approve this item.")
            decisions_ok = False
            continue
        if state != "approved":
            e("decision_status_invalid", f"{path}.status", "Use pending, unset, or approved.")
            decisions_ok = False
            continue
        fields = list(required)
        if name == "event_definitions":
            definitions = item.get("definitions")
            if not isinstance(definitions, dict):
                e(
                    "event_definitions_incomplete",
                    f"{path}.definitions",
                    "Define every event and segment type.",
                )
                decisions_ok = False
            else:
                for event in EVENTS:
                    if not populated(definitions.get(event)):
                        e(
                            "event_definition_incomplete",
                            f"{path}.definitions.{event}",
                            "Add the approved definition.",
                        )
                        decisions_ok = False
        for field in fields:
            if not populated(item.get(field)):
                e(
                    "approved_decision_incomplete",
                    f"{path}.{field}",
                    "Keep pending until the actual value is recorded.",
                )
                decisions_ok = False

    state = value(plan.get("approval_state")).casefold()
    if state == "pending":
        p(
            "approval_state_pending",
            "analysis_plan.json:approval_state",
            "Keep pending until approvals are recorded.",
        )
    elif state != "approved":
        e(
            "approval_state_invalid",
            "analysis_plan.json:approval_state",
            "Use pending or approved.",
        )
    elif not question_ok or not approvals_ok or not decisions_ok:
        e(
            "approval_state_inconsistent",
            "analysis_plan.json:approval_state",
            "Aggregate approval conflicts with incomplete decisions.",
        )


def check_sources(rows: list[dict[str, str]], report: Report) -> set[str]:
    e, p, at = report.error, report.pending, loc
    if not rows:
        p("source_manifest_empty", "source_manifest.csv", "Record sources used by evidence rows.")
    ids: set[str] = set()
    for row in rows:
        sid = require(report, row, "source_manifest.csv", "source_id")
        if sid in ids:
            e(
                "source_id_duplicate",
                at("source_manifest.csv", row, "source_id"),
                "source_id must be unique.",
            )
        if sid and not is_unknown(sid):
            ids.add(sid)
        for field in ("source_name", "source_kind", "clock_basis", "reference_scheme"):
            require(report, row, "source_manifest.csv", field)
        digest = value(row.get("sha256"))
        if not digest or is_unknown(digest):
            if reason(row, "sha256"):
                p(
                    "source_hash_unknown",
                    at("source_manifest.csv", row, "sha256"),
                    "Record hash when available.",
                )
            else:
                e(
                    "source_hash_unexplained",
                    at("source_manifest.csv", row, "sha256"),
                    "Add a hash or 'sha256: reason'.",
                )
        elif not SHA256.fullmatch(digest):
            e(
                "source_hash_invalid",
                at("source_manifest.csv", row, "sha256"),
                "SHA-256 needs 64 hex characters.",
            )
        preserved = value(row.get("read_only_preserved")).casefold()
        if preserved not in {"yes", "no", "unknown"}:
            e(
                "source_preservation_invalid",
                at("source_manifest.csv", row, "read_only_preserved"),
                "Use yes, no, or unknown.",
            )
        elif preserved != "yes":
            p(
                "source_not_immutable",
                at("source_manifest.csv", row, "read_only_preserved"),
                "Preserve or document the source limitation.",
            )
            if preserved == "unknown" and not reason(row, "read_only_preserved"):
                e(
                    "unknown_reason_missing",
                    at("source_manifest.csv", row, "read_only_preserved"),
                    "Add 'read_only_preserved: reason'.",
                )
    return ids


def check_source_ref(row: dict[str, Any], file: str, sources: set[str], report: Report) -> None:
    e, at = report.error, loc
    sid = require(report, row, file, "source_id")
    require(report, row, file, "source_reference")
    if sid and not is_unknown(sid) and sid not in sources:
        e(
            "source_reference_unknown",
            at(file, row, "source_id"),
            "Add source_id to the manifest.",
        )


def check_visits(rows: list[dict[str, str]], sources: set[str], report: Report) -> dict[str, Any]:
    e, p, at = report.error, report.pending, loc
    if not rows:
        p("visits_empty", "visits.csv", "Add actual observation visits.")
    visits: dict[str, Any] = {}
    for row in rows:
        vid = require(report, row, "visits.csv", "visit_id")
        if not vid or is_unknown(vid):
            e(
                "visit_id_invalid",
                at("visits.csv", row, "visit_id"),
                "Use a stable anonymous visit ID.",
            )
            continue
        if vid in visits:
            e("visit_id_duplicate", at("visits.csv", row, "visit_id"), "One row per visit ID.")
        visits[vid] = row
        for field in (
            "visit_date",
            "day_type",
            "observation_start_at",
            "observation_end_at",
            "completeness",
            "initial_shop_state",
            "reported_staff_by_pool",
            "clock_precision",
            "clock_basis",
            "observer_id",
        ):
            require(report, row, "visits.csv", field)
        day = value(row.get("visit_date"))
        if day and not is_unknown(day):
            try:
                date.fromisoformat(day)
            except ValueError:
                e("visit_date_invalid", at("visits.csv", row, "visit_date"), "Use YYYY-MM-DD.")
        start = timestamp(
            report, row.get("observation_start_at"), at("visits.csv", row, "observation_start_at")
        )
        end = timestamp(
            report, row.get("observation_end_at"), at("visits.csv", row, "observation_end_at")
        )
        ordered(report, start, end, at("visits.csv", row), "visit_chronology_invalid")
        if start and day and not is_unknown(day) and start.date().isoformat() != day:
            e(
                "visit_date_mismatch",
                at("visits.csv", row, "visit_date"),
                "Date must match local observation start date.",
            )
        coverage = value(row.get("completeness")).casefold()
        if coverage not in {"complete", "partial", "unknown"}:
            e(
                "visit_completeness_invalid",
                at("visits.csv", row, "completeness"),
                "Use complete, partial, or unknown.",
            )
        elif coverage != "complete":
            if not reason(row, "completeness"):
                e(
                    "unknown_reason_missing",
                    at("visits.csv", row, "completeness"),
                    "Add 'completeness: reason'.",
                )
            else:
                p(
                    "visit_coverage_incomplete",
                    at("visits.csv", row),
                    "Review incomplete coverage.",
                )
        check_source_ref(row, "visits.csv", sources, report)
    return visits


def check_orders(
    rows: list[dict[str, str]], visits: dict[str, Any], sources: set[str], report: Report
) -> dict[tuple[str, str], Any]:
    e, p, at = report.error, report.pending, loc
    if not rows:
        p("orders_empty", "orders.csv", "No order rows yet.")
    orders: dict[tuple[str, str], Any] = {}
    for row in rows:
        vid, oid = (
            require(report, row, "orders.csv", "visit_id"),
            require(report, row, "orders.csv", "order_id"),
        )
        if vid not in visits:
            e(
                "visit_reference_unknown",
                at("orders.csv", row, "visit_id"),
                "Visit is not in visits.csv.",
            )
        key = (vid, oid)
        if key in orders:
            e(
                "order_id_duplicate",
                at("orders.csv", row, "order_id"),
                "Order ID must be unique within visit.",
            )
        orders[key] = row
        link, group = value(row.get("group_link_status")).casefold(), value(row.get("group_id"))
        if link == "observed" and not group:
            e(
                "group_id_missing",
                at("orders.csv", row, "group_id"),
                "Observed group needs group_id.",
            )
        elif link == "observed" and is_unknown(group):
            e(
                "observed_group_id_unknown",
                at("orders.csv", row, "group_id"),
                "Observed group ID cannot be an unknown marker.",
            )
        elif link == "not_applicable" and group:
            e(
                "group_link_conflict",
                at("orders.csv", row, "group_id"),
                "Leave not-applicable group_id blank.",
            )
        elif link == "unknown":
            if group or not reason(row, "group_id"):
                e(
                    "group_link_unknown_unexplained",
                    at("orders.csv", row, "group_id"),
                    "Leave blank and add 'group_id: reason'.",
                )
            else:
                p("group_link_unknown", at("orders.csv", row), "Group link remains unknown.")
        elif link not in {"observed", "not_applicable"}:
            e(
                "group_link_status_invalid",
                at("orders.csv", row, "group_link_status"),
                "Use observed, unknown, or not_applicable.",
            )
        size_state, size = (
            value(row.get("group_size_status")).casefold(),
            value(row.get("observed_group_size")),
        )
        if size_state == "observed":
            try:
                if int(size) <= 0 or str(int(size)) != size:
                    raise ValueError
            except ValueError:
                e(
                    "group_size_invalid",
                    at("orders.csv", row, "observed_group_size"),
                    "Use a positive whole-number size from observation.",
                )
        elif size_state == "unknown":
            if size:
                e(
                    "unknown_group_size_has_value",
                    at("orders.csv", row, "observed_group_size"),
                    "Unknown size must stay blank, not zero.",
                )
            if not reason(row, "observed_group_size"):
                e(
                    "unknown_reason_missing",
                    at("orders.csv", row, "observed_group_size"),
                    "Add 'observed_group_size: reason'.",
                )
            else:
                p(
                    "group_size_unknown",
                    at("orders.csv", row),
                    "Unknown size remains unavailable.",
                )
        else:
            e(
                "group_size_status_invalid",
                at("orders.csv", row, "group_size_status"),
                "Use observed or unknown.",
            )
        arrival_state = value(row.get("arrival_status")).casefold()
        arrival_text = value(row.get("arrival_at"))
        arrival = (
            timestamp(report, arrival_text, at("orders.csv", row, "arrival_at"))
            if arrival_text
            else None
        )
        if arrival_state == "observed":
            if arrival is None:
                e(
                    "arrival_timestamp_missing",
                    at("orders.csv", row, "arrival_at"),
                    "Observed arrival needs its timestamp.",
                )
            require(report, row, "orders.csv", "arrival_definition")
        elif arrival_state == "unknown":
            if arrival_text or not reason(row, "arrival_at"):
                e(
                    "arrival_unknown_unexplained",
                    at("orders.csv", row, "arrival_at"),
                    "Leave blank and add 'arrival_at: reason'.",
                )
            else:
                p("arrival_unknown", at("orders.csv", row), "Arrival remains unknown.")
        else:
            e(
                "arrival_status_invalid",
                at("orders.csv", row, "arrival_status"),
                "Use observed or unknown.",
            )
        outcome = value(row.get("outcome")).casefold()
        withdrawal_text, delivery_text = (
            value(row.get("withdrawal_at")),
            value(row.get("final_delivery_at")),
        )
        withdrawal = (
            timestamp(report, withdrawal_text, at("orders.csv", row, "withdrawal_at"))
            if withdrawal_text
            else None
        )
        delivery = (
            timestamp(report, delivery_text, at("orders.csv", row, "final_delivery_at"))
            if delivery_text
            else None
        )
        if outcome == "delivered" and delivery is None:
            e(
                "delivery_timestamp_missing",
                at("orders.csv", row, "final_delivery_at"),
                "Delivered order needs final delivery time.",
            )
        elif outcome == "withdrawn" and withdrawal is None:
            e(
                "withdrawal_timestamp_missing",
                at("orders.csv", row, "withdrawal_at"),
                "Withdrawal needs observed time.",
            )
        elif outcome == "unknown":
            if not reason(row, "outcome"):
                e(
                    "unknown_reason_missing",
                    at("orders.csv", row, "outcome"),
                    "Add 'outcome: reason'.",
                )
            else:
                p("outcome_unknown", at("orders.csv", row), "Outcome remains unknown.")
        elif outcome not in {"delivered", "withdrawn", "still_present"}:
            e(
                "outcome_invalid",
                at("orders.csv", row, "outcome"),
                "Use delivered, withdrawn, still_present, or unknown.",
            )
        if (
            (outcome in {"delivered", "still_present"} and withdrawal_text)
            or (outcome in {"withdrawn", "still_present"} and delivery_text)
            or (outcome == "unknown" and (withdrawal_text or delivery_text))
        ):
            e(
                "outcome_timestamp_conflict",
                at("orders.csv", row),
                "Outcome conflicts with event timestamp.",
            )
        ordered(
            report,
            arrival,
            withdrawal if outcome == "withdrawn" else delivery,
            at("orders.csv", row),
            "order_chronology_invalid",
        )
        censoring = value(row.get("censoring_status")).casefold()
        if censoring not in {"none", "left", "right", "both", "unknown"}:
            e(
                "censoring_status_invalid",
                at("orders.csv", row, "censoring_status"),
                "Use none, left, right, both, or unknown.",
            )
        elif censoring == "unknown":
            if not reason(row, "censoring_status"):
                e(
                    "unknown_reason_missing",
                    at("orders.csv", row, "censoring_status"),
                    "Add 'censoring_status: reason'.",
                )
            else:
                p("censoring_unknown", at("orders.csv", row), "Censoring remains unknown.")
        check_source_ref(row, "orders.csv", sources, report)
    return orders


def check_people(
    rows: list[dict[str, str]],
    orders: dict[tuple[str, str], Any],
    sources: set[str],
    report: Report,
) -> None:
    e, p, at = report.error, report.pending, loc
    if not rows:
        p("order_people_empty", "order_people.csv", "Record observed person/order links only.")
    seen: set[tuple[str, str, str]] = set()
    for row in rows:
        vid, oid = (
            require(report, row, "order_people.csv", "visit_id"),
            require(report, row, "order_people.csv", "order_id"),
        )
        if (vid, oid) not in orders:
            e(
                "order_reference_unknown",
                at("order_people.csv", row, "order_id"),
                "Order is not in the same visit.",
            )
        person, state = value(row.get("person_id")), value(row.get("link_status")).casefold()
        if state == "observed":
            if not person:
                e(
                    "person_id_missing",
                    at("order_people.csv", row, "person_id"),
                    "Observed link needs person_id.",
                )
            elif is_unknown(person):
                e(
                    "observed_person_id_unknown",
                    at("order_people.csv", row, "person_id"),
                    "Observed person ID cannot be an unknown marker.",
                )
            if (vid, oid, person) in seen:
                e(
                    "person_order_link_duplicate",
                    at("order_people.csv", row),
                    "Duplicate person/order link.",
                )
            seen.add((vid, oid, person))
            require(report, row, "order_people.csv", "link_basis")
        elif state == "unknown":
            if person or not reason(row, "person_id"):
                e(
                    "person_link_unknown_unexplained",
                    at("order_people.csv", row, "person_id"),
                    "Leave blank and add 'person_id: reason'.",
                )
            else:
                p(
                    "person_link_unknown",
                    at("order_people.csv", row),
                    "Person/order link remains unknown.",
                )
        else:
            e(
                "person_link_status_invalid",
                at("order_people.csv", row, "link_status"),
                "Use observed or unknown.",
            )
        check_source_ref(row, "order_people.csv", sources, report)


def check_segments(
    rows: list[dict[str, str]],
    visits: dict[str, Any],
    orders: dict[tuple[str, str], Any],
    sources: set[str],
    report: Report,
) -> None:
    e, p, at = report.error, report.pending, loc
    if not rows:
        p(
            "worker_segments_empty",
            "worker_segments.csv",
            "Record separate work, wait, preparation, and pause segments.",
        )
    seen: set[tuple[str, str]] = set()
    for row in rows:
        sid = require(report, row, "worker_segments.csv", "segment_id")
        vid = require(report, row, "worker_segments.csv", "visit_id")
        require(report, row, "worker_segments.csv", "worker_id")
        if vid not in visits:
            e(
                "visit_reference_unknown",
                at("worker_segments.csv", row, "visit_id"),
                "Visit is not in visits.csv.",
            )
        if (vid, sid) in seen:
            e(
                "segment_id_duplicate",
                at("worker_segments.csv", row, "segment_id"),
                "segment_id must be unique within visit.",
            )
        seen.add((vid, sid))
        for field in ("pool", "segment_type"):
            require(report, row, "worker_segments.csv", field)
        order_state, oid = (
            value(row.get("order_link_status")).casefold(),
            value(row.get("order_id")),
        )
        if order_state == "observed" and (vid, oid) not in orders:
            e(
                "order_reference_unknown",
                at("worker_segments.csv", row, "order_id"),
                "Order is not in the same visit.",
            )
        elif order_state == "unknown":
            if oid or not reason(row, "order_id"):
                e(
                    "segment_order_link_unexplained",
                    at("worker_segments.csv", row, "order_id"),
                    "Leave blank and add 'order_id: reason'.",
                )
            else:
                p(
                    "segment_order_unknown",
                    at("worker_segments.csv", row),
                    "Order link remains unknown.",
                )
        elif order_state == "not_applicable" and oid:
            e(
                "segment_order_link_conflict",
                at("worker_segments.csv", row, "order_id"),
                "Leave not-applicable order_id blank.",
            )
        elif order_state not in {"observed", "not_applicable"}:
            e(
                "segment_order_status_invalid",
                at("worker_segments.csv", row, "order_link_status"),
                "Use observed, unknown, or not_applicable.",
            )
        state = value(row.get("interval_status")).casefold()
        start_text, end_text = value(row.get("segment_start_at")), value(row.get("segment_end_at"))
        start = (
            timestamp(report, start_text, at("worker_segments.csv", row, "segment_start_at"))
            if start_text
            else None
        )
        end = (
            timestamp(report, end_text, at("worker_segments.csv", row, "segment_end_at"))
            if end_text
            else None
        )
        if state == "observed_complete":
            if start is None or end is None:
                e(
                    "segment_boundary_missing",
                    at("worker_segments.csv", row),
                    "Complete segment needs both times.",
                )
            ordered(
                report, start, end, at("worker_segments.csv", row), "segment_chronology_invalid"
            )
        elif state in {"left_censored", "right_censored", "both_censored"}:
            expected_start, expected_end = state == "right_censored", state == "left_censored"
            if bool(start_text) != expected_start or bool(end_text) != expected_end:
                e(
                    "segment_censoring_conflict",
                    at("worker_segments.csv", row),
                    "Censoring conflicts with blank boundary.",
                )
            else:
                p(
                    "segment_censored",
                    at("worker_segments.csv", row),
                    "Unobserved boundary remains blank.",
                )
        elif state == "unknown":
            if not reason(row, "interval_status"):
                e(
                    "unknown_reason_missing",
                    at("worker_segments.csv", row, "interval_status"),
                    "Add 'interval_status: reason'.",
                )
            else:
                p(
                    "segment_interval_unknown",
                    at("worker_segments.csv", row),
                    "Interval remains unknown.",
                )
        else:
            e(
                "interval_status_invalid",
                at("worker_segments.csv", row, "interval_status"),
                "Use observed_complete, censored status, or unknown.",
            )
        check_source_ref(row, "worker_segments.csv", sources, report)


def check_split(
    rows: list[dict[str, str]], visits: dict[str, Any], report: Report
) -> dict[str, str]:
    e, p, at = report.error, report.pending, loc
    if not rows:
        p("visit_split_empty", "visit_split.csv", "Assign complete visits before fitting.")
    grouped: dict[str, list[tuple[str, dict[str, str]]]] = {}
    for row in rows:
        vid, subset = (
            require(report, row, "visit_split.csv", "visit_id"),
            value(row.get("subset")).casefold(),
        )
        grouped.setdefault(vid, []).append((subset, row))
        if vid not in visits:
            e(
                "visit_reference_unknown",
                at("visit_split.csv", row, "visit_id"),
                "Visit is not in visits.csv.",
            )
        if subset not in {"calibration", "validation", "excluded", "pending"}:
            e(
                "split_subset_invalid",
                at("visit_split.csv", row, "subset"),
                "Use calibration, validation, excluded, or pending.",
            )
        if subset == "pending":
            p("split_pending", at("visit_split.csv", row), "Assign or exclude the whole visit.")
        elif subset in {"calibration", "validation", "excluded"}:
            for field in ("split_version", "rationale", "frozen_by_id"):
                if not value(row.get(field)):
                    p(
                        "split_detail_missing",
                        at("visit_split.csv", row, field),
                        "Record the actual split decision.",
                    )
            if value(row.get("decision_status")).casefold() != "approved":
                p(
                    "split_not_frozen",
                    at("visit_split.csv", row),
                    "Freeze and approve the split before estimating.",
                )
            if (
                timestamp(report, row.get("frozen_at"), at("visit_split.csv", row, "frozen_at"))
                is None
            ):
                p(
                    "split_freeze_time_missing",
                    at("visit_split.csv", row, "frozen_at"),
                    "Record actual freeze time.",
                )
    split: dict[str, str] = {}
    for vid, entries in grouped.items():
        subsets = {subset for subset, _ in entries}
        if {"calibration", "validation"} <= subsets:
            e(
                "split_visit_overlap",
                f"visit_split.csv:{vid}",
                "Assign the whole visit to one subset only.",
            )
        elif len(entries) > 1:
            e("split_visit_duplicate", f"visit_split.csv:{vid}", "Use one split row per visit.")
        elif len(subsets) == 1:
            split[vid] = next(iter(subsets))
    for vid in visits.keys() - grouped.keys():
        p(
            "split_assignment_missing",
            f"visit_split.csv:{vid}",
            "Assign or exclude this whole visit.",
        )
    for subset in ("calibration", "validation"):
        if subset not in split.values():
            p(
                f"{subset}_visits_missing",
                "visit_split.csv",
                f"No whole visit assigned to {subset}.",
            )
    return split


def split_ids(raw: Any) -> list[str]:
    return [part.strip() for part in value(raw).split(";") if part.strip()]


def reference_visits(tables: dict[str, list[dict[str, str]]]) -> dict[tuple[str, str], set[str]]:
    index: dict[tuple[str, str], set[str]] = {}
    for filename in ("visits.csv", "orders.csv", "order_people.csv", "worker_segments.csv"):
        for row in tables[filename]:
            source_id = value(row.get("source_id"))
            reference = value(row.get("source_reference"))
            visit_id = value(row.get("visit_id"))
            if all((source_id, reference, visit_id)) and not any(
                is_unknown(part) for part in (source_id, reference, visit_id)
            ):
                index.setdefault((source_id, reference), set()).add(visit_id)
    return index


def check_parameters(
    rows: list[dict[str, str]],
    visits: dict[str, Any],
    split: dict[str, str],
    sources: set[str],
    record_visits: dict[tuple[str, str], set[str]],
    report: Report,
) -> dict[str, str]:
    e, p, at = report.error, report.pending, loc
    if not rows:
        p(
            "parameter_provenance_empty",
            "parameter_provenance.csv",
            "Record parameter provenance; no fitting is performed.",
        )
    states: dict[str, str] = {}
    for row in rows:
        pid, state = (
            require(report, row, "parameter_provenance.csv", "parameter_id"),
            value(row.get("decision_status")).casefold(),
        )
        if pid in states:
            e(
                "parameter_id_duplicate",
                at("parameter_provenance.csv", row, "parameter_id"),
                "parameter_id must be unique.",
            )
        states[pid] = state
        if state not in {"pending", "candidate", "approved"}:
            e(
                "parameter_status_invalid",
                at("parameter_provenance.csv", row, "decision_status"),
                "Use pending, candidate, or approved.",
            )
        used = split_ids(row.get("source_visit_ids"))
        if not used:
            p(
                "parameter_visits_missing",
                at("parameter_provenance.csv", row, "source_visit_ids"),
                "List source visit IDs.",
            )
        for vid in used:
            if vid not in visits:
                e(
                    "parameter_visit_unknown",
                    at("parameter_provenance.csv", row, "source_visit_ids"),
                    f"Visit {vid!r} is unknown.",
                )
            elif split.get(vid) != "calibration":
                e(
                    "parameter_noncalibration_source",
                    at("parameter_provenance.csv", row, "source_visit_ids"),
                    f"Visit {vid!r} is not calibration data.",
                )
        refs = split_ids(row.get("source_record_references"))
        declared_visits = set(used)
        if not refs:
            p(
                "parameter_references_missing",
                at("parameter_provenance.csv", row, "source_record_references"),
                "List source_id:record-reference entries.",
            )
        for ref in refs:
            source_id, sep, item = ref.partition(":")
            if not sep or not item or source_id not in sources:
                e(
                    "parameter_reference_invalid",
                    at("parameter_provenance.csv", row, "source_record_references"),
                    "Reference must match source_id:record-reference.",
                )
                continue
            actual_visits = record_visits.get((source_id, item), set())
            if not actual_visits:
                e(
                    "parameter_reference_unresolved",
                    at("parameter_provenance.csv", row, "source_record_references"),
                    "Reference does not match a recorded visit row.",
                )
            elif len(actual_visits) > 1:
                e(
                    "parameter_reference_ambiguous",
                    at("parameter_provenance.csv", row, "source_record_references"),
                    "Reference resolves to more than one visit.",
                )
            else:
                actual_visit = next(iter(actual_visits))
                if actual_visit not in declared_visits:
                    e(
                        "parameter_reference_visit_mismatch",
                        at("parameter_provenance.csv", row, "source_record_references"),
                        f"Reference belongs to {actual_visit!r}, outside source_visit_ids.",
                    )
                elif split.get(actual_visit) != "calibration":
                    e(
                        "parameter_noncalibration_reference",
                        at("parameter_provenance.csv", row, "source_record_references"),
                        f"Reference belongs to non-calibration visit {actual_visit!r}.",
                    )
        if state == "approved":
            for field in (
                "parameter_name",
                "value",
                "unit",
                "method",
                "uncertainty",
                "approved_by_id",
            ):
                if not populated(row.get(field)):
                    e(
                        "parameter_approval_incomplete",
                        at("parameter_provenance.csv", row, field),
                        "Approved parameter needs value and provenance.",
                    )
            if (
                timestamp(
                    report,
                    row.get("approved_at"),
                    at("parameter_provenance.csv", row, "approved_at"),
                )
                is None
            ):
                e(
                    "parameter_approval_time_missing",
                    at("parameter_provenance.csv", row, "approved_at"),
                    "Record actual approval time.",
                )
        else:
            p(
                "parameter_not_approved",
                at("parameter_provenance.csv", row),
                "Parameter remains pending or candidate.",
            )
    return states


def check_scenarios(rows: list[dict[str, str]], params: dict[str, str], report: Report) -> None:
    e, p, at = report.error, report.pending, loc
    if not rows:
        p(
            "scenario_design_empty",
            "scenario_design.csv",
            "Document comparisons before interpreting output.",
        )
    seen: set[tuple[str, str]] = set()
    for row in rows:
        exp, scen = (
            require(report, row, "scenario_design.csv", "experiment_id"),
            require(report, row, "scenario_design.csv", "scenario_id"),
        )
        if (exp, scen) in seen:
            e(
                "scenario_id_duplicate",
                at("scenario_design.csv", row),
                "Experiment/scenario pair must be unique.",
            )
        seen.add((exp, scen))
        state = value(row.get("decision_status")).casefold()
        if state == "pending":
            p(
                "scenario_design_pending",
                at("scenario_design.csv", row),
                "Scenario design is not approved.",
            )
        elif state != "approved":
            e(
                "scenario_status_invalid",
                at("scenario_design.csv", row, "decision_status"),
                "Use pending or approved.",
            )
        else:
            for field in (
                "comparison_role",
                "configuration_reference",
                "parameter_ids",
                "demand_tape_policy",
                "replication_count",
                "estimand",
                "output_measures",
                "rationale",
                "approved_by_id",
            ):
                if not populated(row.get(field)):
                    e(
                        "scenario_approval_incomplete",
                        at("scenario_design.csv", row, field),
                        "Approved design needs its actual value.",
                    )
            if not SHA256.fullmatch(value(row.get("configuration_sha256"))):
                e(
                    "configuration_hash_invalid",
                    at("scenario_design.csv", row, "configuration_sha256"),
                    "Use a 64-character SHA-256 hash.",
                )
            try:
                if int(value(row.get("replication_count"))) <= 0:
                    raise ValueError
            except ValueError:
                e(
                    "replication_count_invalid",
                    at("scenario_design.csv", row, "replication_count"),
                    "Use the actual positive whole-number count.",
                )
            if (
                timestamp(
                    report, row.get("approved_at"), at("scenario_design.csv", row, "approved_at")
                )
                is None
            ):
                e(
                    "scenario_approval_time_missing",
                    at("scenario_design.csv", row, "approved_at"),
                    "Record actual approval time.",
                )
        for pid in split_ids(row.get("parameter_ids")):
            if pid not in params:
                e(
                    "scenario_parameter_unknown",
                    at("scenario_design.csv", row, "parameter_ids"),
                    f"Parameter {pid!r} is missing.",
                )
            elif params[pid] != "approved":
                e(
                    "scenario_parameter_unapproved",
                    at("scenario_design.csv", row, "parameter_ids"),
                    f"Parameter {pid!r} is not approved.",
                )


def check(data_dir: Path) -> tuple[dict[str, Any], int]:
    report = Report()
    e = report.error
    if not data_dir.is_dir():
        e("data_dir_missing", "--data-dir", "Choose a folder containing field-kit files.")
        return report.output()
    tables = {name: read_csv(data_dir, name, report) for name in HEADERS}
    check_plan(read_plan(data_dir, report), report)
    sources = check_sources(tables["source_manifest.csv"], report)
    visits = check_visits(tables["visits.csv"], sources, report)
    orders = check_orders(tables["orders.csv"], visits, sources, report)
    check_people(tables["order_people.csv"], orders, sources, report)
    check_segments(tables["worker_segments.csv"], visits, orders, sources, report)
    split = check_split(tables["visit_split.csv"], visits, report)
    record_visits = reference_visits(tables)
    params = check_parameters(
        tables["parameter_provenance.csv"], visits, split, sources, record_visits, report
    )
    check_scenarios(tables["scenario_design.csv"], params, report)
    return report.output()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check evidence structure; no fitting or validation."
    )
    parser.add_argument(
        "--data-dir", required=True, type=Path, help="Folder with CSVs and analysis_plan.json"
    )
    args = parser.parse_args(argv)
    result, code = check(args.data_dir)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
