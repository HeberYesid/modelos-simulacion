"""Public CLI checks for the empirical evidence-preparation kit.

All populated records created here are synthetic test fixtures. They are not
Boquitas observations or field results.
"""

from __future__ import annotations

import csv
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CLI = REPO_ROOT / "scripts" / "check_empirical_readiness.py"

HEADERS = {
    "visits.csv": [
        "visit_id",
        "visit_date",
        "day_type",
        "observation_start_at",
        "observation_end_at",
        "completeness",
        "initial_shop_state",
        "reported_staff_by_pool",
        "clock_precision",
        "clock_basis",
        "source_id",
        "source_reference",
        "observer_id",
        "unknown_reason",
    ],
    "orders.csv": [
        "visit_id",
        "order_id",
        "group_id",
        "group_link_status",
        "observed_group_size",
        "group_size_status",
        "arrival_at",
        "arrival_status",
        "arrival_definition",
        "outcome",
        "withdrawal_at",
        "final_delivery_at",
        "censoring_status",
        "source_id",
        "source_reference",
        "unknown_reason",
    ],
    "order_people.csv": [
        "visit_id",
        "order_id",
        "person_id",
        "link_status",
        "link_basis",
        "source_id",
        "source_reference",
        "unknown_reason",
    ],
    "worker_segments.csv": [
        "segment_id",
        "visit_id",
        "worker_id",
        "pool",
        "order_id",
        "order_link_status",
        "segment_type",
        "segment_start_at",
        "segment_end_at",
        "interval_status",
        "payment_medium",
        "source_id",
        "source_reference",
        "unknown_reason",
    ],
    "source_manifest.csv": [
        "source_id",
        "source_name",
        "source_kind",
        "sha256",
        "read_only_preserved",
        "clock_basis",
        "reference_scheme",
        "unknown_reason",
    ],
    "visit_split.csv": [
        "visit_id",
        "subset",
        "split_version",
        "rationale",
        "frozen_by_id",
        "frozen_at",
        "decision_status",
    ],
    "parameter_provenance.csv": [
        "parameter_id",
        "parameter_name",
        "value",
        "unit",
        "method",
        "source_visit_ids",
        "source_record_references",
        "uncertainty",
        "decision_status",
        "approved_by_id",
        "approved_at",
        "unknown_reason",
    ],
    "scenario_design.csv": [
        "experiment_id",
        "scenario_id",
        "comparison_role",
        "configuration_reference",
        "configuration_sha256",
        "parameter_ids",
        "demand_tape_policy",
        "replication_count",
        "estimand",
        "output_measures",
        "rationale",
        "decision_status",
        "approved_by_id",
        "approved_at",
        "unknown_reason",
    ],
}


def make_data_dir(path: Path) -> Path:
    path.mkdir()
    for name, headers in HEADERS.items():
        with (path / name).open("w", encoding="utf-8", newline="") as stream:
            csv.writer(stream).writerow(headers)
    plan = json.loads(
        (REPO_ROOT / "docs" / "field-kit" / "templates" / "analysis_plan.json").read_text(
            encoding="utf-8"
        )
    )
    (path / "analysis_plan.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")
    return path


def append_csv(path: Path, name: str, row: dict[str, str]) -> None:
    with (path / name).open("a", encoding="utf-8", newline="") as stream:
        csv.DictWriter(stream, fieldnames=HEADERS[name]).writerow(row)


def replace_csv_field(path: Path, field: str, replacement: str, row_index: int = 0) -> None:
    with path.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        headers = reader.fieldnames
        rows = list(reader)
    assert headers is not None
    rows[row_index][field] = replacement
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def run_cli(data_dir: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CLI), "--data-dir", str(data_dir)],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def payload(result: subprocess.CompletedProcess[str]) -> dict[str, object]:
    return json.loads(result.stdout)


def test_header_only_templates_are_not_ready() -> None:
    templates = REPO_ROOT / "docs" / "field-kit" / "templates"
    for filename in HEADERS:
        with (templates / filename).open(encoding="utf-8", newline="") as stream:
            assert list(csv.DictReader(stream)) == []
    plan = json.loads((templates / "analysis_plan.json").read_text(encoding="utf-8"))
    assert plan["decisions"]["sample_targets"]["status"] == "unset"
    assert plan["decisions"]["target_precision"]["target"] is None
    assert plan["decisions"]["tolerances"]["status"] == "unset"

    result = run_cli(templates)

    assert result.returncode == 2
    report = payload(result)
    assert report["status"] == "NOT_READY"
    assert report["empirical_validity"] == "NOT_ASSESSED"


