"""Deterministic, indexed random generation of complete order tapes."""

from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Literal, cast

import numpy as np
from numpy.random import Generator, SeedSequence

from .engine import simulate
from .execution import check_execution
from .models import (
    MAX_MENU_BASKETS,
    MAX_MENU_ITEMS,
    MAX_MENU_PRODUCTS,
    BasketItem,
    CashierInterruption,
    EngineConfigV2,
    InitialOrder,
    InputValidationError,
    InputValidationIssue,
    MenuConfig,
    MenuProduct,
    OrderBasket,
    OrderInput,
    OrderItem,
)
from .scenarios import (
    MAX_ARRIVAL_PERIODS,
    ArrivalPeriod,
    ConstantTime,
    ExponentialTime,
    GroupWeight,
    Scenario,
    ScenarioV2,
    TimeDistribution,
    TriangularTime,
    _validate_arrival_schedule,
)
from .work_limits import (
    MAX_GROUP_SIZE,
    MAX_INITIAL_ORDERS,
    MAX_NEW_ORDERS,
    MAX_PEOPLE_PER_RUN,
    bounded_tuple,
)

_ARRIVALS = 0
_GROUP_SIZES = 1
_PAYMENT_ACTIVE = 2
_TRANSFER_SELECTION = 3
_TRANSFER_CONFIRMATION = 4
_PREPARATION = 5
_PATIENCE = 6
_MENU_ITEMS = 7


class WorkloadLimitExceeded(ValueError):
    """A generated replication would exceed the application order limit."""

    code = "workload_limit_exceeded"


def generate_demand(
    scenario: Scenario | ScenarioV2,
    *,
    root_seed: int,
    replication_index: int,
) -> list[OrderInput]:
    """Generate a complete tape before dispatch, using stable indexed streams."""

    _require_nonnegative_integer(root_seed, "root_seed")
    _require_nonnegative_integer(replication_index, "replication_index")
    scenario = _prepare_scenario_workload(scenario)
    return _generate_prepared_demand(
        scenario,
        root_seed=root_seed,
        replication_index=replication_index,
    )


