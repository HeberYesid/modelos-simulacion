from __future__ import annotations

import pytest

from boquitas.demand import generate_demand
from boquitas.experiments import run_experiment, run_scenario
from boquitas.models import (
    BasketItem,
    EngineConfig,
    EngineConfigV2,
    FinalOrderState,
    InitialOrder,
    InputValidationError,
    MenuConfig,
    MenuProduct,
    OrderBasket,
    OrderInput,
    OrderItem,
)
from boquitas.scenarios import (
    ArrivalPeriod,
    ConstantTime,
    ExponentialTime,
    GroupWeight,
    Scenario,
    ScenarioV2,
    demo_scenario,
)


def test_piecewise_arrivals_carry_hazard_across_zero_and_rate_boundaries() -> None:
    payload = demo_scenario().model_dump(mode="python")
    payload["engine_config"] = EngineConfig(horizon_s=10)
    payload["interarrival"] = ExponentialTime(mean_s=1)
    payload["arrival_schedule"] = (
        {"start_s": 0, "end_s": 1, "orders_per_hour": 0},
        {"start_s": 1, "end_s": 5, "orders_per_hour": 3600},
        {"start_s": 5, "end_s": 10, "orders_per_hour": 1800},
    )
    scenario = Scenario(**payload)

    demand = generate_demand(scenario, root_seed=17, replication_index=0)

    # With this indexed arrival stream the first hazards are 1.790652508,
    # 0.120033065, 4.399794273, and 0.329821129. The first is held through
    # the zero-rate second; the third crosses time 5 at the halved rate.
    assert [order.arrival_s for order in demand] == pytest.approx(
        [2.790652508, 2.910685573, 9.620959692], abs=1e-8
    )


def test_menu_quantity_sets_one_preparation_and_replay_keeps_product_metadata() -> None:
    menu = MenuConfig(
        products=(
            MenuProduct(
                product_id="fruit-salad",
                display_name="Ensalada de frutas",
                visual_kind="fruit_salad",
                preparation_s=180,
            ),
            MenuProduct(
                product_id="slush",
                display_name="Granizado",
                visual_kind="slush",
                preparation_s=60,
            ),
            MenuProduct(
                product_id="ice-cream",
                display_name="Helado",
                visual_kind="ice_cream",
                preparation_s=90,
            ),
        ),
        baskets=(
            OrderBasket(
                probability=1,
                items=(
                    BasketItem(product_id="fruit-salad", quantity=2),
                    BasketItem(product_id="slush", quantity=1),
                ),
            ),
        ),
    )
    payload = demo_scenario().model_dump(mode="python")
    payload.update(
        engine_config=EngineConfig(horizon_s=10),
        interarrival=ExponentialTime(mean_s=1),
        group_sizes=(GroupWeight(size=2, probability=1),),
        menu=menu,
    )
    scenario = Scenario(**payload)

    run = run_scenario(scenario, root_seed=17)

    expected_items = (
        {
            "product_id": "fruit-salad",
            "display_name": "Ensalada de frutas",
            "visual_kind": "fruit_salad",
            "quantity": 2,
        },
        {
            "product_id": "slush",
            "display_name": "Granizado",
            "visual_kind": "slush",
            "quantity": 1,
        },
    )
    assert run.demand_tape[0].preparation_s == 420
    assert len(run.demand_tape[0].person_ids) == 2
    assert [item.model_dump() for item in run.demand_tape[0].items] == list(expected_items)
    assert [item.model_dump() for item in run.trace.final_orders[0].items] == list(expected_items)


def test_menu_rejects_invalid_basket_references_and_duplicate_products() -> None:
    product = MenuProduct(
        product_id="fruit-salad",
        display_name="Ensalada de frutas",
        visual_kind="fruit_salad",
        preparation_s=180,
    )

    with pytest.raises(ValueError):
        MenuConfig(
            products=(product, product),
            baskets=(
                OrderBasket(
                    probability=1,
                    items=(BasketItem(product_id="fruit-salad", quantity=1),),
                ),
            ),
        )
    with pytest.raises(ValueError):
        MenuConfig(
            products=(product,),
            baskets=(
                OrderBasket(
                    probability=1,
                    items=(BasketItem(product_id="unknown", quantity=1),),
                ),
            ),
        )


