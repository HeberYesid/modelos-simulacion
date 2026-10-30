"""Computational limits for public simulation and experiment inputs."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from itertools import islice

MAX_WORKERS_PER_POOL = 32
MAX_GROUP_SIZE = 50
MAX_PEOPLE_PER_RUN = 10_000
MAX_INITIAL_ORDERS = 1_000
MAX_NEW_ORDERS = 10_000
MAX_EXPERIMENT_ORDERS = 30_000
MAX_EXPERIMENT_PEOPLE = 50_000
MAX_EXPERIMENT_WORK_UNITS = 10_000_000


class ExperimentWorkloadLimitExceeded(ValueError):
    """An experiment's cumulative work would exceed a hard computational budget."""

    code = "experiment_workload_limit_exceeded"


def public_limits() -> dict[str, int]:
    """Return the stable, JSON-compatible computational limits for callers."""

    return {
        "max_workers_per_pool": MAX_WORKERS_PER_POOL,
        "max_group_size": MAX_GROUP_SIZE,
        "max_people_per_run": MAX_PEOPLE_PER_RUN,
        "max_initial_orders": MAX_INITIAL_ORDERS,
        "max_new_orders": MAX_NEW_ORDERS,
        "max_experiment_orders": MAX_EXPERIMENT_ORDERS,
        "max_experiment_people": MAX_EXPERIMENT_PEOPLE,
        "max_experiment_work_units": MAX_EXPERIMENT_WORK_UNITS,
    }


def bounded_tuple[T](values: Iterable[T], *, limit: int, name: str) -> tuple[T, ...]:
    """Copy at most ``limit`` items, rejecting oversized or unbounded iterables."""

    if isinstance(values, (str, bytes, bytearray)):
        raise ValueError(f"{name} must be an iterable of records, not text.")
    try:
        length = len(values)  # type: ignore[arg-type]
    except (OverflowError, TypeError):
        length = None
    if length is not None and length > limit:
        raise ValueError(f"{name} exceeds the {limit}-item limit.")

    items = tuple(islice(iter(values), limit + 1))
    if len(items) > limit:
        raise ValueError(f"{name} exceeds the {limit}-item limit.")
    return items


@dataclass(slots=True)
class ExperimentWorkBudget:
    """Track actual run sizes before each experiment simulation starts."""

    orders: int = 0
    people: int = 0
    work_units: int = 0

    def charge(self, *, order_count: int, person_count: int) -> None:
        work_units = order_count**2
        orders = self.orders + order_count
        people = self.people + person_count
        total_work_units = self.work_units + work_units
        exceeded = []
        if orders > MAX_EXPERIMENT_ORDERS:
            exceeded.append(f"orders ({orders} > {MAX_EXPERIMENT_ORDERS})")
        if people > MAX_EXPERIMENT_PEOPLE:
            exceeded.append(f"people ({people} > {MAX_EXPERIMENT_PEOPLE})")
        if total_work_units > MAX_EXPERIMENT_WORK_UNITS:
            exceeded.append(
                f"work units ({total_work_units} > {MAX_EXPERIMENT_WORK_UNITS})"
            )
        if exceeded:
            raise ExperimentWorkloadLimitExceeded(
                "Experiment workload limit exceeded: " + ", ".join(exceeded) + "."
            )
        self.orders = orders
        self.people = people
        self.work_units = total_work_units