def _generate_prepared_demand(
    scenario: Scenario | ScenarioV2,
    *,
    root_seed: int,
    replication_index: int,
) -> list[OrderInput]:
    check_execution()
    groups = scenario.group_sizes
    initial_state = scenario.initial_state

    group_sizes = [group.size for group in groups]
    group_probabilities = [group.probability for group in groups]
    people_count = sum(len(order.person_ids) for order in initial_state)

    orders: list[OrderInput] = []
    arrival_s = 0.0
    order_index = 0
    while True:
        check_execution()
        arrival_rng = _category_rng(root_seed, replication_index, order_index, _ARRIVALS)
        if scenario.arrival_schedule:
            unit_hazard = float(arrival_rng.exponential(1.0))
            next_arrival_s = _arrival_for_hazard(
                arrival_s,
                unit_hazard,
                scenario.arrival_schedule,
            )
            if next_arrival_s is None:
                break
            arrival_s = next_arrival_s
        else:
            # Keep this legacy path byte-for-byte equivalent in its indexed draw
            # and accumulation order for scenarios without a schedule.
            interarrival_s = _sample(scenario.interarrival, arrival_rng)
            if interarrival_s == 0 and isinstance(scenario.interarrival, ExponentialTime):
                interarrival_s = math.nextafter(0.0, math.inf)
            if not math.isfinite(interarrival_s) or interarrival_s <= 0:
                raise ValueError(
                    "Generated interarrival time must be finite and strictly positive."
                )
            arrival_s += interarrival_s
        if arrival_s >= scenario.engine_config.horizon_s:
            break
        if order_index >= MAX_NEW_ORDERS:
            raise WorkloadLimitExceeded(
                f"Replication {replication_index} exceeds the "
                f"{MAX_NEW_ORDERS}-order workload limit."
            )

        group_rng = _category_rng(root_seed, replication_index, order_index, _GROUP_SIZES)
        group_size = int(group_rng.choice(group_sizes, p=group_probabilities))
        if people_count + group_size > MAX_PEOPLE_PER_RUN:
            raise WorkloadLimitExceeded(
                f"Replication {replication_index} exceeds the "
                f"{MAX_PEOPLE_PER_RUN}-person run limit."
            )
        payment_s = _sample(
            scenario.payment_active,
            _category_rng(root_seed, replication_index, order_index, _PAYMENT_ACTIVE),
        )
        transfer_rng = _category_rng(root_seed, replication_index, order_index, _TRANSFER_SELECTION)
        payment_method: Literal["cash", "transfer"] = (
            "transfer"
            if transfer_rng.random() < scenario.transfer_probability
            else "cash"
        )
        transfer_wait_s = 0.0
        if payment_method == "transfer":
            transfer_wait_s = _sample(
                scenario.transfer_confirmation,
                _category_rng(
                    root_seed,
                    replication_index,
                    order_index,
                    _TRANSFER_CONFIRMATION,
                ),
            )
        preparation_s = _sample(
            scenario.preparation,
            _category_rng(root_seed, replication_index, order_index, _PREPARATION),
        )
        items: tuple[OrderItem, ...] = ()
        if scenario.menu is not None:
            menu_rng = _category_rng(root_seed, replication_index, order_index, _MENU_ITEMS)
            basket_index = int(
                menu_rng.choice(
                    len(scenario.menu.baskets),
                    p=[basket.probability for basket in scenario.menu.baskets],
                )
            )
            basket = scenario.menu.baskets[basket_index]
            products_by_id = {product.product_id: product for product in scenario.menu.products}
            items = tuple(
                OrderItem(
                    product_id=item.product_id,
                    display_name=products_by_id[item.product_id].display_name,
                    visual_kind=products_by_id[item.product_id].visual_kind,
                    quantity=item.quantity,
                )
                for item in basket.items
            )
            try:
                preparation_s = sum(
                    products_by_id[item.product_id].preparation_s * item.quantity
                    for item in basket.items
                )
            except OverflowError as error:
                raise InputValidationError(
                    (
                        InputValidationIssue(
                            path=f"menu.baskets[{basket_index}]",
                            code="nonfinite_preparation",
                            message=(
                                "The selected product quantities produce a nonfinite "
                                "preparation time."
                            ),
                        ),
                    )
                ) from error
            if not math.isfinite(preparation_s):
                raise InputValidationError(
                    (
                        InputValidationIssue(
                            path=f"menu.baskets[{basket_index}]",
                            code="nonfinite_preparation",
                            message=(
                                "The selected product quantities produce a nonfinite "
                                "preparation time."
                            ),
                        ),
                    )
                )
        patience_s = (
            _sample(
                scenario.patience,
                _category_rng(root_seed, replication_index, order_index, _PATIENCE),
            )
            if scenario.patience is not None
            else None
        )

        order_id = f"r{replication_index:06d}-o{order_index:05d}"
        person_ids = tuple(
            f"{order_id}-p{member_index:02d}"
            for member_index in range(1, group_size + 1)
        )
        orders.append(
            OrderInput(
                order_id=order_id,
                person_ids=person_ids,
                arrival_s=arrival_s,
                payment_active_s=payment_s,
                transfer_wait_s=transfer_wait_s,
                preparation_s=preparation_s,
                patience_s=patience_s,
                payment_method=payment_method,
                items=items,
            )
        )
        people_count += group_size
        order_index += 1
    return orders


