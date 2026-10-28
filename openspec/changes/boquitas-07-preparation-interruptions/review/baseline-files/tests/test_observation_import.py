from __future__ import annotations

import hashlib
import json
from collections import Counter
from datetime import time
from pathlib import Path

import pytest
from pydantic import ValidationError

from boquitas import import_observations

FIXTURES = Path(__file__).parent / "fixtures" / "observation-import"
APPROVED_PROFILE = "boquitas-2026-10-20-v1"
HEADER = "lugar,fecha,tipo_dia,personal,id,hora_llegada,hora_inicio,hora_fin,hora_se_fue"


def csv_document(*rows: str) -> bytes:
    return ("\n".join((HEADER, *rows, ""))).encode("utf-8")


def test_source_fixtures_match_versioned_hashes_and_observation_counts() -> None:
    manifest = json.loads((FIXTURES / "source-manifest.json").read_text(encoding="utf-8"))

    for source in manifest["sources"].values():
        content = (FIXTURES / source["fixture"]).read_bytes()
        assert hashlib.sha256(content).hexdigest() == source["sha256"]

        report = import_observations(content, source_name=source["fixture"])
        assert len(report.raw_rows) == source["observation_rows"]
        assert dict(Counter(row.station for row in report.raw_rows)) == source["station_rows"]


def test_original_source_import_keeps_physical_lines_and_station_local_rows() -> None:
    source = (FIXTURES / "original.txt").read_bytes()

    report = import_observations(
        b"\xef\xbb\xbf" + source,
        source_name="original.txt",
    )

    assert len(report.raw_rows) == 120
    assert len(report.normalized_rows) == 120
    assert Counter(row.station for row in report.raw_rows) == {"caja": 61, "entrega": 59}
    assert report.raw_rows[0].line_number == 2
    assert report.raw_rows[0].station == "entrega"
    assert report.raw_rows[0].observation_date.isoformat() == "2026-10-20"
    assert report.raw_rows[0].day_type == "Martes 2x1"
    assert report.raw_rows[0].reported_staff == 4
    assert report.raw_rows[0].raw_fields[5] == "16:47:05"
    assert not any(row.line_number == 61 for row in report.raw_rows)


def test_approved_profile_corrects_view_without_overwriting_original_rows() -> None:
    source = (FIXTURES / "original.txt").read_bytes()

    report = import_observations(
        source,
        source_name="original.txt",
        correction_policy=APPROVED_PROFILE,
    )

    assert report.policy_status == "applied"
    assert len(report.raw_rows) == 120
    assert len(report.normalized_rows) == 119
    assert len(report.excluded_rows) == 1

    raw_cashier_35 = next(
        row for row in report.raw_rows if row.station == "caja" and row.local_id == "35"
    )
    corrected_cashier_35 = next(
        row for row in report.normalized_rows if row.station == "caja" and row.local_id == "35"
    )
    excluded_delivery_26 = report.excluded_rows[0]

    assert raw_cashier_35.raw_fields[7] == "17:45:20"
    assert raw_cashier_35.outcome == "served"
    assert corrected_cashier_35.end_time == time(17, 46, 20)
    assert raw_cashier_35.observed_interval_s == 0
    assert corrected_cashier_35.observed_interval_s == 60
    assert "zero_duration" in raw_cashier_35.quality_flags
    assert "zero_duration" not in corrected_cashier_35.quality_flags
    assert excluded_delivery_26.station == "entrega"
    assert excluded_delivery_26.local_id == "26"
    assert excluded_delivery_26.raw_fields[7] == "17:31:05"
    assert corrected_cashier_35.normalized_fields is not None
    assert [
        (index, raw_cashier_35.raw_fields[index], corrected_cashier_35.normalized_fields[index])
        for index in range(len(raw_cashier_35.raw_fields))
        if raw_cashier_35.raw_fields[index] != corrected_cashier_35.normalized_fields[index]
    ] == [(7, "17:45:20", "17:46:20")]
    normalized_by_key = {row.qualified_key: row for row in report.normalized_rows}
    for raw_row in report.raw_rows:
        if raw_row.qualified_key in {
            "2026-10-20|caja|35",
            "2026-10-20|entrega|26",
        }:
            continue
        normalized_row = normalized_by_key[raw_row.qualified_key]
        assert normalized_row.normalized_fields == raw_row.raw_fields
    zero_warning = next(issue for issue in report.issues if issue.code == "zero_duration")
    assert zero_warning.affected_view == "raw"
    assert not any(
        issue.affected_view in ("normalized", "both") and "2026-10-20|entrega|26" in issue.row_keys
        for issue in report.issues
    )
    assert report.normalized_rows[0].group_size is None
    assert report.normalized_rows[0].group_size_reason == "not_observed"

    assert {
        (item.action, item.row_key, item.field, item.before, item.after)
        for item in report.corrections
    } == {
        (
            "replace_field",
            "2026-10-20|caja|35",
            "hora_fin",
            "17:45:20",
            "17:46:20",
        ),
        ("exclude_row", "2026-10-20|entrega|26", None, None, None),
    }


