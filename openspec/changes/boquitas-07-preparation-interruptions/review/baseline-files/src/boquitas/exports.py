"""Versioned JSON and rectangular UTF-8 CSV serializers."""

from __future__ import annotations

import csv
import io
import json
import math
from collections.abc import Iterable, Mapping
from pathlib import Path

from pydantic import BaseModel

from .experiments import (
    ExperimentResult,
    MetricEstimate,
    PairedComparison,
    RunResult,
)
from .metrics_models import MetricSummary, OrderMetric, PersonMetric
from .observation_import import ImportReport, ObservationRow, StationSummary
from .scenarios import Scenario

_ORDER_HEADERS = (
    "scenario_id",
    "scenario_provenance",
    "root_seed",
    "replication_index",
    "order_id",
    "person_ids_json",
    "cohort",
    "state",
    "arrival_s",
    "payment_started_s",
    "payment_active_ended_s",
    "payment_completed_s",
    "preparation_started_s",
    "delivery_s",
    "abandonment_s",
    "payment_wait_s",
    "transaction_elapsed_s",
    "preparation_queue_wait_s",
    "preparation_elapsed_s",
    "permanence_s",
    "withdrawal_wait_s",
    "unavailable_fields_json",
)
_PERSON_HEADERS = (
    "scenario_id",
    "scenario_provenance",
    "root_seed",
    "replication_index",
    "person_id",
    "order_id",
    *(
        header
        for header in _ORDER_HEADERS
        if header
        not in {
            "scenario_id",
            "scenario_provenance",
            "root_seed",
            "replication_index",
            "order_id",
            "person_ids_json",
        }
    ),
)
_EVENT_HEADERS = (
    "scenario_id",
    "scenario_provenance",
    "root_seed",
    "replication_index",
    "seq",
    "time_s",
    "event_type",
    "order_id",
    "person_ids_json",
    "worker_id",
    "stage",
    "queue",
    "queue_rank",
    "worker_reserved",
    "worker_active",
    "event_data_json",
)
_METRIC_HEADERS = (
    "record_type",
    "scenario_id",
    "scenario_display_name",
    "scenario_provenance",
    "replication_index",
    "root_seed",
    "metric_id",
    "unit",
    "population",
    "cohort",
    "count",
    "n_valid",
    "n_requested",
    "denominator",
    "value",
    "mean",
    "median",
    "p95",
    "maximum",
    "lower",
    "upper",
    "confidence_level",
    "reason",
    "interpretation",
    "physical_bounds_crossed_json",
)
_REPLICATION_HEADERS = (
    "scenario_id",
    "scenario_display_name",
    "scenario_provenance",
    "replication_index",
    "root_seed",
    "status",
    "metric_count",
    "issue_count",
    "issues_json",
)
_COMPARISON_HEADERS = (
    "root_seed",
    "reference_scenario_id",
    "reference_scenario_provenance",
    "candidate_scenario_id",
    "candidate_scenario_provenance",
    "metric_id",
    "unit",
    "population",
    "cohort",
    "n_requested",
    "n_valid",
    "difference_mean",
    "difference_lower",
    "difference_upper",
    "confidence_level",
    "reason",
    "interpretation",
    "replication_differences_json",
    "demand_matched",
    "demand_tapes_identical",
    "generation_assumptions_differ",
)


def dump_scenario_json(scenario: Scenario) -> str:
    return scenario.model_dump_json(indent=2)


def load_scenario_json(payload: str | bytes) -> Scenario:
    return Scenario.model_validate_json(payload)


def dump_run_json(run: RunResult) -> str:
    return run.model_dump_json(indent=2)


def load_run_json(payload: str | bytes) -> RunResult:
    return RunResult.model_validate_json(payload)


def dump_experiment_json(experiment: ExperimentResult) -> str:
    return experiment.model_dump_json(indent=2)


def load_experiment_json(payload: str | bytes) -> ExperimentResult:
    return ExperimentResult.model_validate_json(payload)


def save_json(path: str | Path, artifact: Scenario | RunResult | ExperimentResult) -> Path:
    """Write one complete versioned JSON contract using UTF-8."""

    destination = Path(path)
    destination.write_text(artifact.model_dump_json(indent=2), encoding="utf-8")
    return destination