def test_invalid_visit_chronology_is_distinct_from_not_ready(tmp_path: Path) -> None:
    data_dir = make_data_dir(tmp_path / "bad-chronology")
    append_csv(
        data_dir,
        "visits.csv",
        {
            "visit_id": "TEST-VISIT-1",
            "visit_date": "2026-01-02",
            "day_type": "test-only",
            "observation_start_at": "2026-01-02T18:00:00-05:00",
            "observation_end_at": "2026-01-02T17:00:00-05:00",
            "completeness": "complete",
            "initial_shop_state": "unknown",
            "reported_staff_by_pool": "unknown",
            "clock_precision": "minute",
            "clock_basis": "test clock UTC-05:00",
            "source_id": "TEST-SOURCE",
            "source_reference": "test row",
            "observer_id": "TEST-OBSERVER",
            "unknown_reason": "test fixture only",
        },
    )

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(issue["code"] == "visit_chronology_invalid" for issue in report["issues"])


def test_a_visit_cannot_be_in_calibration_and_validation(tmp_path: Path) -> None:
    data_dir = make_data_dir(tmp_path / "overlapping-split")
    append_csv(
        data_dir,
        "visits.csv",
        {
            "visit_id": "TEST-VISIT-1",
            "visit_date": "2026-01-02",
            "day_type": "test-only",
            "observation_start_at": "2026-01-02T17:00:00-05:00",
            "observation_end_at": "2026-01-02T18:00:00-05:00",
            "completeness": "complete",
            "initial_shop_state": "unknown",
            "reported_staff_by_pool": "unknown",
            "clock_precision": "minute",
            "clock_basis": "test clock UTC-05:00",
            "source_id": "TEST-SOURCE",
            "source_reference": "test row",
            "observer_id": "TEST-OBSERVER",
            "unknown_reason": "test fixture only",
        },
    )
    base = {
        "visit_id": "TEST-VISIT-1",
        "split_version": "TEST-SPLIT",
        "rationale": "test fixture only",
        "frozen_by_id": "TEST-REVIEWER",
        "frozen_at": "2026-01-03T12:00:00-05:00",
        "decision_status": "approved",
    }
    append_csv(data_dir, "visit_split.csv", {**base, "subset": "calibration"})
    append_csv(data_dir, "visit_split.csv", {**base, "subset": "validation"})

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(issue["code"] == "split_visit_overlap" for issue in report["issues"])


def test_explicitly_unknown_group_size_is_not_replaced_by_zero(tmp_path: Path) -> None:
    data_dir = make_data_dir(tmp_path / "unknown-group-size")
    append_csv(
        data_dir,
        "visits.csv",
        {
            "visit_id": "TEST-VISIT-1",
            "visit_date": "2026-01-02",
            "day_type": "test-only",
            "observation_start_at": "2026-01-02T17:00:00-05:00",
            "observation_end_at": "2026-01-02T18:00:00-05:00",
            "completeness": "complete",
            "initial_shop_state": "unknown",
            "reported_staff_by_pool": "unknown",
            "clock_precision": "minute",
            "clock_basis": "test clock UTC-05:00",
            "source_id": "unknown",
            "source_reference": "unknown",
            "observer_id": "TEST-OBSERVER",
            "unknown_reason": (
                "initial_shop_state: test fixture only; "
                "reported_staff_by_pool: test fixture only; "
                "source_id: test fixture only; source_reference: test fixture only"
            ),
        },
    )
    append_csv(
        data_dir,
        "orders.csv",
        {
            "visit_id": "TEST-VISIT-1",
            "order_id": "TEST-ORDER-1",
            "group_id": "",
            "group_link_status": "unknown",
            "observed_group_size": "",
            "group_size_status": "unknown",
            "arrival_at": "",
            "arrival_status": "unknown",
            "arrival_definition": "",
            "outcome": "unknown",
            "withdrawal_at": "",
            "final_delivery_at": "",
            "censoring_status": "unknown",
            "source_id": "unknown",
            "source_reference": "unknown",
            "unknown_reason": (
                "group_id: test fixture only; observed_group_size: test fixture only; "
                "arrival_at: test fixture only; outcome: test fixture only; "
                "censoring_status: test fixture only; source_id: test fixture only; "
                "source_reference: test fixture only"
            ),
        },
    )

    result = run_cli(data_dir)

    assert result.returncode == 2
    report = payload(result)
    assert report["status"] == "NOT_READY"
    assert any(issue["code"] == "group_size_unknown" for issue in report["issues"])
    assert not any(issue["code"] == "unknown_group_size_has_value" for issue in report["issues"])