def test_approved_profile_is_idempotent_on_the_corrected_reference() -> None:
    source = (FIXTURES / "corrected-reference.txt").read_bytes()

    report = import_observations(
        source,
        source_name="corrected-reference.txt",
        correction_policy=APPROVED_PROFILE,
    )

    assert report.policy_status == "already_reflected"
    assert len(report.raw_rows) == 119
    assert len(report.normalized_rows) == 119
    assert report.excluded_rows == ()
    assert not any(row.qualified_key == "2026-10-20|entrega|26" for row in report.raw_rows)

    cashier_correction = next(item for item in report.corrections if item.action == "replace_field")
    delivery_correction = next(item for item in report.corrections if item.action == "exclude_row")
    assert cashier_correction.status == "already_reflected"
    assert cashier_correction.before is None
    assert cashier_correction.after == "17:46:20"
    assert delivery_correction.status == "already_reflected"
    assert delivery_correction.line_number is None


def test_approved_profile_rejects_changed_data_and_malformed_extra_rows() -> None:
    source = (FIXTURES / "original.txt").read_bytes()
    changed = source.replace(
        b"caja,2026-10-20,Martes 2x1,1,35,17:42:16,17:45:20,17:45:20,",
        b"caja,2026-10-20,Martes 2x1,1,35,17:42:16,17:45:20,17:44:20,",
        1,
    )
    malformed_extra = source + b"\nnot,csv\n"

    for content in (changed, malformed_extra):
        report = import_observations(
            content,
            source_name="altered.txt",
            correction_policy=APPROVED_PROFILE,
        )

        assert report.policy_status == "mismatch"
        assert report.fatal_error
        assert report.normalized_rows == ()
        assert any(issue.code == "correction_profile_mismatch" for issue in report.issues)

    malformed_report = import_observations(
        malformed_extra,
        source_name="malformed-extra.txt",
        correction_policy=APPROVED_PROFILE,
    )
    extra_row = malformed_report.raw_rows[-1]
    assert extra_row.raw_fields == ("not", "csv")
    assert extra_row.line_number == 123
    assert extra_row.outcome == "invalid"
    assert any(
        issue.code == "field_count" and issue.line_numbers == (123,)
        for issue in malformed_report.issues
    )

    changed_report = import_observations(
        changed,
        source_name="changed.txt",
        correction_policy=APPROVED_PROFILE,
    )
    raw_cashier_35 = next(
        row for row in changed_report.raw_rows if row.station == "caja" and row.local_id == "35"
    )
    assert raw_cashier_35.raw_fields[7] == "17:44:20"


def test_unrecognized_preamble_is_preserved_as_an_invalid_raw_record() -> None:
    source = b"unapproved,prelude\n" + (FIXTURES / "original.txt").read_bytes()

    report = import_observations(source, source_name="preamble.txt")

    preamble = report.raw_rows[0]
    assert preamble.raw_fields == ("unapproved", "prelude")
    assert preamble.line_number == 1
    assert preamble.outcome == "invalid"
    assert "unexpected_preamble" in preamble.validity_flags
    assert any(issue.code == "unexpected_preamble" for issue in report.issues)


def test_header_encoding_and_malformed_csv_errors_remain_actionable() -> None:
    missing_header = import_observations(
        b"wrong,header\nrow,data\n",
        source_name="missing-header.txt",
    )
    unsupported_encoding = import_observations(b"\xff", source_name="invalid-encoding.txt")
    malformed_line = b'caja,2026-10-20,Martes 2x1,1,1,15:00:00,"unfinished'
    malformed_csv = import_observations(
        b"lugar,fecha,tipo_dia,personal,id,hora_llegada,hora_inicio,hora_fin,hora_se_fue\n"
        + malformed_line
        + b"\n",
        source_name="malformed.csv",
    )

    assert missing_header.fatal_error
    assert missing_header.normalized_rows == ()
    assert any(issue.code == "missing_header" for issue in missing_header.issues)
    assert unsupported_encoding.fatal_error
    assert any(issue.code == "unsupported_encoding" for issue in unsupported_encoding.issues)
    assert len(malformed_csv.raw_rows) == 1
    assert malformed_csv.raw_rows[0].raw_fields == (malformed_line.decode("utf-8"),)
    assert malformed_csv.raw_rows[0].outcome == "invalid"
    assert any(issue.code == "malformed_csv" for issue in malformed_csv.issues)


