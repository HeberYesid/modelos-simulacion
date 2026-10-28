"""Replayable selected runs and bounded replication experiments."""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Annotated, Literal, cast, overload

from pydantic import Field, model_validator

from .demand import generate_demand
from .engine import simulate
from .metrics import summarize
from .metrics_models import MetricSummary, RunMetrics, RunMetricsV2, RunMetricsVersion
from .models import (
    InitialOrder,
    OrderInput,
    PublicModel,
    SimulationTrace,
    SimulationTraceV2,
)
from .scenarios import Scenario, ScenarioV2, ScenarioVersion
from .statistics import MeanInterval, mean_confidence_interval

MAX_REPLICATIONS = 200
MAX_SCENARIOS = 8


class RunResult(PublicModel):
    """Self-contained explicit inputs, trace and metrics for one replication."""

    contract_version: Literal[1] = 1
    scenario: Scenario
    root_seed: int = Field(ge=0, strict=True)
    replication_index: int = Field(ge=0, strict=True)
    assumptions: tuple[str, ...]
    demand_tape: tuple[OrderInput, ...]
    initial_state: tuple[InitialOrder, ...]
    trace: SimulationTrace
    metrics: RunMetrics


class RunResultV2(PublicModel):
    """Self-contained version-2 inputs, trace and metrics for one replication."""

    contract_version: Literal[2] = 2
    scenario: ScenarioV2
    root_seed: int = Field(ge=0, strict=True)
    replication_index: int = Field(ge=0, strict=True)
    assumptions: tuple[str, ...]
    demand_tape: tuple[OrderInput, ...]
    initial_state: tuple[InitialOrder, ...]
    trace: SimulationTraceV2
    metrics: RunMetricsV2


class ExperimentIssue(PublicModel):
    """An explicit diagnostic retained from a failed scenario replication."""

    scenario_id: str
    replication_index: int = Field(ge=0, strict=True)
    code: str
    message: str


class ReplicationResult(PublicModel):
    """One scenario and replication's scalar metrics or retained failure."""

    scenario_id: str
    replication_index: int = Field(ge=0, strict=True)
    status: Literal["complete", "failed"]
    metrics: RunMetrics | None = None
    issues: tuple[ExperimentIssue, ...] = ()


class ReplicationResultV2(PublicModel):
    """One version-2 experiment member, retaining its scenario metric version."""

    scenario_id: str
    replication_index: int = Field(ge=0, strict=True)
    status: Literal["complete", "failed"]
    metrics: RunMetricsVersion | None = None
    issues: tuple[ExperimentIssue, ...] = ()


class MetricEstimate(PublicModel):
    """A Student-t estimate over one scalar metric per replication."""

    scenario_id: str
    metric_id: str
    unit: str
    population: str
    cohort: str
    denominator: float | None = None
    estimate: MeanInterval


class PairedComparison(PublicModel):
    """Candidate-minus-reference estimate paired by replication index."""

    reference_scenario_id: str
    candidate_scenario_id: str
    metric_id: str
    unit: str
    population: str
    cohort: str
    replication_differences: tuple[float | None, ...]
    estimate: MeanInterval
    demand_matched: bool
    demand_tapes_identical: bool | None
    generation_assumptions_differ: bool


class ExperimentResult(PublicModel):
    """Batch summaries with no retained per-replication event traces."""

    contract_version: Literal[1] = 1
    scenarios: tuple[Scenario, ...]
    root_seed: int = Field(ge=0, strict=True)
    n_requested: int = Field(ge=1, le=MAX_REPLICATIONS, strict=True)
    n_valid: int = Field(ge=0, strict=True)
    confidence_level: float = Field(gt=0, lt=1, allow_inf_nan=False)
    replication_results: tuple[ReplicationResult, ...]
    aggregate_estimates: tuple[MetricEstimate, ...]
    comparisons: tuple[PairedComparison, ...]
    status: Literal["complete", "failed"]
    issues: tuple[ExperimentIssue, ...] = ()
    provenance: tuple[str, ...]