def _prepare_scenario_workload(scenario: Scenario | ScenarioV2) -> Scenario | ScenarioV2:
    groups = _validated_group_sizes(scenario)
    initial_state = _bounded_initial_state(scenario.initial_state)
    arrival_schedule = _validated_arrival_schedule(scenario)
    menu = _validated_menu(scenario.menu)
    if isinstance(scenario, ScenarioV2):
        try:
            interruptions = bounded_tuple(
                scenario.engine_config.cashier_interruptions,
                limit=MAX_INITIAL_ORDERS + MAX_NEW_ORDERS,
                name="cashier_interruptions",
            )
            interruption_data = tuple(
                {
                    field_name: getattr(interruption, field_name)
                    for field_name in CashierInterruption.model_fields
                }
                if isinstance(interruption, CashierInterruption)
                else interruption
                for interruption in interruptions
            )
            config = EngineConfigV2(
                contract_version=scenario.engine_config.contract_version,
                mode=scenario.engine_config.mode,
                opening_time=scenario.engine_config.opening_time,
                horizon_s=scenario.engine_config.horizon_s,
                cashiers=scenario.engine_config.cashiers,
                preparers=scenario.engine_config.preparers,
                integrated_workers=scenario.engine_config.integrated_workers,
                preparation_interruption_policy=(
                    scenario.engine_config.preparation_interruption_policy
                ),
                cashier_interruptions=cast(
                    tuple[CashierInterruption, ...],
                    interruption_data,
                ),
            )
        except InputValidationError:
            raise
        except (AttributeError, TypeError, ValueError) as error:
            raise InputValidationError(
                (
                    InputValidationIssue(
                        path="engine_config.cashier_interruptions",
                        code="input_limit_exceeded",
                        message=str(error),
                    ),
                )
            ) from error
        return ScenarioV2(
            scenario_id=scenario.scenario_id,
            display_name=scenario.display_name,
            engine_config=config,
            initial_state=initial_state,
            interarrival=scenario.interarrival,
            arrival_schedule=arrival_schedule,
            menu=menu,
            group_sizes=groups,
            payment_active=scenario.payment_active,
            preparation=scenario.preparation,
            transfer_probability=scenario.transfer_probability,
            transfer_confirmation=scenario.transfer_confirmation,
            patience=scenario.patience,
            provenance=scenario.provenance,
            assumptions=scenario.assumptions,
            default_root_seed=scenario.default_root_seed,
        )

    prepared = scenario.model_copy(
        update={
            "group_sizes": groups,
            "initial_state": initial_state,
            "arrival_schedule": arrival_schedule,
            "menu": menu,
        }
    )
    simulate(prepared.engine_config, demand=(), initial_state=initial_state)
    return prepared


def _validated_arrival_schedule(
    scenario: Scenario | ScenarioV2,
) -> tuple[ArrivalPeriod, ...]:
    try:
        raw_periods = bounded_tuple(
            scenario.arrival_schedule,
            limit=MAX_ARRIVAL_PERIODS,
            name="arrival_schedule",
        )
        periods: list[ArrivalPeriod] = []
        for period in raw_periods:
            check_execution()
            if isinstance(period, ArrivalPeriod):
                data: object = {
                    field_name: getattr(period, field_name)
                    for field_name in ArrivalPeriod.model_fields
                }
            else:
                data = period
            if not isinstance(data, dict):
                raise TypeError("Each arrival period must be an ArrivalPeriod input.")
            periods.append(ArrivalPeriod(**data))
        validated = tuple(periods)
        _validate_arrival_schedule(
            validated,
            scenario.interarrival,
            scenario.engine_config.horizon_s,
        )
        return validated
    except InputValidationError:
        raise
    except (AttributeError, TypeError, ValueError) as error:
        raise InputValidationError(
            (
                InputValidationIssue(
                    path="arrival_schedule",
                    code="invalid_arrival_schedule",
                    message=str(error),
                ),
            )
        ) from error