def test_parameter_sources_cannot_include_a_validation_visit(tmp_path: Path) -> None:
    data_dir = make_data_dir(tmp_path / "validation-source")
    append_csv(
        data_dir,
        "visits.csv",
        {
            "visit_id": "TEST-VALIDATION-VISIT",
            "visit_date": "2026-01-02",
            "day_type": "test-only",
            "observation_start_at": "2026-01-02T17:00:00-05:00",
            "observation_end_at": "2026-01-02T18:00:00-05:00",
            "completeness": "complete",
            "initial_shop_state": "known empty (test only)",
            "reported_staff_by_pool": "test only",
            "clock_precision": "minute",
            "clock_basis": "test clock UTC-05:00",
            "source_id": "unknown",
            "source_reference": "unknown",
            "observer_id": "TEST-OBSERVER",
            "unknown_reason": "source_id: test fixture only; source_reference: test fixture only",
        },
    )
    append_csv(
        data_dir,
        "visit_split.csv",
        {
            "visit_id": "TEST-VALIDATION-VISIT",
            "subset": "validation",
            "split_version": "TEST-SPLIT",
            "rationale": "test fixture only",
            "frozen_by_id": "TEST-REVIEWER",
            "frozen_at": "2026-01-01T12:00:00-05:00",
            "decision_status": "approved",
        },
    )
    append_csv(
        data_dir,
        "parameter_provenance.csv",
        {
            "parameter_id": "TEST-PARAMETER",
            "parameter_name": "test only",
            "value": "test only",
            "unit": "test only",
            "method": "test only",
            "source_visit_ids": "TEST-VALIDATION-VISIT",
            "source_record_references": "TEST-SOURCE:row-1",
            "uncertainty": "test only",
            "decision_status": "candidate",
            "approved_by_id": "",
            "approved_at": "",
            "unknown_reason": "",
        },
    )

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(issue["code"] == "parameter_noncalibration_source" for issue in report["issues"])


def test_parameter_record_reference_must_match_declared_calibration_visits(
    tmp_path: Path,
) -> None:
    data_dir = make_structurally_ready_data_dir(tmp_path / "test-only-reference-visit-mismatch")
    parameter_path = data_dir / "parameter_provenance.csv"
    with parameter_path.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream)
        headers = reader.fieldnames
        rows = list(reader)
    assert headers is not None
    rows[0]["source_record_references"] = "TEST-SOURCE:order-2"
    with parameter_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(
        issue["code"] == "parameter_reference_visit_mismatch" for issue in report["issues"]
    ), report["issues"]


def test_parameter_reference_ambiguous_across_visits_is_invalid(tmp_path: Path) -> None:
    data_dir = make_structurally_ready_data_dir(tmp_path / "test-only-ambiguous-reference")
    replace_csv_field(data_dir / "orders.csv", "source_reference", "order-1", row_index=1)

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(issue["code"] == "parameter_reference_ambiguous" for issue in report["issues"])


def test_parameter_record_reference_must_resolve_to_observed_source_row(
    tmp_path: Path,
) -> None:
    data_dir = make_structurally_ready_data_dir(tmp_path / "test-only-unresolved-reference")
    replace_csv_field(
        data_dir / "parameter_provenance.csv",
        "source_record_references",
        "TEST-SOURCE:missing-record",
    )

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(issue["code"] == "parameter_reference_unresolved" for issue in report["issues"])