def test_menu_rejects_boolean_preparation_and_overflowing_basket_quantity() -> None:
    with pytest.raises(ValueError):
        MenuProduct(
            product_id="fruit-salad",
            display_name="Ensalada de frutas",
            visual_kind="fruit_salad",
            preparation_s=True,
        )
    with pytest.raises(ValueError):
        OrderBasket(
            probability=1,
            items=(
                BasketItem(product_id="fruit-salad", quantity=26),
                BasketItem(product_id="slush", quantity=25),
            ),
        )


def test_new_empty_fields_are_omitted_from_legacy_json_shapes() -> None:
    scenario_data = demo_scenario().model_dump(mode="json")
    assert "arrival_schedule" not in scenario_data
    assert "menu" not in scenario_data

    order = OrderInput(
        order_id="O-1",
        person_ids=("P-1",),
        arrival_s=1,
        payment_active_s=2,
        transfer_wait_s=0,
        preparation_s=3,
    )
    initial = InitialOrder(order_id="I-1", person_ids=("P-2",), stage="waiting_payment")
    final = FinalOrderState(order_id="O-1", person_ids=("P-1",), state="completed")
    assert "items" not in order.model_dump(mode="json")
    assert "items" not in initial.model_dump(mode="json")
    assert "items" not in final.model_dump(mode="json")


def test_new_optional_collection_schemas_do_not_publish_empty_array_defaults() -> None:
    models_and_fields = (
        (Scenario, "arrival_schedule"),
        (ScenarioV2, "arrival_schedule"),
        (OrderInput, "items"),
        (InitialOrder, "items"),
        (FinalOrderState, "items"),
    )
    for model, field_name in models_and_fields:
        schema = model.model_json_schema()["properties"][field_name]
        assert "default" not in schema


def _fruit_menu(*, preparation_s: float = 180) -> MenuConfig:
    return MenuConfig(
        products=(
            MenuProduct(
                product_id="fruit-salad",
                display_name="Ensalada de frutas",
                visual_kind="fruit_salad",
                preparation_s=preparation_s,
            ),
        ),
        baskets=(
            OrderBasket(
                probability=1,
                items=(BasketItem(product_id="fruit-salad", quantity=2),),
            ),
        ),
    )


def _scenario_payload(*, horizon_s: float = 10) -> dict[str, object]:
    payload = demo_scenario().model_dump(mode="python")
    payload.update(
        engine_config=EngineConfig(horizon_s=horizon_s),
        interarrival=ExponentialTime(mean_s=1),
    )
    return payload


def test_arrival_schedule_rejects_invalid_bounds_coverage_rates_and_distribution() -> None:
    with pytest.raises(ValueError):
        ArrivalPeriod(start_s=2, end_s=2, orders_per_hour=1)
    with pytest.raises(ValueError):
        ArrivalPeriod(start_s=False, end_s=1, orders_per_hour=1)
    with pytest.raises(ValueError):
        ArrivalPeriod(start_s=0, end_s=1, orders_per_hour=True)

    base = _scenario_payload()
    valid = (
        {"start_s": 0, "end_s": 5, "orders_per_hour": 3600},
        {"start_s": 5, "end_s": 10, "orders_per_hour": 0},
    )
    invalid_schedules = (
        ({"start_s": 1, "end_s": 10, "orders_per_hour": 1},),
        (
            {"start_s": 0, "end_s": 4, "orders_per_hour": 1},
            {"start_s": 5, "end_s": 10, "orders_per_hour": 1},
        ),
        (
            {"start_s": 0, "end_s": 6, "orders_per_hour": 1},
            {"start_s": 5, "end_s": 10, "orders_per_hour": 1},
        ),
    )
    for schedule in invalid_schedules:
        with pytest.raises(InputValidationError):
            Scenario(**(base | {"arrival_schedule": schedule}))
    with pytest.raises(InputValidationError):
        Scenario(
            **(
                base
                | {
                    "interarrival": ConstantTime(value_s=1),
                    "arrival_schedule": valid,
                }
            )
        )

    too_many_periods = tuple(
        {"start_s": index, "end_s": index + 1, "orders_per_hour": 1}
        for index in range(49)
    )
    with pytest.raises(InputValidationError):
        Scenario(
            **(
                _scenario_payload(horizon_s=49)
                | {"arrival_schedule": too_many_periods}
            )
        )


