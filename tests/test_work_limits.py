import json
from pathlib import Path
from typing import NoReturn

import pytest

from boquitas.demand import WorkloadLimitExceeded, generate_demand
from boquitas.engine import simulate
from boquitas.experiments import run_experiment
from boquitas.models import EngineConfig, InputValidationError, OrderInput
from boquitas.scenarios import (
    ConstantTime,
    GroupWeight,
    Scenario,
    ScenarioV2,
    demo_scenario,
)
from boquitas.work_limits import (
    MAX_GROUP_SIZE,
    MAX_INITIAL_ORDERS,
    MAX_PEOPLE_PER_RUN,
    MAX_WORKERS_PER_POOL,
    ExperimentWorkloadLimitExceeded,
    public_limits,
)


def scenario_with(**changes: object) -> Scenario:
    values = demo_scenario().model_dump()
    values.update(changes)
    return Scenario(**values)


def test_simulate_rejects_a_copied_configuration_with_too_many_workers() -> None:
    config = EngineConfig(mode="regular").model_copy(update={"integrated_workers": 33})

    with pytest.raises(InputValidationError):
        simulate(config, demand=(), initial_state=())


def test_public_models_enforce_worker_and_group_maxima() -> None:
    with pytest.raises(InputValidationError):
        EngineConfig(mode="regular", integrated_workers=MAX_WORKERS_PER_POOL + 1)
    with pytest.raises(InputValidationError):
        GroupWeight(size=MAX_GROUP_SIZE + 1, probability=1)
    with pytest.raises(InputValidationError):
        OrderInput(
            order_id="large-group",
            person_ids=tuple(f"P-{index}" for index in range(MAX_GROUP_SIZE + 1)),
            arrival_s=0,
            payment_active_s=0,
            transfer_wait_s=0,
            preparation_s=0,
        )


def test_scenario_rechecks_group_size_after_model_copy_bypasses_validation() -> None:
    oversized_group = GroupWeight(size=1, probability=1).model_copy(update={"size": 51})
    scenario = scenario_with(
        engine_config=EngineConfig(horizon_s=2),
        interarrival=ConstantTime(value_s=1),
        group_sizes=(oversized_group,),
    )

    with pytest.raises(InputValidationError):
        generate_demand(scenario, root_seed=4, replication_index=0)


def test_scenario_rechecks_all_copied_v2_configuration_fields() -> None:
    fixture = (
        Path(__file__).parents[1]
        / "openspec"
        / "changes"
        / "boquitas-07-preparation-interruptions"
        / "review"
        / "scripted-demo-input.json"
    )
    scenario = ScenarioV2(**json.loads(fixture.read_text(encoding="utf-8")))
    invalid_config = scenario.engine_config.model_copy(update={"integrated_workers": 2})
    copied_scenario = scenario.model_copy(update={"engine_config": invalid_config})

    with pytest.raises(InputValidationError):
        generate_demand(copied_scenario, root_seed=4, replication_index=0)


def test_public_limits_publish_the_agreed_computational_guards() -> None:
    assert public_limits() == {
        "max_workers_per_pool": 32,
        "max_group_size": 50,
        "max_people_per_run": 10_000,
        "max_initial_orders": 1_000,
        "max_new_orders": 10_000,
        "max_experiment_orders": 30_000,
        "max_experiment_people": 50_000,
        "max_experiment_work_units": 10_000_000,
    }


def test_explicit_input_rechecks_a_copied_order_group_size_before_simulation() -> None:
    order = OrderInput(
        order_id="large-group",
        person_ids=("P-1",),
        arrival_s=0,
        payment_active_s=0,
        transfer_wait_s=0,
        preparation_s=0,
    ).model_copy(update={"person_ids": tuple(f"P-{i}" for i in range(1, 52))})

    with pytest.raises(InputValidationError) as captured:
        simulate(EngineConfig(horizon_s=1), demand=(order,), initial_state=())

    assert captured.value.issues[0].code == "group_size_limit_exceeded"