def export_csv_tables(
    result: RunResult | ExperimentResult,
    *,
    observations: ImportReport | None = None,
) -> dict[str, str]:
    """Return separate rectangular CSV tables for one run or an experiment."""

    if isinstance(result, RunResult):
        tables = {
            "orders.csv": _write_table(
                _ORDER_HEADERS,
                _order_rows(
                    result.metrics.orders,
                    scenario_id=result.scenario.scenario_id,
                    scenario_provenance=result.scenario.provenance,
                    root_seed=result.root_seed,
                    replication_index=result.replication_index,
                ),
            ),
            "people.csv": _write_table(
                _PERSON_HEADERS,
                _person_rows(
                    result.metrics.people,
                    scenario_id=result.scenario.scenario_id,
                    scenario_provenance=result.scenario.provenance,
                    root_seed=result.root_seed,
                    replication_index=result.replication_index,
                ),
            ),
            "events.csv": _write_table(_EVENT_HEADERS, _event_rows(result)),
            "metrics.csv": _write_table(_METRIC_HEADERS, _run_metric_rows(result)),
            "replications.csv": _write_table(
                _REPLICATION_HEADERS,
                [_run_replication_row(result)],
            ),
            "comparisons.csv": _write_table(_COMPARISON_HEADERS, []),
        }
    else:
        scenarios = {scenario.scenario_id: scenario for scenario in result.scenarios}
        tables = {
            "orders.csv": _write_table(_ORDER_HEADERS, []),
            "people.csv": _write_table(_PERSON_HEADERS, []),
            "events.csv": _write_table(_EVENT_HEADERS, []),
            "metrics.csv": _write_table(_METRIC_HEADERS, _experiment_metric_rows(result)),
            "replications.csv": _write_table(
                _REPLICATION_HEADERS,
                _experiment_replication_rows(result, scenarios),
            ),
            "comparisons.csv": _write_table(
                _COMPARISON_HEADERS,
                [
                    _comparison_row(
                        comparison,
                        root_seed=result.root_seed,
                        reference_provenance=scenarios[
                            comparison.reference_scenario_id
                        ].provenance,
                        candidate_provenance=scenarios[
                            comparison.candidate_scenario_id
                        ].provenance,
                    )
                    for comparison in result.comparisons
                ],
            ),
        }

    if observations is not None:
        tables.update(_observation_tables(observations))
    return tables


def write_csv_tables(
    directory: str | Path,
    result: RunResult | ExperimentResult,
    *,
    observations: ImportReport | None = None,
) -> dict[str, Path]:
    """Write every separate table as UTF-8 and return its path."""

    output_dir = Path(directory)
    output_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}
    for filename, content in export_csv_tables(result, observations=observations).items():
        path = output_dir / filename
        path.write_text(content, encoding="utf-8", newline="")
        written[filename] = path
    return written


def _order_rows(
    orders: Iterable[OrderMetric],
    *,
    scenario_id: str,
    scenario_provenance: str,
    root_seed: int,
    replication_index: int,
) -> list[dict[str, object]]:
    return [
        {
            "scenario_id": scenario_id,
            "scenario_provenance": scenario_provenance,
            "root_seed": root_seed,
            "replication_index": replication_index,
            **order.model_dump(mode="json", exclude={"person_ids", "unavailable_fields"}),
            "person_ids_json": _json_text(order.person_ids),
            "unavailable_fields_json": _json_text(order.unavailable_fields),
        }
        for order in orders
    ]


def _person_rows(
    people: Iterable[PersonMetric],
    *,
    scenario_id: str,
    scenario_provenance: str,
    root_seed: int,
    replication_index: int,
) -> list[dict[str, object]]:
    return [
        {
            "scenario_id": scenario_id,
            "scenario_provenance": scenario_provenance,
            "root_seed": root_seed,
            "replication_index": replication_index,
            **person.model_dump(mode="json", exclude={"unavailable_fields"}),
            "unavailable_fields_json": _json_text(person.unavailable_fields),
        }
        for person in people
    ]


