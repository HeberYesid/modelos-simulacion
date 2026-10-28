import pytest

from boquitas.demand import WorkloadLimitExceeded, generate_demand
from boquitas.models import EngineConfig
from boquitas.scenarios import ConstantTime, ExponentialTime, Scenario, demo_scenario


def scenario_with(**changes: object) -> Scenario:
    values = demo_scenario().model_dump()
    values.update(changes)
    return Scenario(**values)


def test_indexed_replication_tape_does_not_depend_on_call_order() -> None:
    scenario = demo_scenario()

    fifth_first = generate_demand(scenario, root_seed=71, replication_index=5)
    generate_demand(scenario, root_seed=71, replication_index=0)
    fifth_again = generate_demand(scenario, root_seed=71, replication_index=5)

    assert fifth_first == fifth_again


def test_staffing_and_mode_changes_preserve_the_complete_tape() -> None:
    scenario = demo_scenario()
    regular = scenario_with(engine_config=EngineConfig(mode="regular", integrated_workers=3))

    assert generate_demand(scenario, root_seed=71, replication_index=2) == generate_demand(
        regular, root_seed=71, replication_index=2
    )


def test_enabling_patience_does_not_shift_other_order_categories() -> None:
    without_patience = demo_scenario()
    with_patience = scenario_with(patience=ExponentialTime(mean_s=400))
    baseline = generate_demand(without_patience, root_seed=94, replication_index=3)
    patient = generate_demand(with_patience, root_seed=94, replication_index=3)

    assert len(baseline) == len(patient)
    assert [order.model_copy(update={"patience_s": None}) for order in patient] == baseline


def test_generated_arrivals_start_after_opening_and_stop_before_closing() -> None:
    demand = generate_demand(demo_scenario(), root_seed=3, replication_index=0)

    assert all(0 < order.arrival_s < 23_400 for order in demand)
    assert all(
        left.arrival_s < right.arrival_s
        for left, right in zip(demand, demand[1:], strict=False)
    )
    assert len({order.order_id for order in demand}) == len(demand)
    assert len({person_id for order in demand for person_id in order.person_ids}) == sum(
        len(order.person_ids) for order in demand
    )


def test_generation_raises_instead_of_truncating_above_ten_thousand_orders() -> None:
    scenario = scenario_with(
        engine_config=EngineConfig(horizon_s=101),
        interarrival=ConstantTime(value_s=0.01),
    )

    with pytest.raises(WorkloadLimitExceeded) as captured:
        generate_demand(scenario, root_seed=9, replication_index=0)

    assert captured.value.code == "workload_limit_exceeded"