def test_end_before_start_remains_raw_but_is_invalid_for_descriptive_use() -> None:
    source = csv_document("caja,2026-10-20,Martes,1,9,15:00:00,15:01:00,15:00:30,")

    report = import_observations(source, source_name="chronology.csv")

    row = report.normalized_rows[0]
    assert row.raw_fields[7] == "15:00:30"
    assert row.outcome == "invalid"
    assert "end_before_start" in row.validity_flags
    assert row.observed_wait_s == 60
    assert row.observed_interval_s == -30
    issue = next(issue for issue in report.issues if issue.code == "end_before_start")
    assert issue.row_keys == ("2026-10-20|caja|9",)
    assert issue.line_numbers == (2,)
    assert issue.fields == ("hora_inicio", "hora_fin")
    metric = report.station_summaries[0].interval
    assert (metric.n_used, metric.n_excluded) == (0, 1)
    assert [(item.row_key, item.line_number, item.reason) for item in metric.excluded_rows] == [
        ("2026-10-20|caja|9", 2, "end_before_start")
    ]


def test_duplicate_qualified_keys_invalidate_every_occurrence_only_within_station_and_date() -> (
    None
):
    source = csv_document(
        "caja,2026-10-20,Martes,1,1,15:00:00,15:00:10,15:00:20,",
        "caja,2026-10-20,Martes,1,1,15:01:00,15:01:10,15:01:20,",
        "entrega,2026-10-20,Martes,4,1,15:00:00,15:00:10,15:00:20,",
        "caja,2026-10-21,Regular,1,1,15:00:00,15:00:10,15:00:20,",
    )

    report = import_observations(source, source_name="duplicate.csv")

    duplicates = [row for row in report.normalized_rows if row.qualified_key == "2026-10-20|caja|1"]
    assert len(duplicates) == 2
    assert all(row.outcome == "invalid" for row in duplicates)
    assert all("duplicate_key" in row.validity_flags for row in duplicates)
    duplicate_issue = next(issue for issue in report.issues if issue.code == "duplicate_key")
    assert duplicate_issue.row_keys == ("2026-10-20|caja|1",)
    assert duplicate_issue.line_numbers == (2, 3)
    duplicate_summary = next(
        summary
        for summary in report.station_summaries
        if summary.station == "caja" and summary.observation_date.isoformat() == "2026-10-20"
    )
    assert duplicate_summary.interval.n_excluded == 2
    assert [
        (item.row_key, item.line_number, item.reason)
        for item in duplicate_summary.interval.excluded_rows
    ] == [
        ("2026-10-20|caja|1", 2, "duplicate_key"),
        ("2026-10-20|caja|1", 3, "duplicate_key"),
    ]
    assert not any(
        row.outcome == "invalid"
        for row in report.normalized_rows
        if row.qualified_key in {"2026-10-20|entrega|1", "2026-10-21|caja|1"}
    )


def test_chronology_checks_each_available_time_pair_on_incomplete_rows() -> None:
    source = csv_document(
        "caja,2026-10-20,Martes,1,10,15:01:00,15:00:00,,",
        "entrega,2026-10-20,Martes,4,11,,15:01:00,15:00:30,",
    )

    report = import_observations(source, source_name="partial-chronology.csv")

    start_before_arrival, end_before_start = report.normalized_rows
    assert start_before_arrival.outcome == "invalid"
    assert "start_before_arrival" in start_before_arrival.validity_flags
    assert end_before_start.outcome == "invalid"
    assert "end_before_start" in end_before_start.validity_flags
    assert {issue.code for issue in report.issues} >= {
        "start_before_arrival",
        "end_before_start",
    }