def test_observed_group_link_rejects_unknown_marker(tmp_path: Path) -> None:
    data_dir = make_structurally_ready_data_dir(tmp_path / "test-only-unknown-group-id")
    replace_csv_field(data_dir / "orders.csv", "group_id", "unknown")

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(issue["code"] == "observed_group_id_unknown" for issue in report["issues"])


def test_observed_person_link_rejects_unknown_marker(tmp_path: Path) -> None:
    data_dir = make_structurally_ready_data_dir(tmp_path / "test-only-unknown-person-id")
    replace_csv_field(data_dir / "order_people.csv", "person_id", "unobserved")

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(issue["code"] == "observed_person_id_unknown" for issue in report["issues"])


def test_duplicate_analysis_plan_keys_are_invalid(tmp_path: Path) -> None:
    data_dir = make_data_dir(tmp_path / "duplicate-plan-key")
    plan_path = data_dir / "analysis_plan.json"
    original = plan_path.read_text(encoding="utf-8")
    plan_path.write_text(
        original.replace(
            '"approval_state": "pending"',
            '"approval_state": "pending",\n  "approval_state": "approved"',
            1,
        ),
        encoding="utf-8",
    )

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(issue["code"] == "json_duplicate_key" for issue in report["issues"])


def test_nonstandard_json_numeric_constants_are_invalid(tmp_path: Path) -> None:
    for constant in ("NaN", "Infinity", "-Infinity"):
        data_dir = make_data_dir(tmp_path / f"nonstandard-{constant.replace('-', 'minus')}")
        plan_path = data_dir / "analysis_plan.json"
        original = plan_path.read_text(encoding="utf-8")
        plan_path.write_text(
            original.replace('"target": null', f'"target": {constant}', 1), encoding="utf-8"
        )

        result = run_cli(data_dir)

        assert result.returncode == 1
        report = payload(result)
        assert report["status"] == "INVALID"
        assert any(issue["code"] == "json_nonstandard_constant" for issue in report["issues"]), (
            constant
        )


def test_observation_boundaries_require_clock_time_not_date_only(tmp_path: Path) -> None:
    data_dir = make_data_dir(tmp_path / "date-only-timestamps")
    append_csv(
        data_dir,
        "source_manifest.csv",
        {
            "source_id": "TEST-SOURCE",
            "source_name": "TEST ONLY",
            "source_kind": "TEST ONLY",
            "sha256": "a" * 64,
            "read_only_preserved": "yes",
            "clock_basis": "TEST ONLY UTC-05:00",
            "reference_scheme": "source_id:record",
            "unknown_reason": "",
        },
    )
    append_csv(
        data_dir,
        "visits.csv",
        {
            "visit_id": "TEST-VISIT",
            "visit_date": "2030-01-02",
            "day_type": "TEST ONLY",
            "observation_start_at": "2030-01-02",
            "observation_end_at": "2030-01-02",
            "completeness": "complete",
            "initial_shop_state": "TEST ONLY",
            "reported_staff_by_pool": "TEST ONLY",
            "clock_precision": "day",
            "clock_basis": "TEST ONLY UTC-05:00",
            "source_id": "TEST-SOURCE",
            "source_reference": "visit-test",
            "observer_id": "TEST-OBSERVER",
            "unknown_reason": "",
        },
    )

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(issue["code"] == "timestamp_datetime_required" for issue in report["issues"])


def test_unclosed_csv_quote_is_rejected(tmp_path: Path) -> None:
    data_dir = make_data_dir(tmp_path / "unclosed-csv-quote")
    (data_dir / "visits.csv").write_text(
        ",".join(HEADERS["visits.csv"]) + '\nTEST-VISIT,"unclosed\n',
        encoding="utf-8",
    )

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(issue["code"] == "csv_unreadable" for issue in report["issues"])


def test_short_csv_row_is_rejected_before_missing_cells_are_normalized(
    tmp_path: Path,
) -> None:
    data_dir = make_data_dir(tmp_path / "short-csv-row")
    (data_dir / "visits.csv").write_text(
        ",".join(HEADERS["visits.csv"]) + "\nTEST-VISIT\n", encoding="utf-8"
    )

    result = run_cli(data_dir)

    assert result.returncode == 1
    report = payload(result)
    assert report["status"] == "INVALID"
    assert any(issue["code"] == "csv_row_too_short" for issue in report["issues"])