class ExperimentResultV2(PublicModel):
    """Version-2 envelope that can compare legacy and scripted scenarios."""

    contract_version: Literal[2] = 2
    scenarios: tuple[ScenarioVersion, ...]
    root_seed: int = Field(ge=0, strict=True)
    n_requested: int = Field(ge=1, le=MAX_REPLICATIONS, strict=True)
    n_valid: int = Field(ge=0, strict=True)
    confidence_level: float = Field(gt=0, lt=1, allow_inf_nan=False)
    replication_results: tuple[ReplicationResultV2, ...]
    aggregate_estimates: tuple[MetricEstimate, ...]
    comparisons: tuple[PairedComparison, ...]
    status: Literal["complete", "failed"]
    issues: tuple[ExperimentIssue, ...] = ()
    provenance: tuple[str, ...]

    @model_validator(mode="after")
    def validate_member_versions(self) -> ExperimentResultV2:
        scenarios_by_id = {scenario.scenario_id: scenario for scenario in self.scenarios}
        if len(scenarios_by_id) != len(self.scenarios):
            raise ValueError("Scenario IDs must be unique within a version-2 experiment.")
        if not any(scenario.contract_version == 2 for scenario in self.scenarios):
            raise ValueError("A version-2 experiment must contain a version-2 scenario.")

        for index, replication in enumerate(self.replication_results):
            scenario = scenarios_by_id.get(replication.scenario_id)
            if scenario is None:
                raise ValueError(
                    f"replication_results[{index}].scenario_id references no scenario."
                )
            if replication.status == "complete" and replication.metrics is None:
                raise ValueError(
                    f"replication_results[{index}].metrics is required for a complete run."
                )
            if replication.status == "failed" and replication.metrics is not None:
                raise ValueError(
                    f"replication_results[{index}].metrics must be absent for a failed run."
                )
            if (
                replication.metrics is not None
                and replication.metrics.contract_version != scenario.contract_version
            ):
                raise ValueError(
                    f"replication_results[{index}].metrics version must match its scenario."
                )
        return self


RunResultVersion = Annotated[
    RunResult | RunResultV2,
    Field(discriminator="contract_version"),
]
ExperimentResultVersion = Annotated[
    ExperimentResult | ExperimentResultV2,
    Field(discriminator="contract_version"),
]


@overload
def run_scenario(
    scenario: Scenario,
    *,
    root_seed: int | None = None,
    replication_index: int = 0,
) -> RunResult: ...


@overload
def run_scenario(
    scenario: ScenarioV2,
    *,
    root_seed: int | None = None,
    replication_index: int = 0,
) -> RunResultV2: ...


def run_scenario(
    scenario: Scenario | ScenarioV2,
    *,
    root_seed: int | None = None,
    replication_index: int = 0,
) -> RunResult | RunResultV2:
    """Run one selected tape and retain everything needed for later replay."""

    seed = scenario.default_root_seed if root_seed is None else root_seed
    _require_nonnegative_integer(seed, "root_seed")
    _require_nonnegative_integer(replication_index, "replication_index")
    demand = generate_demand(
        scenario,
        root_seed=seed,
        replication_index=replication_index,
    )
    if isinstance(scenario, ScenarioV2):
        trace_v2 = simulate(
            scenario.engine_config,
            demand=demand,
            initial_state=scenario.initial_state,
        )
        metrics_v2 = summarize(trace_v2)
        return RunResultV2(
            scenario=scenario,
            root_seed=seed,
            replication_index=replication_index,
            assumptions=scenario.assumptions,
            demand_tape=tuple(demand),
            initial_state=scenario.initial_state,
            trace=trace_v2,
            metrics=metrics_v2,
        )
    trace_v1 = simulate(
        scenario.engine_config,
        demand=demand,
        initial_state=scenario.initial_state,
    )
    metrics_v1 = summarize(trace_v1)
    return RunResult(
        scenario=scenario,
        root_seed=seed,
        replication_index=replication_index,
        assumptions=scenario.assumptions,
        demand_tape=tuple(demand),
        initial_state=scenario.initial_state,
        trace=trace_v1,
        metrics=metrics_v1,
    )


