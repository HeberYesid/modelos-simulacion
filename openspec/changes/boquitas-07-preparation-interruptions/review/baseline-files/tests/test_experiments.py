import pytest

from boquitas.engine import simulate
from boquitas.experiments import run_experiment, run_scenario
from boquitas.metrics import summarize
from boquitas.models import EngineConfig
from boquitas.scenarios import ConstantTime, GroupWeight, Scenario, demo_scenario


def deterministic_scenario(
    *,
    scenario_id: str = "reference",
    cashiers: int = 1,
) -> Scenario:
    base = demo_scenario().model_dump()
    base.update(
        {
            "scenario_id": scenario_id,
            "display_name": scenario_id,
            "engine_config": EngineConfig(
                mode="tuesday",
                horizon_s=12,
                cashiers=cashiers,
                preparers=1,
            ),
            "interarrival": ConstantTime(value_s=1),
            "group_sizes": (GroupWeight(size=1, probability=1),),
            "payment_active": ConstantTime(value_s=2),
            "preparation": ConstantTime(value_s=1),
            "transfer_probability": 0,
            "transfer_confirmation": ConstantTime(value_s=0),
            "default_root_seed": 123,
        }
    )
    return Scenario(**base)


def test_selected_replication_contains_complete_replayable_tape_and_trace() -> None:
    scenario = deterministic_scenario()

    run = run_scenario(scenario, replication_index=2)

    assert run.contract_version == 1
    assert run.root_seed == 123
    assert run.replication_index == 2
    assert run.demand_tape
    assert run.trace == simulate(scenario.engine_config, run.demand_tape, scenario.initial_state)
    assert run.metrics == summarize(run.trace)

    batch = run_experiment([scenario], root_seed=123, replications=3)
    selected = next(
        item
        for item in batch.replication_results
        if item.scenario_id == scenario.scenario_id and item.replication_index == 2
    )
    assert selected.metrics == run.metrics


def test_experiment_uses_identical_tapes_and_paired_candidate_minus_reference() -> None:
    reference = deterministic_scenario()
    candidate = deterministic_scenario(scenario_id="more-cashiers", cashiers=2)

    result = run_experiment([reference, candidate], root_seed=123, replications=3)

    assert result.status == "complete"
    assert result.n_requested == 3
    assert result.n_valid == 3
    assert len(result.replication_results) == 6
    comparison = next(
        item
        for item in result.comparisons
        if item.candidate_scenario_id == "more-cashiers"
        and item.metric_id == "queue.payment.mean.orders"
    )
    assert comparison.reference_scenario_id == "reference"
    assert comparison.demand_matched is True
    assert comparison.demand_tapes_identical is True
    assert comparison.generation_assumptions_differ is False
    assert comparison.estimate.n_requested == 3
    assert comparison.estimate.n_valid == 3
    assert comparison.estimate.mean is not None and comparison.estimate.mean < 0


def test_changed_generation_inputs_are_disclosed_even_if_finite_tapes_match() -> None:
    reference = deterministic_scenario()
    no_arrival_reference = reference.model_copy(
        update={"engine_config": EngineConfig(horizon_s=0.5, cashiers=1, preparers=1)}
    )
    changed_demand = Scenario(
        **{
            **reference.model_dump(),
            "scenario_id": "changed-arrivals",
            "engine_config": EngineConfig(horizon_s=0.5, cashiers=1, preparers=1),
            "interarrival": ConstantTime(value_s=2),
        }
    )

    result = run_experiment([no_arrival_reference, changed_demand], root_seed=123, replications=2)

    comparison = next(
        item for item in result.comparisons if item.candidate_scenario_id == "changed-arrivals"
    )
    assert comparison.demand_matched is False
    assert comparison.demand_tapes_identical is True
    assert comparison.generation_assumptions_differ is True


def test_horizon_change_is_a_demand_assumption_and_breaks_tape_matching() -> None:
    reference = deterministic_scenario()
    shorter = Scenario(
        **{
            **reference.model_dump(),
            "scenario_id": "shorter-window",
            "engine_config": EngineConfig(horizon_s=5, cashiers=1, preparers=1),
        }
    )

    result = run_experiment([reference, shorter], root_seed=123, replications=2)

    comparison = next(
        item for item in result.comparisons if item.candidate_scenario_id == "shorter-window"
    )
    assert comparison.demand_tapes_identical is False
    assert comparison.generation_assumptions_differ is True
    assert comparison.demand_matched is False


def test_failed_workload_replication_is_retained_and_fails_the_experiment() -> None:
    base = demo_scenario().model_dump()
    base.update(
        {
            "scenario_id": "over-limit",
            "display_name": "over-limit",
            "engine_config": EngineConfig(horizon_s=101),
            "interarrival": ConstantTime(value_s=0.01),
            "group_sizes": (GroupWeight(size=1, probability=1),),
            "payment_active": ConstantTime(value_s=1),
            "preparation": ConstantTime(value_s=1),
            "transfer_probability": 0,
        }
    )
    scenario = Scenario(**base)

    result = run_experiment([scenario], root_seed=8, replications=1)

    assert result.status == "failed"
    assert result.n_valid == 0
    assert result.replication_results[0].status == "failed"
    assert result.replication_results[0].issues[0].code == "workload_limit_exceeded"


@pytest.mark.parametrize("replications", [0, 201])
def test_experiment_replication_request_bounds_are_enforced(replications: int) -> None:
    with pytest.raises(ValueError):
        run_experiment([deterministic_scenario()], replications=replications)


@pytest.mark.parametrize("count", [0, 9])
def test_experiment_scenario_request_bounds_are_enforced(count: int) -> None:
    with pytest.raises(ValueError):
        run_experiment([deterministic_scenario() for _ in range(count)], replications=1)
