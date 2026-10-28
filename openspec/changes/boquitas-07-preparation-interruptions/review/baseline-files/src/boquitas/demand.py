"""Deterministic, indexed random generation of complete order tapes."""

from __future__ import annotations

import math

import numpy as np
from numpy.random import Generator, SeedSequence

from .engine import simulate
from .models import OrderInput
from .scenarios import ConstantTime, ExponentialTime, Scenario, TimeDistribution, TriangularTime

MAX_NEW_ORDERS = 10_000

_ARRIVALS = 0
_GROUP_SIZES = 1
_PAYMENT_ACTIVE = 2
_TRANSFER_SELECTION = 3
_TRANSFER_CONFIRMATION = 4
_PREPARATION = 5
_PATIENCE = 6


class WorkloadLimitExceeded(ValueError):
    """A generated replication would exceed the application order limit."""

    code = "workload_limit_exceeded"


def generate_demand(
    scenario: Scenario,
    *,
    root_seed: int,
    replication_index: int,
) -> list[OrderInput]:
    """Generate a complete tape before dispatch, using stable indexed streams."""

    _require_nonnegative_integer(root_seed, "root_seed")
    _require_nonnegative_integer(replication_index, "replication_index")
    # Recheck through the public engine boundary in case a caller supplied a
    # model_copy(update=...) value that skipped Pydantic validation.
    simulate(scenario.engine_config, demand=(), initial_state=scenario.initial_state)

    orders: list[OrderInput] = []
    arrival_s = 0.0
    order_index = 0
    while True:
        arrival_rng = _category_rng(root_seed, replication_index, order_index, _ARRIVALS)
        interarrival_s = _sample(scenario.interarrival, arrival_rng)
        if interarrival_s == 0 and isinstance(scenario.interarrival, ExponentialTime):
            interarrival_s = math.nextafter(0.0, math.inf)
        if not math.isfinite(interarrival_s) or interarrival_s <= 0:
            raise ValueError("Generated interarrival time must be finite and strictly positive.")
        arrival_s += interarrival_s
        if arrival_s >= scenario.engine_config.horizon_s:
            break
        if order_index >= MAX_NEW_ORDERS:
            raise WorkloadLimitExceeded(
                f"Replication {replication_index} exceeds the "
                f"{MAX_NEW_ORDERS}-order workload limit."
            )

        group_rng = _category_rng(root_seed, replication_index, order_index, _GROUP_SIZES)
        group_size = int(
            group_rng.choice(
                [group.size for group in scenario.group_sizes],
                p=[group.probability for group in scenario.group_sizes],
            )
        )
        payment_s = _sample(
            scenario.payment_active,
            _category_rng(root_seed, replication_index, order_index, _PAYMENT_ACTIVE),
        )
        transfer_rng = _category_rng(root_seed, replication_index, order_index, _TRANSFER_SELECTION)
        transfer_wait_s = 0.0
        if transfer_rng.random() < scenario.transfer_probability:
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
            )
        )
        order_index += 1
    return orders


def _category_rng(
    root_seed: int,
    replication_index: int,
    order_index: int,
    category_id: int,
) -> Generator:
    """Construct a stream from fixed-position, stable integer seed material."""

    seed_sequence = SeedSequence([order_index, category_id, replication_index, root_seed])
    return np.random.default_rng(seed_sequence)


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