def test_explicit_input_rejects_a_combined_people_total_over_the_run_limit() -> None:
    demand = tuple(
        OrderInput(
            order_id=f"O-{order_index}",
            person_ids=tuple(
                f"O-{order_index}-P-{person_index}"
                for person_index in range(MAX_GROUP_SIZE)
            ),
            arrival_s=2,
            payment_active_s=0,
            transfer_wait_s=0,
            preparation_s=0,
        )
        for order_index in range((MAX_PEOPLE_PER_RUN // MAX_GROUP_SIZE) + 1)
    )

    with pytest.raises(InputValidationError) as captured:
        simulate(EngineConfig(horizon_s=1), demand=demand, initial_state=())

    assert captured.value.issues[0].code == "people_limit_exceeded"


def test_oversized_initial_iterable_is_rejected_before_iteration() -> None:
    class OversizedInitialOrders:
        def __len__(self) -> int:
            return MAX_INITIAL_ORDERS + 1

        def __iter__(self) -> NoReturn:
            raise AssertionError("Oversized input was iterated before its size check.")

    with pytest.raises(InputValidationError) as captured:
        simulate(EngineConfig(), demand=(), initial_state=OversizedInitialOrders())  # type: ignore[arg-type]

    assert captured.value.issues[0].path == "initial_state"


def test_generated_demand_stops_before_creating_people_over_the_run_limit() -> None:
    scenario = scenario_with(
        engine_config=EngineConfig(horizon_s=202),
        interarrival=ConstantTime(value_s=1),
        group_sizes=(GroupWeight(size=MAX_GROUP_SIZE, probability=1),),
    )

    with pytest.raises(WorkloadLimitExceeded) as captured:
        generate_demand(scenario, root_seed=4, replication_index=0)

    assert "person run limit" in str(captured.value)


def test_experiment_rejects_aggregate_order_budget_including_initial_orders() -> None:
    initial_state = tuple(
        {
            "order_id": f"I-{index}",
            "person_ids": (f"P-{index}",),
            "stage": "waiting_payment",
            "queue_rank": index,
            "payment_active_s": 0,
            "transfer_wait_s": 0,
            "preparation_s": 0,
        }
        for index in range(38)
    )
    scenarios = [
        scenario_with(
            scenario_id=f"scenario-{index}",
            display_name=f"Scenario {index}",
            engine_config=EngineConfig(horizon_s=0.5),
            initial_state=initial_state,
            interarrival=ConstantTime(value_s=1),
        )
        for index in range(4)
    ]

    with pytest.raises(ExperimentWorkloadLimitExceeded) as captured:
        run_experiment(scenarios, root_seed=3, replications=200)

    assert "orders (" in str(captured.value)


def test_experiment_rejects_aggregate_people_budget_including_initial_orders() -> None:
    initial_order = {
        "order_id": "I-1",
        "person_ids": tuple(f"P-{index}" for index in range(MAX_GROUP_SIZE)),
        "stage": "waiting_payment",
        "queue_rank": 0,
        "payment_active_s": 0,
        "transfer_wait_s": 0,
        "preparation_s": 0,
    }
    scenarios = [
        scenario_with(
            scenario_id=f"scenario-{index}",
            display_name=f"Scenario {index}",
            engine_config=EngineConfig(horizon_s=0.5),
            initial_state=(initial_order,),
            interarrival=ConstantTime(value_s=1),
        )
        for index in range(6)
    ]

    with pytest.raises(ExperimentWorkloadLimitExceeded) as captured:
        run_experiment(scenarios, root_seed=3, replications=200)

    assert "people (" in str(captured.value)


def test_experiment_raises_before_running_beyond_aggregate_work_budget() -> None:
    scenario = scenario_with(
        engine_config=EngineConfig(horizon_s=3_164),
        interarrival=ConstantTime(value_s=1),
    )

    with pytest.raises(ExperimentWorkloadLimitExceeded) as captured:
        run_experiment([scenario], root_seed=3, replications=1)

    assert captured.value.code == "experiment_workload_limit_exceeded"