def _validated_menu(menu: MenuConfig | None) -> MenuConfig | None:
    if menu is None:
        return None
    try:
        if isinstance(menu, MenuConfig):
            products_source: Iterable[object] = menu.products
            baskets_source: Iterable[object] = menu.baskets
        elif isinstance(menu, dict):
            products_source = menu["products"]
            baskets_source = menu["baskets"]
        else:
            raise TypeError("Menu configuration must be a MenuConfig input.")
        raw_products = bounded_tuple(
            products_source,
            limit=MAX_MENU_PRODUCTS,
            name="menu.products",
        )
        raw_baskets = bounded_tuple(
            baskets_source,
            limit=MAX_MENU_BASKETS,
            name="menu.baskets",
        )
        products: list[MenuProduct] = []
        for product in raw_products:
            check_execution()
            data = (
                {
                    field_name: getattr(product, field_name)
                    for field_name in MenuProduct.model_fields
                }
                if isinstance(product, MenuProduct)
                else product
            )
            if not isinstance(data, dict):
                raise TypeError("Each product must be a MenuProduct input.")
            products.append(MenuProduct(**data))
        baskets: list[OrderBasket] = []
        for basket in raw_baskets:
            check_execution()
            if isinstance(basket, OrderBasket):
                probability = basket.probability
                items_source: Iterable[object] = basket.items
            elif isinstance(basket, dict):
                probability = basket["probability"]
                items_source = basket["items"]
            else:
                raise TypeError("Each basket must be an OrderBasket input.")
            raw_items = bounded_tuple(
                items_source,
                limit=MAX_MENU_ITEMS,
                name="menu.basket.items",
            )
            items: list[BasketItem] = []
            for item in raw_items:
                check_execution()
                item_data = (
                    {
                        field_name: getattr(item, field_name)
                        for field_name in BasketItem.model_fields
                    }
                    if isinstance(item, BasketItem)
                    else item
                )
                if not isinstance(item_data, dict):
                    raise TypeError("Each basket item must be a BasketItem input.")
                items.append(BasketItem(**item_data))
            baskets.append(OrderBasket(probability=probability, items=tuple(items)))
        return MenuConfig(products=tuple(products), baskets=tuple(baskets))
    except InputValidationError:
        raise
    except (AttributeError, KeyError, TypeError, ValueError) as error:
        raise InputValidationError(
            (
                InputValidationIssue(
                    path="menu",
                    code="invalid_menu",
                    message=str(error),
                ),
            )
        ) from error


def _validated_group_sizes(scenario: Scenario | ScenarioV2) -> tuple[GroupWeight, ...]:
    try:
        raw_groups = bounded_tuple(
            scenario.group_sizes,
            limit=MAX_GROUP_SIZE,
            name="group_sizes",
        )
        groups = tuple(
            GroupWeight(size=group.size, probability=group.probability)
            for group in raw_groups
        )
    except (AttributeError, TypeError, ValueError) as error:
        raise InputValidationError(
            (
                InputValidationIssue(
                    path="group_sizes",
                    code="group_size_limit_exceeded",
                    message=str(error),
                ),
            )
        ) from error
    sizes = [group.size for group in groups]
    total_weight = sum(group.probability for group in groups)
    if not groups or len(sizes) != len(set(sizes)) or total_weight <= 0:
        raise InputValidationError(
            (
                InputValidationIssue(
                    path="group_sizes",
                    code="invalid_group_sizes",
                    message="Group sizes must be nonempty, unique, and have positive weight.",
                ),
            )
        )
    if abs(total_weight - 1.0) > 1e-9:
        raise InputValidationError(
            (
                InputValidationIssue(
                    path="group_sizes",
                    code="invalid_group_weights",
                    message="Group probabilities must sum to 1 within 1e-9.",
                ),
            )
        )
    if total_weight != 1.0:
        groups = tuple(
            group.model_copy(update={"probability": group.probability / total_weight})
            for group in groups
        )
    return groups