def test_end_before_arrival_is_invalid_even_when_start_time_is_missing() -> None:
    source = csv_document("entrega,2026-10-20,Martes,4,16,15:05:00,,15:00:00,")

    report = import_observations(source, source_name="end-before-arrival.csv")

    row = report.normalized_rows[0]
    assert row.outcome == "invalid"
    assert "end_before_arrival" in row.validity_flags
    issue = next(issue for issue in report.issues if issue.code == "end_before_arrival")
    assert issue.row_keys == ("2026-10-20|entrega|16",)
    assert issue.fields == ("hora_llegada", "hora_fin")


def test_unparseable_oversized_staff_count_is_a_diagnostic_not_an_exception() -> None:
    huge_staff_value = "9" * 4400
    source = csv_document(
        f"caja,2026-10-20,Martes,{huge_staff_value},12,15:00:00,15:00:10,15:00:20,"
    )

    report = import_observations(source, source_name="oversized-staff.csv")

    row = report.normalized_rows[0]
    assert row.reported_staff is None
    assert row.outcome == "invalid"
    assert "invalid_reported_staff" in row.validity_flags
    assert any(issue.code == "invalid_reported_staff" for issue in report.issues)


def test_local_ids_and_unknown_group_size_are_station_qualified() -> None:
    source = csv_document(
        "caja,2026-10-20,Martes,1,1,15:00:00,15:00:10,15:00:20,",
        "entrega,2026-10-20,Martes,4,1,15:00:00,15:00:10,15:00:20,",
    )

    report = import_observations(source, source_name="same-local-id.csv")

    cashier, delivery = report.normalized_rows
    assert cashier.local_id == delivery.local_id == "1"
    assert cashier.qualified_key == "2026-10-20|caja|1"
    assert delivery.qualified_key == "2026-10-20|entrega|1"
    assert cashier.qualified_key != delivery.qualified_key
    assert cashier.group_size is None
    assert cashier.group_size_reason == "not_observed"
    assert delivery.group_size is None
    assert delivery.group_size_reason == "not_observed"


def test_recorded_cashier_departures_remain_withdrawals_without_service_or_inferred_causes() -> (
    None
):
    source = (FIXTURES / "original.txt").read_bytes()

    report = import_observations(source, source_name="original.txt")

    withdrawals = [
        row
        for row in report.normalized_rows
        if row.station == "caja" and row.local_id in {"16", "19", "49"}
    ]
    assert len(withdrawals) == 3
    assert all(row.outcome == "withdrawn" for row in withdrawals)
    assert all(
        row.arrival_time is not None and row.departure_time is not None for row in withdrawals
    )
    assert all(row.start_time is None and row.end_time is None for row in withdrawals)
    assert all(row.observed_interval_s is None for row in withdrawals)
    assert all(row.group_size is None for row in withdrawals)
    assert all(row.group_size_reason == "not_observed" for row in withdrawals)
    assert all(row.withdrawal_reason == "not_observed" for row in withdrawals)


def test_dates_and_times_require_the_documented_exact_formats() -> None:
    source = csv_document("caja,20261020,Martes,1,1,15:00,15:00:10,15:00:20,")

    report = import_observations(source, source_name="noncanonical-time.csv")

    row = report.normalized_rows[0]
    assert row.observation_date is None
    assert row.arrival_time is None
    assert row.outcome == "invalid"
    assert {"invalid_date", "invalid_hora_llegada"} <= set(row.validity_flags)


def test_service_and_departure_fields_are_a_contradictory_outcome() -> None:
    source = csv_document("caja,2026-10-20,Martes,1,13,15:00:00,15:00:10,15:00:20,15:00:30")

    report = import_observations(source, source_name="contradictory.csv")

    row = report.normalized_rows[0]
    assert row.outcome == "invalid"
    assert "contradictory_outcome" in row.validity_flags
    assert any(issue.code == "contradictory_outcome" for issue in report.issues)
    assert report.station_summaries[0].interval.excluded_rows[0].reason == "contradictory_outcome"


def test_missing_times_remain_incomplete_and_are_not_zero_duration() -> None:
    source = csv_document("caja,2026-10-20,Martes,1,14,,,,")

    report = import_observations(source, source_name="incomplete.csv")

    row = report.normalized_rows[0]
    assert row.outcome == "incomplete"
    assert row.observed_wait_s is None
    assert row.observed_interval_s is None
    assert "zero_duration" not in row.quality_flags
    assert not any(issue.code == "zero_duration" for issue in report.issues)
    assert report.station_summaries[0].interval.excluded_by_reason == (("incomplete", 1),)