def _event_rows(run: RunResult) -> list[dict[str, object]]:
    return [
        {
            "seq": event.seq,
            "scenario_id": run.scenario.scenario_id,
            "scenario_provenance": run.scenario.provenance,
            "root_seed": run.root_seed,
            "replication_index": run.replication_index,
            "time_s": event.time_s,
            "event_type": event.type,
            "order_id": event.order_id,
            "person_ids_json": _json_text(event.person_ids),
            "worker_id": event.worker_id,
            "stage": event.data.stage,
            "queue": event.data.queue,
            "queue_rank": event.data.queue_rank,
            "worker_reserved": event.data.worker_reserved,
            "worker_active": event.data.worker_active,
            "event_data_json": event.data.model_dump_json(),
        }
        for event in run.trace.events
    ]


def _run_metric_rows(run: RunResult) -> list[dict[str, object]]:
    return [
        {
            "record_type": "replication",
            "scenario_id": run.scenario.scenario_id,
            "scenario_display_name": run.scenario.display_name,
            "scenario_provenance": run.scenario.provenance,
            "replication_index": run.replication_index,
            "root_seed": run.root_seed,
            "n_requested": 1,
            **_metric_summary_row(summary),
        }
        for summary in run.metrics.metric_summaries
    ]


def _experiment_metric_rows(experiment: ExperimentResult) -> list[dict[str, object]]:
    scenarios = {scenario.scenario_id: scenario for scenario in experiment.scenarios}
    rows: list[dict[str, object]] = []
    for replication in experiment.replication_results:
        if replication.metrics is None:
            continue
        scenario = scenarios[replication.scenario_id]
        rows.extend(
            {
                "record_type": "replication",
                "scenario_id": scenario.scenario_id,
                "scenario_display_name": scenario.display_name,
                "scenario_provenance": scenario.provenance,
                "replication_index": replication.replication_index,
                "root_seed": experiment.root_seed,
                "n_requested": experiment.n_requested,
                **_metric_summary_row(summary),
            }
            for summary in replication.metrics.metric_summaries
        )
    rows.extend(
        _estimate_row(
            estimate,
            scenarios[estimate.scenario_id].display_name,
            scenario_provenance=scenarios[estimate.scenario_id].provenance,
            root_seed=experiment.root_seed,
        )
        for estimate in experiment.aggregate_estimates
    )
    return rows


def _metric_summary_row(summary: MetricSummary) -> dict[str, object]:
    return {
        "metric_id": summary.metric_id,
        "unit": summary.unit,
        "population": summary.population,
        "cohort": summary.cohort,
        "count": summary.count,
        "n_valid": summary.n_valid,
        "denominator": summary.denominator,
        "value": summary.value,
        "mean": summary.mean,
        "median": summary.median,
        "p95": summary.p95,
        "maximum": summary.maximum,
        "reason": summary.unavailable_reason,
        "interpretation": None,
    }


def _estimate_row(
    estimate: MetricEstimate,
    scenario_display_name: str,
    *,
    scenario_provenance: str,
    root_seed: int,
) -> dict[str, object]:
    return {
        "record_type": "aggregate",
        "scenario_id": estimate.scenario_id,
        "scenario_display_name": scenario_display_name,
        "scenario_provenance": scenario_provenance,
        "root_seed": root_seed,
        "metric_id": estimate.metric_id,
        "unit": estimate.unit,
        "population": estimate.population,
        "cohort": estimate.cohort,
        "n_requested": estimate.estimate.n_requested,
        "n_valid": estimate.estimate.n_valid,
        "denominator": estimate.denominator,
        "value": estimate.estimate.mean,
        "mean": estimate.estimate.mean,
        "lower": estimate.estimate.lower,
        "upper": estimate.estimate.upper,
        "confidence_level": estimate.estimate.confidence_level,
        "reason": estimate.estimate.reason,
        "interpretation": estimate.estimate.interpretation,
        "physical_bounds_crossed_json": _json_text(estimate.estimate.physical_bounds_crossed),
    }