@overload
def run_experiment(
    scenarios: Sequence[Scenario],
    *,
    root_seed: int = 20261020,
    replications: int = 30,
    confidence_level: float = 0.95,
) -> ExperimentResult: ...


@overload
def run_experiment(
    scenarios: Sequence[ScenarioV2],
    *,
    root_seed: int = 20261020,
    replications: int = 30,
    confidence_level: float = 0.95,
) -> ExperimentResultV2: ...


@overload
def run_experiment(
    scenarios: Sequence[Scenario | ScenarioV2],
    *,
    root_seed: int = 20261020,
    replications: int = 30,
    confidence_level: float = 0.95,
) -> ExperimentResult | ExperimentResultV2: ...


def run_experiment(
    scenarios: Sequence[Scenario | ScenarioV2],
    *,
    root_seed: int = 20261020,
    replications: int = 30,
    confidence_level: float = 0.95,
) -> ExperimentResult | ExperimentResultV2:
    """Run bounded sequential replications and pair every candidate to the first."""

    _require_nonnegative_integer(root_seed, "root_seed")
    if isinstance(replications, bool) or not isinstance(replications, int):
        raise ValueError("replications must be an integer.")
    if not 1 <= replications <= MAX_REPLICATIONS:
        raise ValueError(f"replications must be between 1 and {MAX_REPLICATIONS}.")
    if not math.isfinite(confidence_level) or not 0 < confidence_level < 1:
        raise ValueError("confidence_level must be finite and strictly between 0 and 1.")
    scenarios = tuple(scenarios)
    if not 1 <= len(scenarios) <= MAX_SCENARIOS:
        raise ValueError(f"scenarios must contain between 1 and {MAX_SCENARIOS} entries.")
    scenario_ids = [scenario.scenario_id for scenario in scenarios]
    if len(scenario_ids) != len(set(scenario_ids)):
        raise ValueError("Scenario IDs must be unique within an experiment.")

    has_version2 = any(isinstance(scenario, ScenarioV2) for scenario in scenarios)
    records: list[ReplicationResult | ReplicationResultV2] = []
    all_issues: list[ExperimentIssue] = []
    tapes_by_candidate: dict[str, list[bool | None]] = {
        scenario.scenario_id: [] for scenario in scenarios[1:]
    }
    generation_differs = {
        scenario.scenario_id: _generation_assumptions(scenario)
        != _generation_assumptions(scenarios[0])
        for scenario in scenarios[1:]
    }

    for replication_index in range(replications):
        reference_tape: tuple[OrderInput, ...] | None = None
        for scenario_index, scenario in enumerate(scenarios):
            try:
                run = run_scenario(
                    scenario,
                    root_seed=root_seed,
                    replication_index=replication_index,
                )
            except Exception as error:
                issue = _make_issue(scenario.scenario_id, replication_index, error)
                all_issues.append(issue)
                record_type = ReplicationResultV2 if has_version2 else ReplicationResult
                records.append(
                    record_type(
                        scenario_id=scenario.scenario_id,
                        replication_index=replication_index,
                        status="failed",
                        issues=(issue,),
                    )
                )
                if scenario_index > 0:
                    tapes_by_candidate[scenario.scenario_id].append(None)
                continue

            if has_version2:
                records.append(
                    ReplicationResultV2(
                        scenario_id=scenario.scenario_id,
                        replication_index=replication_index,
                        status="complete",
                        metrics=run.metrics,
                    )
                )
            else:
                if not isinstance(run, RunResult):
                    raise TypeError("Version-1 experiments require version-1 selected runs.")
                records.append(
                    ReplicationResult(
                        scenario_id=scenario.scenario_id,
                        replication_index=replication_index,
                        status="complete",
                        metrics=run.metrics,
                    )
                )
            if scenario_index == 0:
                reference_tape = run.demand_tape
            else:
                tapes_by_candidate[scenario.scenario_id].append(
                    run.demand_tape == reference_tape if reference_tape is not None else None
                )

    aggregates = _aggregate_estimates(records, scenarios, replications, confidence_level)
    comparisons = _paired_comparisons(
        records,
        scenarios,
        tapes_by_candidate,
        generation_differs,
        replications,
        confidence_level,
    )
    n_valid = sum(
        all(
            item.status == "complete"
            for item in records
            if item.replication_index == replication_index
        )
        for replication_index in range(replications)
    )
    if has_version2:
        return ExperimentResultV2(
            scenarios=scenarios,
            root_seed=root_seed,
            n_requested=replications,
            n_valid=n_valid,
            confidence_level=confidence_level,
            replication_results=cast(tuple[ReplicationResultV2, ...], tuple(records)),
            aggregate_estimates=aggregates,
            comparisons=comparisons,
            status="complete" if not all_issues else "failed",
            issues=tuple(all_issues),
            provenance=tuple(dict.fromkeys(scenario.provenance for scenario in scenarios)),
        )
    return ExperimentResult(
        scenarios=cast(tuple[Scenario, ...], scenarios),
        root_seed=root_seed,
        n_requested=replications,
        n_valid=n_valid,
        confidence_level=confidence_level,
        replication_results=tuple(cast(list[ReplicationResult], records)),
        aggregate_estimates=aggregates,
        comparisons=comparisons,
        status="complete" if not all_issues else "failed",
        issues=tuple(all_issues),
        provenance=tuple(dict.fromkeys(scenario.provenance for scenario in scenarios)),
    )


