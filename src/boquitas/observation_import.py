"""Provenance-preserving import of Boquitas station observations."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import statistics
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict

HEADER_FIELDS = (
    "lugar",
    "fecha",
    "tipo_dia",
    "personal",
    "id",
    "hora_llegada",
    "hora_inicio",
    "hora_fin",
    "hora_se_fue",
)
APPROVED_CORRECTION_PROFILE = "boquitas-2026-10-20-v1"
_APPROVED_SOURCE_FINGERPRINTS = {
    "original": "a8ab765ce6f610c085b803adc2e394ec0e42b26626a80749911c4ed84f49462b",
    "corrected": "95095d0e869fdc4b9c294245416a872dd84359a6bc0dda89c15fd10d25077128",
}
_HEADER_TEXT = ",".join(HEADER_FIELDS)
_WHATSAPP_HEADER = re.compile(
    r"^\[[^\]\r\n]+\]\s+[^:\r\n]+:\s*" + re.escape(_HEADER_TEXT) + r"\s*$"
)
_DATE_FORMAT = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_FORMAT = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$")
_POSITIVE_INTEGER = re.compile(r"^[1-9]\d*$")


class ImportIssue(BaseModel):
    """One actionable import or data-quality diagnostic."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    code: str
    severity: Literal["error", "warning", "information"]
    row_keys: tuple[str, ...] = ()
    line_numbers: tuple[int, ...] = ()
    fields: tuple[str, ...] = ()
    affected_view: Literal["raw", "normalized", "both"] = "both"
    message: str


class ObservationRow(BaseModel):
    """One raw observation with typed values and its physical source line."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    raw_fields: tuple[str, ...]
    normalized_fields: tuple[str, ...] | None = None
    station: Literal["caja", "entrega"] | None = None
    observation_date: date | None = None
    day_type: str | None = None
    reported_staff: int | None = None
    local_id: str | None = None
    qualified_key: str | None = None
    arrival_time: time | None = None
    start_time: time | None = None
    end_time: time | None = None
    departure_time: time | None = None
    line_number: int
    validity_flags: tuple[str, ...] = ()
    quality_flags: tuple[str, ...] = ()
    observed_wait_s: int | None = None
    observed_interval_s: int | None = None
    outcome: Literal["served", "withdrawn", "incomplete", "invalid"] = "incomplete"
    group_size: int | None = None
    group_size_reason: Literal["not_observed"] = "not_observed"
    withdrawal_reason: Literal["not_observed"] | None = None


class Correction(BaseModel):
    """One explicit correction or a record that it is already reflected."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    action: Literal["replace_field", "exclude_row"]
    status: Literal["applied", "already_reflected"]
    row_key: str
    field: str | None = None
    before: str | None = None
    after: str | None = None
    reason: str
    profile: str
    line_number: int | None = None


class ExcludedObservation(BaseModel):
    """One source row excluded from a specific duration calculation."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    row_key: str | None = None
    line_number: int
    reason: str


class DurationSummary(BaseModel):
    """Eligible observation intervals with explicit units and denominators."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    label: str
    unit: Literal["seconds"] = "seconds"
    n_used: int
    n_excluded: int
    total_s: int | None = None
    minimum_s: int | None = None
    mean_s: float | None = None
    maximum_s: int | None = None
    excluded_by_reason: tuple[tuple[str, int], ...] = ()
    excluded_rows: tuple[ExcludedObservation, ...] = ()


class ConcurrencyPoint(BaseModel):
    """Rows concurrently active immediately after one timestamp boundary."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    at: time
    concurrent_count: int
    row_keys: tuple[str, ...]
    line_numbers: tuple[int, ...]


class ConcurrencySummary(BaseModel):
    """Half-open interval sweep for one station and observation date."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    interval_kind: Literal["cashier_transaction_window", "preparation_to_final_delivery"]
    peak_concurrency: int
    peak_at: time | None = None
    peak_row_keys: tuple[str, ...] = ()
    reported_capacity: int | None = None
    capacity_consistent: bool
    exceeds_capacity: bool | None = None
    overlap_points: tuple[ConcurrencyPoint, ...] = ()