def _run_replication_row(run: RunResult) -> dict[str, object]:
    return {
        "scenario_id": run.scenario.scenario_id,
        "scenario_display_name": run.scenario.display_name,
        "scenario_provenance": run.scenario.provenance,
        "replication_index": run.replication_index,
        "root_seed": run.root_seed,
        "status": "complete",
        "metric_count": len(run.metrics.metric_summaries),
        "issue_count": 0,
        "issues_json": "[]",
    }


def _experiment_replication_rows(
    experiment: ExperimentResult,
    scenarios: Mapping[str, Scenario],
) -> list[dict[str, object]]:
    return [
        {
            "scenario_id": result.scenario_id,
            "scenario_display_name": scenarios[result.scenario_id].display_name,
            "scenario_provenance": scenarios[result.scenario_id].provenance,
            "replication_index": result.replication_index,
            "root_seed": experiment.root_seed,
            "status": result.status,
            "metric_count": (
                len(result.metrics.metric_summaries) if result.metrics is not None else 0
            ),
            "issue_count": len(result.issues),
            "issues_json": _json_text(result.issues),
        }
        for result in experiment.replication_results
    ]


def _comparison_row(
    comparison: PairedComparison,
    *,
    root_seed: int,
    reference_provenance: str,
    candidate_provenance: str,
) -> dict[str, object]:
    return {
        "root_seed": root_seed,
        "reference_scenario_id": comparison.reference_scenario_id,
        "reference_scenario_provenance": reference_provenance,
        "candidate_scenario_id": comparison.candidate_scenario_id,
        "candidate_scenario_provenance": candidate_provenance,
        "metric_id": comparison.metric_id,
        "unit": comparison.unit,
        "population": comparison.population,
        "cohort": comparison.cohort,
        "n_requested": comparison.estimate.n_requested,
        "n_valid": comparison.estimate.n_valid,
        "difference_mean": comparison.estimate.mean,
        "difference_lower": comparison.estimate.lower,
        "difference_upper": comparison.estimate.upper,
        "confidence_level": comparison.estimate.confidence_level,
        "reason": comparison.estimate.reason,
        "interpretation": comparison.estimate.interpretation,
        "replication_differences_json": _json_text(comparison.replication_differences),
        "demand_matched": comparison.demand_matched,
        "demand_tapes_identical": comparison.demand_tapes_identical,
        "generation_assumptions_differ": comparison.generation_assumptions_differ,
    }


def _observation_tables(report: ImportReport) -> dict[str, str]:
    row_headers = (
        "source_name",
        "source_sha256",
        "correction_policy",
        "policy_status",
        "view",
        "line_number",
        "station",
        "observation_date",
        "day_type",
        "reported_staff",
        "local_id",
        "qualified_key",
        "arrival_time",
        "start_time",
        "end_time",
        "departure_time",
        "outcome",
        "group_size",
        "group_size_reason",
        "observed_wait_s",
        "observed_interval_s",
        "validity_flags_json",
        "quality_flags_json",
        "raw_fields_json",
        "normalized_fields_json",
    )
    observation_rows = [
        _observation_row(report, "raw", row) for row in report.raw_rows
    ] + [_observation_row(report, "normalized", row) for row in report.normalized_rows] + [
        _observation_row(report, "excluded", row) for row in report.excluded_rows
    ]
    issue_headers = (
        "source_name",
        "source_sha256",
        "correction_policy",
        "policy_status",
        "code",
        "severity",
        "row_keys_json",
        "line_numbers_json",
        "fields_json",
        "affected_view",
        "message",
    )
    issue_rows = [
        {
            "source_name": report.source_name,
            "source_sha256": report.source_sha256,
            "correction_policy": report.correction_policy,
            "policy_status": report.policy_status,
            "code": issue.code,
            "severity": issue.severity,
            "row_keys_json": _json_text(issue.row_keys),
            "line_numbers_json": _json_text(issue.line_numbers),
            "fields_json": _json_text(issue.fields),
            "affected_view": issue.affected_view,
            "message": issue.message,
        }
        for issue in report.issues
    ]
    summary_headers = (
        "source_name",
        "source_sha256",
        "correction_policy",
        "policy_status",
        "station",
        "observation_date",
        "record_unit",
        "row_count",
        "served_count",
        "withdrawn_count",
        "incomplete_count",
        "invalid_count",
        "reported_staff",
        "staff_capacity_consistent",
        "wait_summary_json",
        "interval_summary_json",
        "concurrency_summary_json",
    )
    summary_rows = [
        {
            "source_name": report.source_name,
            "source_sha256": report.source_sha256,
            "correction_policy": report.correction_policy,
            "policy_status": report.policy_status,
            **_station_summary_row(summary),
        }
        for summary in report.station_summaries
    ]
    correction_headers = (
        "source_name",
        "source_sha256",
        "correction_policy",
        "policy_status",
        "action",
        "status",
        "row_key",
        "field",
        "before",
        "after",
        "reason",
        "profile",
        "line_number",
    )
    correction_rows = [
        {
            "source_name": report.source_name,
            "source_sha256": report.source_sha256,
            "correction_policy": report.correction_policy,
            "policy_status": report.policy_status,
            **correction.model_dump(mode="json"),
        }
        for correction in report.corrections
    ]
    return {
        "observation_rows.csv": _write_table(row_headers, observation_rows),
        "observation_issues.csv": _write_table(issue_headers, issue_rows),
        "observation_summaries.csv": _write_table(summary_headers, summary_rows),
        "observation_corrections.csv": _write_table(correction_headers, correction_rows),
    }