def _aggregate_estimates(
    records: Sequence[ReplicationResult | ReplicationResultV2],
    scenarios: Sequence[Scenario | ScenarioV2],
    n_requested: int,
    confidence_level: float,
) -> tuple[MetricEstimate, ...]:
    estimates: list[MetricEstimate] = []
    for scenario in scenarios:
        scenario_records = _records_for_scenario(records, scenario.scenario_id)
        metric_ids = sorted(
            {
                summary.metric_id
                for record in scenario_records
                if record.metrics is not None
                for summary in record.metrics.metric_summaries
            }
        )
        for metric_id in metric_ids:
            summaries = [
                _summary_for(record.metrics, metric_id) if record.metrics is not None else None
                for record in scenario_records
            ]
            template = next(summary for summary in summaries if summary is not None)
            interval = mean_confidence_interval(
                [summary.value if summary is not None else None for summary in summaries],
                n_requested=n_requested,
                confidence_level=confidence_level,
                physical_bounds=_physical_bounds(metric_id),
            )
            estimates.append(
                MetricEstimate(
                    scenario_id=scenario.scenario_id,
                    metric_id=metric_id,
                    unit=template.unit,
                    population=template.population,
                    cohort=template.cohort,
                    denominator=template.denominator,
                    estimate=interval,
                )
            )
    return tuple(estimates)