class StationSummary(BaseModel):
    """Descriptive results for one station-local date segment."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    station: Literal["caja", "entrega"]
    observation_date: date
    record_unit: Literal["observation"] = "observation"
    row_count: int
    served_count: int
    withdrawn_count: int
    incomplete_count: int
    invalid_count: int
    reported_staff: int | None = None
    staff_capacity_consistent: bool
    wait: DurationSummary
    interval: DurationSummary
    concurrency: ConcurrencySummary


class ImportReport(BaseModel):
    """Versioned immutable result from :func:`import_observations`."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    contract_version: Literal[1] = 1
    source_name: str
    source_sha256: str
    correction_policy: str
    policy_status: Literal["none", "applied", "already_reflected", "mismatch", "invalid"]
    fatal_error: bool = False
    raw_rows: tuple[ObservationRow, ...] = ()
    normalized_rows: tuple[ObservationRow, ...] = ()
    excluded_rows: tuple[ObservationRow, ...] = ()
    corrections: tuple[Correction, ...] = ()
    issues: tuple[ImportIssue, ...] = ()
    station_summaries: tuple[StationSummary, ...] = ()


def import_observations(
    content: bytes,
    source_name: str,
    correction_policy: str = "none",
) -> ImportReport:
    """Import UTF-8 CSV/TXT observations without changing the supplied bytes."""

    source_hash = hashlib.sha256(content).hexdigest()
    if correction_policy not in ("none", APPROVED_CORRECTION_PROFILE):
        return ImportReport(
            source_name=source_name,
            source_sha256=source_hash,
            correction_policy=correction_policy,
            policy_status="invalid",
            fatal_error=True,
            issues=(
                ImportIssue(
                    code="unknown_correction_policy",
                    severity="error",
                    fields=("correction_policy",),
                    message=f"Unsupported correction policy: {correction_policy}.",
                ),
            ),
        )

    try:
        text = content.decode("utf-8-sig", errors="strict")
    except UnicodeDecodeError:
        return ImportReport(
            source_name=source_name,
            source_sha256=source_hash,
            correction_policy=correction_policy,
            policy_status="invalid",
            fatal_error=True,
            issues=(
                ImportIssue(
                    code="unsupported_encoding",
                    severity="error",
                    message="Input must be valid UTF-8, optionally with a UTF-8 BOM.",
                ),
            ),
        )

    parsed_rows: list[ObservationRow] = []
    issues: list[ImportIssue] = []
    canonical_records: list[list[str]] = []
    header_seen = False

    for line_number, physical_line in enumerate(text.splitlines(), start=1):
        line = physical_line.rstrip("\r\n")
        stripped = line.strip()
        if not stripped:
            continue

        if _is_header(line):
            header_seen = True
            continue

        try:
            fields = next(csv.reader([line], strict=True))
        except (csv.Error, StopIteration):
            canonical_records.append(["malformed", line])
            if header_seen:
                parsed_rows.append(
                    ObservationRow(
                        raw_fields=(line,),
                        line_number=line_number,
                        validity_flags=("malformed_csv",),
                        outcome="invalid",
                    )
                )
                issues.append(
                    ImportIssue(
                        code="malformed_csv",
                        severity="error",
                        line_numbers=(line_number,),
                        message="The observation line is not valid CSV.",
                    )
                )
            else:
                parsed_rows.append(
                    ObservationRow(
                        raw_fields=(line,),
                        line_number=line_number,
                        validity_flags=("unexpected_preamble", "malformed_csv"),
                        outcome="invalid",
                    )
                )
                issues.append(
                    ImportIssue(
                        code="unexpected_preamble",
                        severity="error",
                        line_numbers=(line_number,),
                        message="Only a recognized header may precede observation rows.",
                    )
                )
            continue

        canonical_records.append(["row", *fields])
        if not header_seen:
            parsed_rows.append(
                ObservationRow(
                    raw_fields=tuple(fields),
                    line_number=line_number,
                    validity_flags=("unexpected_preamble",),
                    outcome="invalid",
                )
            )
            issues.append(
                ImportIssue(
                    code="unexpected_preamble",
                    severity="error",
                    line_numbers=(line_number,),
                    message="Only a recognized header may precede observation rows.",
                )
            )
            continue
        row, row_issues = _parse_observation_row(fields, line_number)
        parsed_rows.append(row)
        issues.extend(row_issues)

    if not header_seen:
        issues.append(
            ImportIssue(
                code="missing_header",
                severity="error",
                message="The required observation header was not found.",
            )
        )
        return ImportReport(
            source_name=source_name,
            source_sha256=source_hash,
            correction_policy=correction_policy,
            policy_status="invalid",
            fatal_error=True,
            raw_rows=tuple(parsed_rows),
            issues=tuple(issues),
        )

    parsed_rows, issues = _mark_duplicate_keys(parsed_rows, issues)

    if correction_policy == "none":
        normalized_rows = tuple(
            row.model_copy(update={"normalized_fields": row.raw_fields}) for row in parsed_rows
        )
        station_summaries, summary_issues = _build_station_summaries(normalized_rows)
        return ImportReport(
            source_name=source_name,
            source_sha256=source_hash,
            correction_policy=correction_policy,
            policy_status="none",
            raw_rows=tuple(parsed_rows),
            normalized_rows=normalized_rows,
            issues=(*issues, *summary_issues),
            station_summaries=station_summaries,
        )

    canonical_payload = json.dumps(
        canonical_records,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    canonical_hash = hashlib.sha256(canonical_payload).hexdigest()
    if canonical_hash == _APPROVED_SOURCE_FINGERPRINTS["original"]:
        return _apply_approved_corrections(
            source_name=source_name,
            source_hash=source_hash,
            raw_rows=tuple(parsed_rows),
            issues=tuple(issues),
        )
    if canonical_hash == _APPROVED_SOURCE_FINGERPRINTS["corrected"]:
        corrections = _already_reflected_corrections(tuple(parsed_rows))
        normalized_rows = tuple(
            row.model_copy(update={"normalized_fields": row.raw_fields}) for row in parsed_rows
        )
        station_summaries, summary_issues = _build_station_summaries(normalized_rows)
        return ImportReport(
            source_name=source_name,
            source_sha256=source_hash,
            correction_policy=correction_policy,
            policy_status="already_reflected",
            raw_rows=tuple(parsed_rows),
            normalized_rows=normalized_rows,
            corrections=corrections,
            issues=(*issues, *summary_issues),
            station_summaries=station_summaries,
        )

    mismatch = ImportIssue(
        code="correction_profile_mismatch",
        severity="error",
        fields=("correction_policy",),
        message="The named correction profile applies only to its approved source views.",
    )
    return ImportReport(
        source_name=source_name,
        source_sha256=source_hash,
        correction_policy=correction_policy,
        policy_status="mismatch",
        fatal_error=True,
        raw_rows=tuple(parsed_rows),
        issues=(*issues, mismatch),
    )


def _mark_duplicate_keys(
    rows: list[ObservationRow],
    issues: list[ImportIssue],
) -> tuple[list[ObservationRow], list[ImportIssue]]:
    by_key: dict[str, list[int]] = {}
    for index, row in enumerate(rows):
        if row.qualified_key is not None:
            by_key.setdefault(row.qualified_key, []).append(index)

    duplicate_indices: dict[int, str] = {}
    for key, indices in by_key.items():
        if len(indices) < 2:
            continue
        duplicate_indices.update({index: key for index in indices})
        issues.append(
            ImportIssue(
                code="duplicate_key",
                severity="error",
                row_keys=(key,),
                line_numbers=tuple(rows[index].line_number for index in indices),
                fields=("lugar", "fecha", "id"),
                message=(
                    "All rows with the same date, station and local ID are excluded from summaries."
                ),
            )
        )

    if not duplicate_indices:
        return rows, issues

    invalidated = list(rows)
    for index in duplicate_indices:
        row = invalidated[index]
        invalidated[index] = row.model_copy(
            update={
                "validity_flags": (*row.validity_flags, "duplicate_key"),
                "outcome": "invalid",
            }
        )
    return invalidated, issues


def _is_header(line: str) -> bool:
    """Recognize the exact schema header, optionally attached to a chat label."""

    if line == _HEADER_TEXT:
        return True
    if _WHATSAPP_HEADER.fullmatch(line):
        return True
    try:
        fields = next(csv.reader([line], strict=True))
    except (csv.Error, StopIteration):
        return False
    return tuple(fields) == HEADER_FIELDS


def _parse_observation_row(
    fields: list[str], line_number: int
) -> tuple[ObservationRow, tuple[ImportIssue, ...]]:
    row_issues: list[ImportIssue] = []
    flags: list[str] = []
    quality_flags: list[str] = []

    def cell(index: int) -> str:
        return fields[index].strip() if index < len(fields) else ""

    if len(fields) != len(HEADER_FIELDS):
        flags.append("field_count")
        row_issues.append(
            ImportIssue(
                code="field_count",
                severity="error",
                line_numbers=(line_number,),
                message=f"Expected 9 fields but found {len(fields)}.",
            )
        )

    station_value = cell(0)
    if station_value == "caja":
        station: Literal["caja", "entrega"] | None = "caja"
    elif station_value == "entrega":
        station = "entrega"
    else:
        station = None
    if station is None:
        flags.append("invalid_station")
        row_issues.append(_row_issue("invalid_station", line_number, "lugar"))

    observation_date: date | None = None
    date_text = cell(1)
    if _DATE_FORMAT.fullmatch(date_text):
        try:
            observation_date = date.fromisoformat(date_text)
        except ValueError:
            pass
    if observation_date is None:
        flags.append("invalid_date")
        row_issues.append(_row_issue("invalid_date", line_number, "fecha"))

    staff_text = cell(3)
    reported_staff: int | None = None
    if _POSITIVE_INTEGER.fullmatch(staff_text):
        try:
            reported_staff = int(staff_text)
        except ValueError:
            pass
    if reported_staff is None:
        flags.append("invalid_reported_staff")
        row_issues.append(_row_issue("invalid_reported_staff", line_number, "personal"))

    local_id = cell(4) or None
    if local_id is None:
        flags.append("missing_local_id")
        row_issues.append(_row_issue("missing_local_id", line_number, "id"))

    parsed_times: list[time | None] = []
    for index, field_name in zip((5, 6, 7, 8), HEADER_FIELDS[5:], strict=True):
        value = cell(index)
        if not value:
            parsed_times.append(None)
            continue
        try:
            parsed_time = time.fromisoformat(value) if _TIME_FORMAT.fullmatch(value) else None
        except ValueError:
            parsed_time = None
        parsed_times.append(parsed_time)
        if parsed_time is None:
            flags.append(f"invalid_{field_name}")
            row_issues.append(_row_issue(f"invalid_{field_name}", line_number, field_name))

    arrival_time, start_time, end_time, departure_time = parsed_times
    qualified_key = None
    if observation_date is not None and station is not None and local_id is not None:
        qualified_key = f"{observation_date.isoformat()}|{station}|{local_id}"

    outcome: Literal["served", "withdrawn", "incomplete", "invalid"] = "incomplete"
    has_service_time = start_time is not None or end_time is not None
    if has_service_time and departure_time is not None:
        flags.append("contradictory_outcome")
        row_issues.append(
            _row_issue(
                "contradictory_outcome",
                line_number,
                "hora_inicio",
                "hora_fin",
                "hora_se_fue",
                row_key=qualified_key,
            )
        )
    if arrival_time is not None and start_time is not None and arrival_time > start_time:
        flags.append("start_before_arrival")
        row_issues.append(
            _row_issue(
                "start_before_arrival",
                line_number,
                "hora_llegada",
                "hora_inicio",
                row_key=qualified_key,
            )
        )
    if start_time is not None and end_time is not None:
        if start_time > end_time:
            flags.append("end_before_start")
            row_issues.append(
                _row_issue(
                    "end_before_start",
                    line_number,
                    "hora_inicio",
                    "hora_fin",
                    row_key=qualified_key,
                )
            )
        elif start_time == end_time:
            quality_flags.append("zero_duration")
            row_issues.append(
                ImportIssue(
                    code="zero_duration",
                    severity="warning",
                    row_keys=(qualified_key,) if qualified_key is not None else (),
                    line_numbers=(line_number,),
                    fields=("hora_inicio", "hora_fin"),
                    message=(
                        "The observed interval is zero seconds; keep it descriptive and do not "
                        "use it as a positive future service-time parameter."
                    ),
                )
            )
    if (
        arrival_time is not None
        and start_time is None
        and end_time is not None
        and arrival_time > end_time
    ):
        flags.append("end_before_arrival")
        row_issues.append(
            _row_issue(
                "end_before_arrival",
                line_number,
                "hora_llegada",
                "hora_fin",
                row_key=qualified_key,
            )
        )
    if not has_service_time and arrival_time is not None and departure_time is not None:
        outcome = "withdrawn"
        if arrival_time > departure_time:
            flags.append("departure_before_arrival")
            row_issues.append(
                _row_issue(
                    "departure_before_arrival",
                    line_number,
                    "hora_llegada",
                    "hora_se_fue",
                    row_key=qualified_key,
                )
            )
    elif has_service_time and departure_time is None:
        if arrival_time is not None and start_time is not None and end_time is not None:
            outcome = "served"
    if flags:
        outcome = "invalid"

    if qualified_key is not None:
        row_issues = [
            issue if issue.row_keys else issue.model_copy(update={"row_keys": (qualified_key,)})
            for issue in row_issues
        ]

    observed_wait_s = _elapsed_seconds(observation_date, arrival_time, start_time)
    observed_interval_s = _elapsed_seconds(observation_date, start_time, end_time)

    return (
        ObservationRow(
            raw_fields=tuple(fields),
            station=station,
            observation_date=observation_date,
            day_type=cell(2) or None,
            reported_staff=reported_staff,
            local_id=local_id,
            qualified_key=qualified_key,
            arrival_time=arrival_time,
            start_time=start_time,
            end_time=end_time,
            departure_time=departure_time,
            line_number=line_number,
            validity_flags=tuple(flags),
            quality_flags=tuple(quality_flags),
            observed_wait_s=observed_wait_s,
            observed_interval_s=observed_interval_s,
            outcome=outcome,
            withdrawal_reason="not_observed" if outcome == "withdrawn" else None,
        ),
        tuple(row_issues),
    )


def _elapsed_seconds(
    observation_date: date | None,
    start: time | None,
    end: time | None,
) -> int | None:
    if observation_date is None or start is None or end is None:
        return None
    return int(
        (
            datetime.combine(observation_date, end) - datetime.combine(observation_date, start)
        ).total_seconds()
    )


def _row_issue(
    code: str,
    line_number: int,
    *field_names: str,
    row_key: str | None = None,
) -> ImportIssue:
    return ImportIssue(
        code=code,
        severity="error",
        row_keys=(row_key,) if row_key is not None else (),
        line_numbers=(line_number,),
        fields=field_names,
        message=f"Invalid or missing value in {', '.join(field_names)}.",
    )


def _apply_approved_corrections(
    *,
    source_name: str,
    source_hash: str,
    raw_rows: tuple[ObservationRow, ...],
    issues: tuple[ImportIssue, ...],
) -> ImportReport:
    cashier_rows = [row for row in raw_rows if row.qualified_key == "2026-10-20|caja|35"]
    delivery_rows = [row for row in raw_rows if row.qualified_key == "2026-10-20|entrega|26"]
    if len(cashier_rows) != 1 or len(delivery_rows) != 1:
        return _profile_mismatch_report(source_name, source_hash, raw_rows, issues)

    cashier_35 = cashier_rows[0]
    if cashier_35.raw_fields[7] != "17:45:20":
        return _profile_mismatch_report(source_name, source_hash, raw_rows, issues)

    corrected_rows_list: list[ObservationRow] = []
    for row in raw_rows:
        if row.qualified_key == "2026-10-20|entrega|26":
            continue
        if row.qualified_key == "2026-10-20|caja|35":
            corrected_fields = list(row.raw_fields)
            corrected_fields[7] = "17:46:20"
            corrected, _ = _parse_observation_row(corrected_fields, row.line_number)
            corrected_rows_list.append(
                corrected.model_copy(
                    update={
                        "raw_fields": row.raw_fields,
                        "normalized_fields": tuple(corrected_fields),
                    }
                )
            )
        else:
            corrected_rows_list.append(row.model_copy(update={"normalized_fields": row.raw_fields}))
    corrected_rows = tuple(corrected_rows_list)
    delivery_26 = delivery_rows[0]
    corrections = (
        Correction(
            action="replace_field",
            status="applied",
            row_key="2026-10-20|caja|35",
            field="hora_fin",
            before="17:45:20",
            after="17:46:20",
            reason="Correct the recorded cashier end time per the approved 2026-10-20 correction.",
            profile=APPROVED_CORRECTION_PROFILE,
            line_number=cashier_35.line_number,
        ),
        Correction(
            action="exclude_row",
            status="applied",
            row_key="2026-10-20|entrega|26",
            reason="Exclude delivery 26 because the user identified it as a recording error.",
            profile=APPROVED_CORRECTION_PROFILE,
            line_number=delivery_26.line_number,
        ),
    )
    projected_issues = _project_correction_issues(issues, corrected_rows)
    station_summaries, summary_issues = _build_station_summaries(corrected_rows)
    return ImportReport(
        source_name=source_name,
        source_sha256=source_hash,
        correction_policy=APPROVED_CORRECTION_PROFILE,
        policy_status="applied",
        raw_rows=raw_rows,
        normalized_rows=corrected_rows,
        excluded_rows=(delivery_26,),
        corrections=corrections,
        issues=(*projected_issues, *summary_issues),
        station_summaries=station_summaries,
    )


def _project_correction_issues(
    issues: tuple[ImportIssue, ...],
    normalized_rows: tuple[ObservationRow, ...],
) -> tuple[ImportIssue, ...]:
    normalized_by_key = {
        row.qualified_key: row for row in normalized_rows if row.qualified_key is not None
    }
    projected: list[ImportIssue] = []
    for issue in issues:
        if not issue.row_keys:
            projected.append(issue)
            continue
        normalized_rows_for_issue = [normalized_by_key.get(key) for key in issue.row_keys]
        if any(row is None for row in normalized_rows_for_issue):
            affected_view: Literal["raw", "normalized", "both"] = "raw"
        elif any(
            issue.code not in (*row.validity_flags, *row.quality_flags)
            for row in normalized_rows_for_issue
            if row is not None
        ):
            affected_view = "raw"
        else:
            affected_view = "both"
        projected.append(issue.model_copy(update={"affected_view": affected_view}))
    return tuple(projected)


def _already_reflected_corrections(rows: tuple[ObservationRow, ...]) -> tuple[Correction, ...]:
    cashier_35 = next(row for row in rows if row.qualified_key == "2026-10-20|caja|35")
    return (
        Correction(
            action="replace_field",
            status="already_reflected",
            row_key="2026-10-20|caja|35",
            field="hora_fin",
            after=cashier_35.raw_fields[7],
            reason="The corrected end time is already present in the supplied source.",
            profile=APPROVED_CORRECTION_PROFILE,
            line_number=cashier_35.line_number,
        ),
        Correction(
            action="exclude_row",
            status="already_reflected",
            row_key="2026-10-20|entrega|26",
            reason="Delivery 26 is absent from the supplied corrected source.",
            profile=APPROVED_CORRECTION_PROFILE,
        ),
    )


def _profile_mismatch_report(
    source_name: str,
    source_hash: str,
    raw_rows: tuple[ObservationRow, ...],
    issues: tuple[ImportIssue, ...],
) -> ImportReport:
    mismatch = ImportIssue(
        code="correction_profile_mismatch",
        severity="error",
        fields=("correction_policy",),
        message="The approved correction rows do not match the named source profile.",
    )
    return ImportReport(
        source_name=source_name,
        source_sha256=source_hash,
        correction_policy=APPROVED_CORRECTION_PROFILE,
        policy_status="mismatch",
        fatal_error=True,
        raw_rows=raw_rows,
        issues=(*issues, mismatch),
    )


def _build_station_summaries(
    rows: tuple[ObservationRow, ...],
) -> tuple[tuple[StationSummary, ...], tuple[ImportIssue, ...]]:
    groups: dict[tuple[Literal["caja", "entrega"], date], list[ObservationRow]] = {}
    for row in rows:
        if row.station is None or row.observation_date is None:
            continue
        groups.setdefault((row.station, row.observation_date), []).append(row)

    summaries: list[StationSummary] = []
    issues: list[ImportIssue] = []
    for (station, observation_date), segment_rows in sorted(
        groups.items(), key=lambda item: (item[0][1], item[0][0])
    ):
        staff_values = tuple(
            sorted({row.reported_staff for row in segment_rows if row.reported_staff is not None})
        )
        staff_complete = all(row.reported_staff is not None for row in segment_rows)
        staff_consistent = staff_complete and len(staff_values) == 1
        reported_staff = staff_values[0] if staff_consistent else None
        if not staff_consistent:
            code = (
                "inconsistent_reported_staff" if len(staff_values) > 1 else "unknown_reported_staff"
            )
            issues.append(
                ImportIssue(
                    code=code,
                    severity="warning",
                    row_keys=tuple(
                        row.qualified_key for row in segment_rows if row.qualified_key is not None
                    ),
                    line_numbers=tuple(row.line_number for row in segment_rows),
                    fields=("personal",),
                    affected_view="normalized",
                    message=(
                        "Reported staffing varies within this station/date segment; no single "
                        "capacity is asserted."
                    ),
                )
            )

        wait = _duration_summary(
            segment_rows,
            metric="wait",
            label="Observed order/payment-observation wait from arrival to service start",
        )
        interval_label = (
            "Observed cashier transaction window (hora_inicio to hora_fin); not active cashier work"
            if station == "caja"
            else "Observed preparation start to delivery of the order's final product"
        )
        interval = _duration_summary(
            segment_rows,
            metric="interval",
            label=interval_label,
        )
        concurrency, concurrency_issues = _concurrency_summary(
            segment_rows,
            station=station,
            reported_staff=reported_staff,
            staff_consistent=staff_consistent,
        )
        issues.extend(concurrency_issues)
        outcome_counts = {
            outcome: sum(row.outcome == outcome for row in segment_rows)
            for outcome in ("served", "withdrawn", "incomplete", "invalid")
        }
        summaries.append(
            StationSummary(
                station=station,
                observation_date=observation_date,
                row_count=len(segment_rows),
                served_count=outcome_counts["served"],
                withdrawn_count=outcome_counts["withdrawn"],
                incomplete_count=outcome_counts["incomplete"],
                invalid_count=outcome_counts["invalid"],
                reported_staff=reported_staff,
                staff_capacity_consistent=staff_consistent,
                wait=wait,
                interval=interval,
                concurrency=concurrency,
            )
        )
    return tuple(summaries), tuple(issues)


def _duration_summary(
    rows: list[ObservationRow],
    *,
    metric: Literal["wait", "interval"],
    label: str,
) -> DurationSummary:
    values: list[int] = []
    excluded_by_reason: dict[str, int] = {}
    excluded_rows: list[ExcludedObservation] = []
    for row in rows:
        value = row.observed_wait_s if metric == "wait" else row.observed_interval_s
        if row.outcome != "invalid" and not row.validity_flags and value is not None and value >= 0:
            values.append(value)
            continue
        if row.validity_flags:
            reason = row.validity_flags[0]
        elif row.outcome == "served" and value is None:
            reason = f"missing_{metric}_fields"
        else:
            reason = row.outcome
        excluded_by_reason[reason] = excluded_by_reason.get(reason, 0) + 1
        excluded_rows.append(
            ExcludedObservation(
                row_key=row.qualified_key,
                line_number=row.line_number,
                reason=reason,
            )
        )

    return DurationSummary(
        label=label,
        n_used=len(values),
        n_excluded=len(rows) - len(values),
        total_s=sum(values) if values else None,
        minimum_s=min(values) if values else None,
        mean_s=statistics.fmean(values) if values else None,
        maximum_s=max(values) if values else None,
        excluded_by_reason=tuple(sorted(excluded_by_reason.items())),
        excluded_rows=tuple(excluded_rows),
    )


def _concurrency_summary(
    rows: list[ObservationRow],
    *,
    station: Literal["caja", "entrega"],
    reported_staff: int | None,
    staff_consistent: bool,
) -> tuple[ConcurrencySummary, tuple[ImportIssue, ...]]:
    interval_kind: Literal["cashier_transaction_window", "preparation_to_final_delivery"] = (
        "cashier_transaction_window" if station == "caja" else "preparation_to_final_delivery"
    )
    events: dict[time, dict[str, list[ObservationRow]]] = {}
    for row in rows:
        if (
            row.outcome == "invalid"
            or row.validity_flags
            or row.qualified_key is None
            or row.start_time is None
            or row.end_time is None
            or row.start_time == row.end_time
        ):
            continue
        events.setdefault(row.start_time, {"starts": [], "ends": []})["starts"].append(row)
        events.setdefault(row.end_time, {"starts": [], "ends": []})["ends"].append(row)

    active: dict[str, ObservationRow] = {}
    peak_concurrency = 0
    peak_at: time | None = None
    peak_row_keys: tuple[str, ...] = ()
    overlap_points: list[ConcurrencyPoint] = []
    for at in sorted(events):
        boundary = events[at]
        for row in sorted(boundary["ends"], key=lambda item: item.line_number):
            if row.qualified_key is not None:
                active.pop(row.qualified_key, None)
        for row in sorted(boundary["starts"], key=lambda item: item.line_number):
            if row.qualified_key is not None:
                active[row.qualified_key] = row

        active_rows = tuple(sorted(active.values(), key=lambda item: item.line_number))
        current_count = len(active_rows)
        current_keys = tuple(
            row.qualified_key for row in active_rows if row.qualified_key is not None
        )
        if current_count > peak_concurrency:
            peak_concurrency = current_count
            peak_at = at
            peak_row_keys = current_keys
        if current_count > 1:
            overlap_points.append(
                ConcurrencyPoint(
                    at=at,
                    concurrent_count=current_count,
                    row_keys=current_keys,
                    line_numbers=tuple(row.line_number for row in active_rows),
                )
            )

    exceeds_capacity = (
        peak_concurrency > reported_staff
        if station == "entrega" and staff_consistent and reported_staff is not None
        else None
    )
    issues: list[ImportIssue] = []
    if station == "caja" and overlap_points:
        overlap_keys = tuple(
            dict.fromkeys(key for point in overlap_points for key in point.row_keys)
        )
        overlap_lines = tuple(
            sorted({line for point in overlap_points for line in point.line_numbers})
        )
        issues.append(
            ImportIssue(
                code="cashier_window_overlap",
                severity="information",
                row_keys=overlap_keys,
                line_numbers=overlap_lines,
                fields=("hora_inicio", "hora_fin"),
                affected_view="normalized",
                message=(
                    "Cashier transaction windows overlap; this observation does not measure active "
                    "cashier occupation or utilization."
                ),
            )
        )
    elif station == "entrega" and staff_consistent and reported_staff is not None:
        for point in overlap_points:
            if point.concurrent_count <= reported_staff:
                continue
            issues.append(
                ImportIssue(
                    code="capacity_exceeded",
                    severity="warning",
                    row_keys=point.row_keys,
                    line_numbers=point.line_numbers,
                    fields=("personal", "hora_inicio", "hora_fin"),
                    affected_view="normalized",
                    message=(
                        f"{point.concurrent_count} delivery intervals overlap at "
                        f"{point.at.strftime('%H:%M:%S')} while reported preparation staff is "
                        f"{reported_staff}; this is a consistency conflict, "
                        "not an inferred assignment."
                    ),
                )
            )

    return (
        ConcurrencySummary(
            interval_kind=interval_kind,
            peak_concurrency=peak_concurrency,
            peak_at=peak_at,
            peak_row_keys=peak_row_keys,
            reported_capacity=reported_staff if station == "entrega" else None,
            capacity_consistent=staff_consistent,
            exceeds_capacity=exceeds_capacity,
            overlap_points=tuple(overlap_points),
        ),
        tuple(issues),
    )