def _bounded_initial_state(
    initial_state: Iterable[InitialOrder],
) -> tuple[InitialOrder, ...]:
    try:
        orders = bounded_tuple(
            initial_state,
            limit=MAX_INITIAL_ORDERS,
            name="initial_state",
        )
    except (TypeError, ValueError) as error:
        raise InputValidationError(
            (
                InputValidationIssue(
                    path="initial_state",
                    code="input_limit_exceeded",
                    message=str(error),
                ),
            )
        ) from error
    people_count = 0
    normalized_orders: list[InitialOrder] = []
    for index, order in enumerate(orders):
        check_execution()
        if not isinstance(order, InitialOrder):
            raise InputValidationError(
                (
                    InputValidationIssue(
                        path=f"initial_state[{index}]",
                        code="invalid_order",
                        message="Expected InitialOrder input.",
                    ),
                )
            )
        try:
            people = bounded_tuple(
                order.person_ids,
                limit=MAX_GROUP_SIZE,
                name=f"initial_state[{index}].person_ids",
            )
        except (AttributeError, TypeError, ValueError) as error:
            raise InputValidationError(
                (
                    InputValidationIssue(
                        path=f"initial_state[{index}].person_ids",
                        code="group_size_limit_exceeded",
                        message=str(error),
                    ),
                )
            ) from error
        people_count += len(people)
        if people_count > MAX_PEOPLE_PER_RUN:
            raise InputValidationError(
                (
                    InputValidationIssue(
                        path="initial_state",
                        code="people_limit_exceeded",
                        message=(
                            f"Initial orders exceed the {MAX_PEOPLE_PER_RUN}-person run limit."
                        ),
                    ),
                )
            )
        try:
            data = {
                field_name: getattr(order, field_name)
                for field_name in InitialOrder.model_fields
            }
            data["person_ids"] = people
            normalized_orders.append(InitialOrder(**data))
        except (TypeError, ValueError) as error:
            raise InputValidationError(
                (
                    InputValidationIssue(
                        path=f"initial_state[{index}]",
                        code="invalid_order",
                        message=str(error),
                    ),
                )
            ) from error
    return tuple(normalized_orders)


def _category_rng(
    root_seed: int,
    replication_index: int,
    order_index: int,
    category_id: int,
) -> Generator:
    """Construct a stream from fixed-position, stable integer seed material."""

    seed_sequence = SeedSequence([order_index, category_id, replication_index, root_seed])
    return np.random.default_rng(seed_sequence)


def _arrival_for_hazard(
    start_s: float,
    hazard: float,
    periods: tuple[ArrivalPeriod, ...],
) -> float | None:
    """Integrate one indexed unit-exponential draw over piecewise rates."""

    if hazard == 0:
        hazard = math.nextafter(0.0, math.inf)
    cursor_s = start_s
    for period in periods:
        check_execution()
        if cursor_s >= period.end_s:
            continue
        cursor_s = max(cursor_s, period.start_s)
        rate_per_s = period.orders_per_hour / 3600.0
        if rate_per_s == 0:
            cursor_s = period.end_s
            continue
        available_hazard = (period.end_s - cursor_s) * rate_per_s
        if hazard <= available_hazard:
            arrival_s = cursor_s + hazard / rate_per_s
            if arrival_s <= start_s:
                arrival_s = math.nextafter(start_s, math.inf)
            return arrival_s
        hazard -= available_hazard
        cursor_s = period.end_s
    return None


def _sample(distribution: TimeDistribution, rng: Generator) -> float:
    if isinstance(distribution, ConstantTime):
        return distribution.value_s
    if isinstance(distribution, TriangularTime):
        return float(rng.triangular(distribution.low_s, distribution.mode_s, distribution.high_s))
    if isinstance(distribution, ExponentialTime):
        return float(rng.exponential(distribution.mean_s))
    raise TypeError(f"Unsupported time distribution: {type(distribution).__name__}")


def _require_nonnegative_integer(value: int, name: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a nonnegative integer.")