def _paired_comparisons(
    records: Sequence[ReplicationResult | ReplicationResultV2],
    scenarios: Sequence[Scenario | ScenarioV2],
    tapes_by_candidate: dict[str, list[bool | None]],
    generation_differs: dict[str, bool],
    n_requested: int,
    confidence_level: float,
) -> tuple[PairedComparison, ...]:
    if len(scenarios) < 2:
        return ()
    reference = scenarios[0]
    reference_records = {
        record.replication_index: record
        for record in _records_for_scenario(records, reference.scenario_id)
    }
    comparisons: list[PairedComparison] = []
    for candidate in scenarios[1:]:
        candidate_records = {
            record.replication_index: record
            for record in _records_for_scenario(records, candidate.scenario_id)
        }
        metric_ids = sorted(
            {
                summary.metric_id
                for record in (*reference_records.values(), *candidate_records.values())
                if record.metrics is not None
                for summary in record.metrics.metric_summaries
            }
        )
        for metric_id in metric_ids:
            differences: list[float | None] = []
            template: MetricSummary | None = None
            for replication_index in range(n_requested):
                reference_record = reference_records[replication_index]
                candidate_record = candidate_records[replication_index]
                reference_summary = (
                    _summary_for(reference_record.metrics, metric_id)
                    if reference_record.metrics is not None
                    else None
                )
                candidate_summary = (
                    _summary_for(candidate_record.metrics, metric_id)
                    if candidate_record.metrics is not None
                    else None
                )
                if candidate_summary is not None:
                    template = template or candidate_summary
                elif reference_summary is not None:
                    template = template or reference_summary
                if (
                    reference_summary is None
                    or candidate_summary is None
                    or reference_summary.value is None
                    or candidate_summary.value is None
                ):
                    differences.append(None)
                else:
                    differences.append(candidate_summary.value - reference_summary.value)
            if template is None:
                continue
            tape_checks = tapes_by_candidate[candidate.scenario_id]
            tapes_identical = (
                None
                if any(result is None for result in tape_checks)
                else all(result is True for result in tape_checks)
            )
            comparisons.append(
                PairedComparison(
                    reference_scenario_id=reference.scenario_id,
                    candidate_scenario_id=candidate.scenario_id,
                    metric_id=metric_id,
                    unit=template.unit,
                    population=template.population,
                    cohort=template.cohort,
                    replication_differences=tuple(differences),
                    estimate=mean_confidence_interval(
                        differences,
                        n_requested=n_requested,
                        confidence_level=confidence_level,
                    ),
                    demand_matched=(
                        not generation_differs[candidate.scenario_id]
                        and tapes_identical is True
                    ),
                    demand_tapes_identical=tapes_identical,
                    generation_assumptions_differ=generation_differs[candidate.scenario_id],
                )
            )
    return tuple(comparisons)


def _generation_assumptions(scenario: Scenario | ScenarioV2) -> tuple[object, ...]:
    return (
        scenario.engine_config.horizon_s,
        scenario.interarrival.model_dump(mode="json"),
        tuple(group.model_dump(mode="json") for group in scenario.group_sizes),
        scenario.payment_active.model_dump(mode="json"),
        scenario.preparation.model_dump(mode="json"),
        scenario.transfer_probability,
        scenario.transfer_confirmation.model_dump(mode="json"),
        scenario.patience.model_dump(mode="json") if scenario.patience is not None else None,
    )


def _records_for_scenario(
    records: Sequence[ReplicationResult | ReplicationResultV2],
    scenario_id: str,
) -> tuple[ReplicationResult | ReplicationResultV2, ...]:
    return tuple(record for record in records if record.scenario_id == scenario_id)


def _summary_for(
    metrics: RunMetrics | RunMetricsV2 | None,
    metric_id: str,
) -> MetricSummary | None:
    if metrics is None:
        return None
    return next(
        (summary for summary in metrics.metric_summaries if summary.metric_id == metric_id),
        None,
    )


def _physical_bounds(metric_id: str) -> tuple[float | None, float | None] | None:
    if metric_id.startswith("resource."):
        return 0.0, 1.0
    if metric_id.startswith(("count.", "duration.", "queue.", "throughput.", "drain.")):
        return 0.0, None
    return None


def _make_issue(scenario_id: str, replication_index: int, error: Exception) -> ExperimentIssue:
    issues = getattr(error, "issues", ())
    codes = [getattr(issue, "code", None) for issue in issues]
    code = getattr(error, "code", None) or next((value for value in codes if value), None)
    if code is None:
        code = type(error).__name__.lower()
    return ExperimentIssue(
        scenario_id=scenario_id,
        replication_index=replication_index,
        code=str(code),
        message=str(error),
    )


def _require_nonnegative_integer(value: int, name: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a nonnegative integer.")


