import pytest

from boquitas.models import EngineConfig, InitialOrder, InputValidationError
from boquitas.scenarios import (
    ConstantTime,
    GroupWeight,
    Scenario,
    demo_scenario,
)


def scenario_with(**changes: object) -> Scenario:
    values = demo_scenario().model_dump()
    values.update(changes)
    return Scenario(**values)


def test_demo_scenario_has_labeled_synthetic_defaults() -> None:
    scenario = demo_scenario()

    assert scenario.provenance == "synthetic_demo"
    assert scenario.default_root_seed == 20261020
    assert scenario.engine_config.mode == "tuesday"
    assert (scenario.engine_config.cashiers, scenario.engine_config.preparers) == (1, 4)
    assert scenario.engine_config.horizon_s == 23_400
    assert scenario.interarrival.model_dump() == {"kind": "exponential", "mean_s": 180}
    assert [(group.size, group.probability) for group in scenario.group_sizes] == [
        (1, 0.6),
        (2, 0.4),
    ]
    assert scenario.payment_active.model_dump() == {
        "kind": "triangular",
        "low_s": 15,
        "mode_s": 30,
        "high_s": 45,
    }
    assert scenario.preparation.model_dump() == {
        "kind": "triangular",
        "low_s": 60,
        "mode_s": 120,
        "high_s": 180,
    }
    assert scenario.transfer_probability == 0.25
    assert scenario.patience is None
    assert any("Synthetic teaching inputs" in item for item in scenario.assumptions)
    assert any("initial state is empty" in item for item in scenario.assumptions)
    assert any("No warm-up period" in item for item in scenario.assumptions)


def test_zero_constant_interarrival_is_rejected_before_generation() -> None:
    with pytest.raises(InputValidationError):
        scenario_with(interarrival=ConstantTime(value_s=0))


def test_group_size_rejects_boolean_as_an_integer() -> None:
    with pytest.raises(InputValidationError):
        GroupWeight(size=True, probability=1.0)


def test_root_seed_rejects_boolean_as_an_integer() -> None:
    with pytest.raises(InputValidationError):
        scenario_with(default_root_seed=True)


def test_boolean_group_probability_is_not_coerced_to_a_number() -> None:
    with pytest.raises(InputValidationError):
        GroupWeight(size=1, probability=True)


@pytest.mark.parametrize(
    "bounds",
    [(4, 2, 6), (2, 3, 2), (2, 2, 2)],
)
def test_triangular_distribution_rejects_invalid_or_zero_width_bounds(
    bounds: tuple[float, float, float],
) -> None:
    from boquitas.scenarios import TriangularTime

    with pytest.raises(InputValidationError):
        TriangularTime(low_s=bounds[0], mode_s=bounds[1], high_s=bounds[2])


def test_group_weights_close_to_one_are_normalized_deterministically() -> None:
    scenario = scenario_with(
        group_sizes=(
            {"size": 1, "probability": 0.6000000002},
            {"size": 2, "probability": 0.4000000002},
        )
    )

    assert sum(group.probability for group in scenario.group_sizes) == pytest.approx(1.0)
    assert tuple(group.probability for group in scenario.group_sizes) == pytest.approx(
        (0.6, 0.4)
    )


@pytest.mark.parametrize(
    "initial_state,config",
    [
        (
            (),
            EngineConfig(cashiers=0),
        ),
        (
            (
                InitialOrder(
                    order_id="I-1",
                    person_ids=("P-1",),
                    stage="payment_active",
                    worker_id="cashier-missing",
                    remaining_s=10,
                    transfer_wait_s=0,
                    preparation_s=20,
                ),
            ),
            EngineConfig(),
        ),
    ],
)
def test_unavailable_pool_or_invalid_initial_state_is_rejected_on_scenario_creation(
    initial_state: tuple[InitialOrder, ...],
    config: EngineConfig,
) -> None:
    with pytest.raises(InputValidationError):
        scenario_with(initial_state=initial_state, engine_config=config)