def test_zero_rate_schedule_has_no_arrivals_and_workload_rechecks_bypassed_models() -> None:
    payload = _scenario_payload()
    payload["arrival_schedule"] = (
        {"start_s": 0, "end_s": 10, "orders_per_hour": 0},
    )
    scenario = Scenario(**payload)
    assert generate_demand(scenario, root_seed=17, replication_index=0) == []

    invalid_schedule = scenario.model_copy(
        update={"arrival_schedule": (ArrivalPeriod(start_s=1, end_s=10, orders_per_hour=1),)}
    )
    with pytest.raises(InputValidationError):
        generate_demand(invalid_schedule, root_seed=17, replication_index=0)

    invalid_menu = _fruit_menu().model_copy(
        update={"products": (_fruit_menu().products[0].model_copy(update={"preparation_s": True}),)}
    )
    scenario_with_invalid_menu = Scenario(**(_scenario_payload() | {"menu": invalid_menu}))
    with pytest.raises(InputValidationError):
        generate_demand(scenario_with_invalid_menu, root_seed=17, replication_index=0)


def test_initial_order_menu_metadata_and_remaining_preparation_are_preserved() -> None:
    item = OrderItem(
        product_id="fruit-salad",
        display_name="Ensalada de frutas",
        visual_kind="fruit_salad",
        quantity=1,
    )
    initial = InitialOrder(
        order_id="I-1",
        person_ids=("P-1",),
        stage="preparing",
        worker_id="preparer-1",
        remaining_s=7,
        items=(item,),
    )
    payload = _scenario_payload()
    payload.update(initial_state=(initial,), menu=_fruit_menu())

    run = run_scenario(Scenario(**payload), root_seed=17)

    initial_final = next(order for order in run.trace.final_orders if order.order_id == "I-1")
    initial_event = next(
        event for event in run.trace.events if event.type == "order_initialized"
    )
    assert initial_final.items == (item,)
    assert initial_event.data.remaining_s == 7


def test_menu_only_changes_preparation_and_items_and_rejects_overflow() -> None:
    base_scenario = Scenario(**_scenario_payload())
    menu_scenario = Scenario(**(_scenario_payload() | {"menu": _fruit_menu()}))
    base = generate_demand(base_scenario, root_seed=17, replication_index=0)
    with_menu = generate_demand(menu_scenario, root_seed=17, replication_index=0)

    def unaffected_attributes(order: OrderInput) -> tuple[object, ...]:
        return (
            order.order_id,
            order.person_ids,
            order.arrival_s,
            order.payment_active_s,
            order.transfer_wait_s,
            order.patience_s,
            order.payment_method,
        )

    assert [unaffected_attributes(order) for order in base] == [
        unaffected_attributes(order) for order in with_menu
    ]
    assert all(order.preparation_s == 360 for order in with_menu)

    overflow_payload = _scenario_payload()
    overflow_payload["menu"] = _fruit_menu(preparation_s=1e308)
    with pytest.raises(InputValidationError, match="nonfinite preparation"):
        generate_demand(Scenario(**overflow_payload), root_seed=17, replication_index=0)


def test_v2_run_and_experiment_comparisons_keep_schedule_and_menu_assumptions() -> None:
    v2_payload = _scenario_payload()
    v2_payload.update(
        contract_version=2,
        engine_config=EngineConfigV2(horizon_s=10),
        arrival_schedule=({"start_s": 0, "end_s": 10, "orders_per_hour": 3600},),
        menu=_fruit_menu(),
    )
    v2 = ScenarioV2(**v2_payload)
    run = run_scenario(v2, root_seed=17)
    assert isinstance(run.scenario, ScenarioV2)
    assert run.scenario.arrival_schedule == v2.arrival_schedule
    assert run.scenario.menu == v2.menu
    assert run.demand_tape[0].preparation_s == 360
    assert run.trace.final_orders[0].items == run.demand_tape[0].items
    restored = type(run).model_validate_json(run.model_dump_json())
    assert restored.trace.final_orders == run.trace.final_orders
    assert restored.demand_tape == run.demand_tape

    baseline_payload = _scenario_payload()
    baseline_payload.update(scenario_id="baseline")
    baseline = Scenario(**baseline_payload)
    scheduled = Scenario(
        **(
            baseline_payload
            | {
                "scenario_id": "scheduled",
                "arrival_schedule": (
                    {"start_s": 0, "end_s": 10, "orders_per_hour": 3600},
                ),
            }
        )
    )
    menu = Scenario(
        **(baseline_payload | {"scenario_id": "menu", "menu": _fruit_menu()})
    )
    for candidate in (scheduled, menu):
        experiment = run_experiment((baseline, candidate), root_seed=17, replications=1)
        assert experiment.status == "complete"
        assert experiment.comparisons
        assert all(
            comparison.generation_assumptions_differ
            for comparison in experiment.comparisons
        )
        assert all(not comparison.demand_matched for comparison in experiment.comparisons)