def test_incomplete_rows_contribute_only_the_duration_pairs_they_observe() -> None:
    source = csv_document(
        "caja,2026-10-20,Martes,1,15,15:00:00,15:00:25,,",
        "entrega,2026-10-20,Martes,4,15,,15:01:00,15:02:00,",
    )

    report = import_observations(source, source_name="partial-measures.csv")

    cashier = next(summary for summary in report.station_summaries if summary.station == "caja")
    delivery = next(summary for summary in report.station_summaries if summary.station == "entrega")
    assert report.normalized_rows[0].outcome == "incomplete"
    assert report.normalized_rows[1].outcome == "incomplete"
    assert (cashier.wait.n_used, cashier.wait.mean_s, cashier.wait.n_excluded) == (1, 25.0, 0)
    assert (cashier.interval.n_used, cashier.interval.n_excluded) == (0, 1)
    assert cashier.interval.excluded_rows[0].row_key == "2026-10-20|caja|15"
    assert (delivery.wait.n_used, delivery.wait.n_excluded) == (0, 1)
    assert delivery.wait.excluded_rows[0].row_key == "2026-10-20|entrega|15"
    assert (delivery.interval.n_used, delivery.interval.mean_s, delivery.interval.n_excluded) == (
        1,
        60.0,
        0,
    )


def test_incomplete_row_with_start_and_end_participates_in_interval_overlap() -> None:
    source = csv_document(
        "entrega,2026-10-20,Martes,4,1,15:00:00,15:00:00,15:00:30,",
        "entrega,2026-10-20,Martes,4,2,,15:00:10,15:00:20,",
    )

    report = import_observations(source, source_name="partial-overlap.csv")

    summary = report.station_summaries[0]
    overlap = next(
        point for point in summary.concurrency.overlap_points if point.at == time(15, 0, 10)
    )
    assert report.normalized_rows[1].outcome == "incomplete"
    assert summary.concurrency.peak_concurrency == 2
    assert overlap.concurrent_count == 2
    assert {key.rsplit("|", 1)[1] for key in overlap.row_keys} == {"1", "2"}


def test_report_and_nested_row_values_are_immutable() -> None:
    report = import_observations(
        csv_document("caja,2026-10-20,Martes,1,1,15:00:00,15:00:10,15:00:20,"), "frozen.csv"
    )
    row = report.normalized_rows[0]

    assert isinstance(report.normalized_rows, tuple)
    assert isinstance(row.raw_fields, tuple)
    with pytest.raises(ValidationError):
        row.raw_fields = ("changed",)
    with pytest.raises(TypeError):
        row.raw_fields[0] = "changed"


def test_half_open_delivery_sweep_reports_the_six_rows_at_170010() -> None:
    source = (FIXTURES / "original.txt").read_bytes()

    report = import_observations(
        source,
        source_name="original.txt",
        correction_policy=APPROVED_PROFILE,
    )

    delivery = next(
        summary
        for summary in report.station_summaries
        if summary.station == "entrega" and summary.observation_date.isoformat() == "2026-10-20"
    )
    point = next(
        point for point in delivery.concurrency.overlap_points if point.at == time(17, 0, 10)
    )
    assert point.concurrent_count == 6
    assert {key.rsplit("|", 1)[1] for key in point.row_keys} == {"6", "7", "8", "9", "10", "11"}
    assert delivery.concurrency.reported_capacity == 4
    assert delivery.concurrency.capacity_consistent
    assert delivery.concurrency.exceeds_capacity is True
    assert any(
        issue.code == "capacity_exceeded"
        and issue.line_numbers == point.line_numbers
        and set(issue.row_keys) == set(point.row_keys)
        for issue in report.issues
    )

    cashier = next(summary for summary in report.station_summaries if summary.station == "caja")
    assert cashier.concurrency.interval_kind == "cashier_transaction_window"
    assert cashier.concurrency.exceeds_capacity is None
    assert "not active cashier work" in cashier.interval.label
    payment_overlap = next(
        issue for issue in report.issues if issue.code == "cashier_window_overlap"
    )
    assert payment_overlap.severity == "information"
    assert "not measure active cashier occupation" in payment_overlap.message