def _observation_row(report: ImportReport, view: str, row: ObservationRow) -> dict[str, object]:
    return {
        "source_name": report.source_name,
        "source_sha256": report.source_sha256,
        "correction_policy": report.correction_policy,
        "policy_status": report.policy_status,
        "view": view,
        "line_number": row.line_number,
        "station": row.station,
        "observation_date": row.observation_date.isoformat() if row.observation_date else None,
        "day_type": row.day_type,
        "reported_staff": row.reported_staff,
        "local_id": row.local_id,
        "qualified_key": row.qualified_key,
        "arrival_time": row.arrival_time.isoformat() if row.arrival_time else None,
        "start_time": row.start_time.isoformat() if row.start_time else None,
        "end_time": row.end_time.isoformat() if row.end_time else None,
        "departure_time": row.departure_time.isoformat() if row.departure_time else None,
        "outcome": row.outcome,
        "group_size": row.group_size,
        "group_size_reason": row.group_size_reason,
        "observed_wait_s": row.observed_wait_s,
        "observed_interval_s": row.observed_interval_s,
        "validity_flags_json": _json_text(row.validity_flags),
        "quality_flags_json": _json_text(row.quality_flags),
        "raw_fields_json": _json_text(row.raw_fields),
        "normalized_fields_json": _json_text(row.normalized_fields),
    }


def _station_summary_row(summary: StationSummary) -> dict[str, object]:
    return {
        "station": summary.station,
        "observation_date": summary.observation_date.isoformat(),
        "record_unit": summary.record_unit,
        "row_count": summary.row_count,
        "served_count": summary.served_count,
        "withdrawn_count": summary.withdrawn_count,
        "incomplete_count": summary.incomplete_count,
        "invalid_count": summary.invalid_count,
        "reported_staff": summary.reported_staff,
        "staff_capacity_consistent": summary.staff_capacity_consistent,
        "wait_summary_json": summary.wait.model_dump_json(),
        "interval_summary_json": summary.interval.model_dump_json(),
        "concurrency_summary_json": summary.concurrency.model_dump_json(),
    }


def _write_table(headers: tuple[str, ...], rows: Iterable[Mapping[str, object]]) -> str:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(
        buffer,
        fieldnames=headers,
        delimiter=",",
        lineterminator="\n",
        extrasaction="ignore",
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({header: _csv_cell(row.get(header)) for header in headers})
    return buffer.getvalue()


def _csv_cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        if value.lstrip().startswith(("=", "+", "-", "@")):
            return "'" + value
        return value
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("CSV scientific values must be finite or unavailable.")
        return repr(value)
    if isinstance(value, BaseModel):
        return _json_text(value)
    return str(value)


def _json_text(value: object) -> str:
    return json.dumps(
        _json_ready(value),
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    )


def _json_ready(value: object) -> object:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, Mapping):
        return {str(key): _json_ready(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_json_ready(item) for item in value]
    return value