def make_structurally_ready_data_dir(data_dir: Path) -> Path:
    make_data_dir(data_dir)
    plan_path = data_dir / "analysis_plan.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    plan["study_question"] = "TEST ONLY: exercise the structural CLI path"
    plan["approval_state"] = "approved"
    for role in ("study_owner", "operator"):
        plan["approvals"][role] = {
            "status": "approved",
            "anonymous_id": f"TEST-{role.upper()}",
            "approved_at": "2030-01-01T12:00:00-05:00",
        }
    decisions = plan["decisions"]
    for decision in decisions.values():
        decision["status"] = "approved"
    decisions["event_definitions"].update({"version": "TEST-ONLY", "definitions": {}})
    for event in (
        "arrival",
        "payment_start",
        "active_payment_end",
        "external_confirmation_start",
        "external_confirmation_end",
        "preparation_start",
        "partial_receipt",
        "final_delivery",
        "withdrawal",
    ):
        decisions["event_definitions"]["definitions"][event] = f"TEST ONLY: {event}"
    decisions["event_definitions"]["definitions"]["worker_segment_types"] = ["TEST-ONLY"]
    decisions["privacy_handling"]["reference"] = "TEST ONLY"
    decisions["collection_coverage"].update(
        {
            "day_types": ["TEST-ONLY"],
            "operating_periods": ["TEST-ONLY"],
            "coverage_rationale": "TEST ONLY",
        }
    )
    decisions["calibration_validation_split"].update(
        {"version": "TEST-ONLY", "rationale": "TEST ONLY"}
    )
    decisions["sample_targets"].update(
        {"by_day_type": {"TEST-ONLY": "TEST ONLY"}, "rationale": "TEST ONLY"}
    )
    decisions["target_precision"].update(
        {
            "estimand": "TEST ONLY",
            "target": "TEST ONLY",
            "unit": "TEST ONLY",
            "rationale": "TEST ONLY",
        }
    )
    decisions["tolerances"].update(
        {"metrics": {"TEST-ONLY": "TEST ONLY"}, "rationale": "TEST ONLY"}
    )
    decisions["calibration_method"].update(
        {
            "method": "TEST ONLY",
            "eligible_records_rule": "TEST ONLY",
            "uncertainty_method": "TEST ONLY",
        }
    )
    decisions["censoring_treatment"]["value"] = "TEST ONLY"
    decisions["validation_summaries"].update({"measures": ["TEST-ONLY"], "rationale": "TEST ONLY"})
    decisions["acceptance_criteria"].update({"criteria": ["TEST-ONLY"], "rationale": "TEST ONLY"})
    plan_path.write_text(json.dumps(plan, indent=2), encoding="utf-8")

    append_csv(
        data_dir,
        "source_manifest.csv",
        {
            "source_id": "TEST-SOURCE",
            "source_name": "TEST-ONLY",
            "source_kind": "TEST-ONLY",
            "sha256": "a" * 64,
            "read_only_preserved": "yes",
            "clock_basis": "TEST-ONLY UTC-05:00",
            "reference_scheme": "source_id:row",
            "unknown_reason": "",
        },
    )
    visits = (
        ("TEST-CAL-VISIT", "2030-01-02", "calibration", "1"),
        ("TEST-VAL-VISIT", "2030-01-03", "validation", "2"),
    )
    for visit_id, visit_date, subset, suffix in visits:
        start = f"{visit_date}T17:00:00-05:00"
        end = f"{visit_date}T18:00:00-05:00"
        append_csv(
            data_dir,
            "visits.csv",
            {
                "visit_id": visit_id,
                "visit_date": visit_date,
                "day_type": "TEST-ONLY",
                "observation_start_at": start,
                "observation_end_at": end,
                "completeness": "complete",
                "initial_shop_state": "TEST-ONLY: empty",
                "reported_staff_by_pool": "TEST-ONLY",
                "clock_precision": "minute",
                "clock_basis": "TEST-ONLY UTC-05:00",
                "source_id": "TEST-SOURCE",
                "source_reference": f"visit-{suffix}",
                "observer_id": "TEST-OBSERVER",
                "unknown_reason": "",
            },
        )
        order_id = f"TEST-ORDER-{suffix}"
        group_id = f"TEST-GROUP-{suffix}"
        person_id = f"TEST-PERSON-{suffix}"
        arrival = f"{visit_date}T17:01:00-05:00"
        delivery = f"{visit_date}T17:05:00-05:00"
        append_csv(
            data_dir,
            "orders.csv",
            {
                "visit_id": visit_id,
                "order_id": order_id,
                "group_id": group_id,
                "group_link_status": "observed",
                "observed_group_size": "1",
                "group_size_status": "observed",
                "arrival_at": arrival,
                "arrival_status": "observed",
                "arrival_definition": "TEST ONLY",
                "outcome": "delivered",
                "withdrawal_at": "",
                "final_delivery_at": delivery,
                "censoring_status": "none",
                "source_id": "TEST-SOURCE",
                "source_reference": f"order-{suffix}",
                "unknown_reason": "",
            },
        )
        append_csv(
            data_dir,
            "order_people.csv",
            {
                "visit_id": visit_id,
                "order_id": order_id,
                "person_id": person_id,
                "link_status": "observed",
                "link_basis": "TEST ONLY",
                "source_id": "TEST-SOURCE",
                "source_reference": f"person-{suffix}",
                "unknown_reason": "",
            },
        )
        append_csv(
            data_dir,
            "worker_segments.csv",
            {
                "segment_id": f"TEST-SEGMENT-{suffix}",
                "visit_id": visit_id,
                "worker_id": f"TEST-WORKER-{suffix}",
                "pool": "TEST-ONLY",
                "order_id": order_id,
                "order_link_status": "observed",
                "segment_type": "TEST-ONLY preparation",
                "segment_start_at": arrival,
                "segment_end_at": delivery,
                "interval_status": "observed_complete",
                "payment_medium": "",
                "source_id": "TEST-SOURCE",
                "source_reference": f"segment-{suffix}",
                "unknown_reason": "",
            },
        )
        frozen_at = "2029-12-31T12:00:00-05:00"
        append_csv(
            data_dir,
            "visit_split.csv",
            {
                "visit_id": visit_id,
                "subset": subset,
                "split_version": "TEST-ONLY",
                "rationale": "TEST ONLY",
                "frozen_by_id": "TEST-REVIEWER",
                "frozen_at": frozen_at,
                "decision_status": "approved",
            },
        )

    append_csv(
        data_dir,
        "parameter_provenance.csv",
        {
            "parameter_id": "TEST-PARAMETER",
            "parameter_name": "TEST ONLY",
            "value": "TEST ONLY",
            "unit": "TEST ONLY",
            "method": "TEST ONLY",
            "source_visit_ids": "TEST-CAL-VISIT",
            "source_record_references": "TEST-SOURCE:order-1",
            "uncertainty": "TEST ONLY",
            "decision_status": "approved",
            "approved_by_id": "TEST-REVIEWER",
            "approved_at": "2030-01-04T12:00:00-05:00",
            "unknown_reason": "",
        },
    )
    append_csv(
        data_dir,
        "scenario_design.csv",
        {
            "experiment_id": "TEST-EXPERIMENT",
            "scenario_id": "TEST-SCENARIO",
            "comparison_role": "TEST-ONLY",
            "configuration_reference": "TEST-ONLY",
            "configuration_sha256": "b" * 64,
            "parameter_ids": "TEST-PARAMETER",
            "demand_tape_policy": "TEST-ONLY",
            "replication_count": "1",
            "estimand": "TEST-ONLY",
            "output_measures": "TEST-ONLY",
            "rationale": "TEST ONLY",
            "decision_status": "approved",
            "approved_by_id": "TEST-REVIEWER",
            "approved_at": "2030-01-05T12:00:00-05:00",
            "unknown_reason": "",
        },
    )
    return data_dir


def test_structural_pass_does_not_claim_empirical_validity(tmp_path: Path) -> None:
    data_dir = make_structurally_ready_data_dir(tmp_path / "test-only-structural-pass")
    result = run_cli(data_dir)

    assert result.returncode == 0
    report = payload(result)
    assert report["status"] == "STRUCTURALLY_READY"
    assert report["empirical_validity"] == "NOT_ASSESSED"
    assert report["statistical_adequacy"] == "NOT_ASSESSED"
    assert report["cross_visit_identity_independence"] == "NOT_ASSESSED"