def test_half_open_ties_and_zero_length_intervals_do_not_create_phantom_overlap() -> None:
    source = csv_document(
        "entrega,2026-10-20,Martes,4,1,15:00:00,15:00:00,15:00:10,",
        "entrega,2026-10-20,Martes,4,2,15:00:10,15:00:10,15:00:20,",
        "entrega,2026-10-20,Martes,4,3,15:00:10,15:00:10,15:00:10,",
    )

    report = import_observations(source, source_name="half-open.csv")

    concurrency = report.station_summaries[0].concurrency
    zero_length = report.normalized_rows[2]
    assert zero_length.outcome == "served"
    assert zero_length.observed_interval_s == 0
    assert "zero_duration" in zero_length.quality_flags
    zero_warning = next(issue for issue in report.issues if issue.code == "zero_duration")
    assert zero_warning.severity == "warning"
    assert "do not use it as a positive future service-time parameter" in zero_warning.message
    assert report.station_summaries[0].interval.n_used == 3
    assert report.station_summaries[0].interval.total_s == 20
    assert concurrency.peak_concurrency == 1
    assert concurrency.peak_at == time(15, 0, 0)
    assert all(point.concurrent_count == 1 for point in concurrency.overlap_points)
    assert not any(point.at == time(15, 0, 10) for point in concurrency.overlap_points)


def test_reported_staff_capacity_is_consistent_only_within_each_station_date_segment() -> None:
    source = csv_document(
        "entrega,2026-10-20,Martes,2,1,15:00:00,15:00:00,15:00:30,",
        "entrega,2026-10-20,Martes,3,2,15:00:00,15:00:10,15:00:40,",
        "entrega,2026-10-21,Regular,1,1,15:00:00,15:00:00,15:00:20,",
    )

    report = import_observations(source, source_name="staff-segments.csv")

    first_day, second_day = report.station_summaries
    assert first_day.observation_date.isoformat() == "2026-10-20"
    assert first_day.reported_staff is None
    assert not first_day.staff_capacity_consistent
    assert first_day.concurrency.reported_capacity is None
    assert first_day.concurrency.exceeds_capacity is None
    assert second_day.observation_date.isoformat() == "2026-10-21"
    assert second_day.reported_staff == 1
    assert second_day.staff_capacity_consistent
    assert second_day.concurrency.reported_capacity == 1
    assert not any(issue.code == "capacity_exceeded" for issue in report.issues)
    assert any(issue.code == "inconsistent_reported_staff" for issue in report.issues)


def test_corrected_station_summaries_match_independent_observation_totals_and_serialize() -> None:
    source = (FIXTURES / "original.txt").read_bytes()

    report = import_observations(
        source,
        source_name="original.txt",
        correction_policy=APPROVED_PROFILE,
    )

    cashier = next(summary for summary in report.station_summaries if summary.station == "caja")
    delivery = next(summary for summary in report.station_summaries if summary.station == "entrega")
    assert (cashier.row_count, cashier.served_count, cashier.withdrawn_count) == (61, 58, 3)
    assert (cashier.wait.unit, cashier.wait.n_used, cashier.wait.n_excluded) == ("seconds", 58, 3)
    assert (cashier.wait.total_s, cashier.wait.minimum_s, cashier.wait.maximum_s) == (6353, 1, 474)
    assert cashier.wait.mean_s == 109.53448275862069
    assert cashier.wait.excluded_by_reason == (("withdrawn", 3),)
    assert [item.row_key for item in cashier.wait.excluded_rows] == [
        "2026-10-20|caja|16",
        "2026-10-20|caja|19",
        "2026-10-20|caja|49",
    ]
    assert (cashier.interval.n_used, cashier.interval.n_excluded) == (58, 3)
    assert (cashier.interval.total_s, cashier.interval.minimum_s, cashier.interval.maximum_s) == (
        4816,
        1,
        271,
    )
    assert cashier.interval.mean_s == 83.03448275862069
    assert (delivery.row_count, delivery.served_count, delivery.invalid_count) == (58, 58, 0)
    assert (delivery.wait.n_used, delivery.wait.n_excluded) == (58, 0)
    assert (delivery.wait.total_s, delivery.wait.minimum_s, delivery.wait.maximum_s) == (
        1331,
        0,
        238,
    )
    assert delivery.wait.mean_s == 22.948275862068964
    assert (delivery.interval.n_used, delivery.interval.n_excluded) == (58, 0)
    assert (
        delivery.interval.total_s,
        delivery.interval.minimum_s,
        delivery.interval.maximum_s,
    ) == (16532, 8, 538)
    assert delivery.interval.mean_s == 285.0344827586207
    assert json.loads(report.model_dump_json())["contract_version"] == 1
