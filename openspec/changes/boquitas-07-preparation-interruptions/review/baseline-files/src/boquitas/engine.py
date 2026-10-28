"""Public simulation entry point and coordinated SimPy event loop."""

from __future__ import annotations

import math
import re
from collections.abc import Generator, Sequence
from dataclasses import dataclass

import simpy

from .models import (
    EngineConfig,
    EventData,
    FinalOrderState,
    FinalPersonState,
    InitialOrder,
    InputValidationError,
    InputValidationIssue,
    OrderInput,
    SimulationEvent,
    SimulationTrace,
    WorkerState,
)

_TIME_EPSILON = 1e-9


@dataclass(slots=True)
class _Order:
    order_id: str
    person_ids: tuple[str, ...]
    source_sequence: int
    source_kind: str
    arrival_s: float | None
    payment_active_s: float
    transfer_wait_s: float
    preparation_s: float
    patience_s: float | None
    queue_rank: int | None = None
    patience_deadline_s: float | None = None
    status: str = "waiting_payment"
    worker_id: str | None = None
    stage_due_s: float | None = None
    stage_start_seq: int = -1
    payment_completed_s: float | None = None
    payment_completion_seq: int | None = None
    terminal_s: float | None = None


@dataclass(slots=True)
class _Worker:
    worker_id: str
    pool: str
    assigned_order_id: str | None = None
    reserved: bool = False
    active: bool = False
    stage: str | None = None

    def public_state(self) -> WorkerState:
        return WorkerState(
            worker_id=self.worker_id,
            pool=self.pool,  # type: ignore[arg-type]
            assigned_order_id=self.assigned_order_id,
            reserved=self.reserved,
            active=self.active,
            stage=self.stage,
        )


def simulate(
    config: EngineConfig,
    demand: Sequence[OrderInput],
    initial_state: Sequence[InitialOrder],
) -> SimulationTrace:
    """Run an explicit deterministic workload in virtual simulation time."""

    _validate_config(config)
    _validate_input_identities(demand, initial_state)
    _validate_initial_state(config, initial_state)
    return _Coordinator(config, demand, initial_state).run()


class _Coordinator:
    """One SimPy process owns dispatch and batches effects at each timestamp."""

    def __init__(
        self,
        config: EngineConfig,
        demand: Sequence[OrderInput],
        initial_state: Sequence[InitialOrder],
    ) -> None:
        self.config = config
        self.env = simpy.Environment()
        self.current_time_s = 0.0
        self.events: list[SimulationEvent] = []
        self.workers = _make_workers(config)
        self.orders: dict[str, _Order] = {}
        self._all_initial_order_ids = tuple(order.order_id for order in initial_state)
        for source_sequence, initial in enumerate(initial_state):
            if initial.stage == "payment_active":
                payment_active_s = initial.remaining_s or 0.0
            else:
                payment_active_s = initial.payment_active_s or 0.0
            if initial.stage == "payment_pending":
                transfer_wait_s = 0.0
            else:
                transfer_wait_s = initial.transfer_wait_s or 0.0
            if initial.stage == "preparing":
                preparation_s = initial.remaining_s or 0.0
            else:
                preparation_s = initial.preparation_s or 0.0
            stage_due_s = (
                initial.remaining_s
                if initial.stage in {"payment_active", "payment_pending", "preparing"}
                else None
            )
            order = _Order(
                order_id=initial.order_id,
                person_ids=initial.person_ids,
                source_sequence=source_sequence,
                source_kind="initial",
                arrival_s=initial.arrival_s,
                payment_active_s=payment_active_s,
                transfer_wait_s=transfer_wait_s,
                preparation_s=preparation_s,
                patience_s=(
                    initial.patience_remaining_s
                    if initial.stage == "waiting_payment"
                    else None
                ),
                queue_rank=initial.queue_rank,
                patience_deadline_s=(
                    initial.patience_remaining_s
                    if initial.stage == "waiting_payment"
                    else None
                ),
                status=initial.stage,
                worker_id=initial.worker_id,
                stage_due_s=stage_due_s,
            )
            self.orders[order.order_id] = order
            worker_active = initial.stage in {"payment_active", "preparing"}
            if initial.worker_id is not None:
                worker = self.workers[initial.worker_id]
                worker.assigned_order_id = order.order_id
                worker.reserved = True
                worker.active = worker_active
                worker.stage = {
                    "payment_active": "payment_active",
                    "payment_pending": "external_confirmation",
                    "preparing": "preparation",
                }[initial.stage]
            self._emit(
                "order_initialized",
                order=order,
                worker_id=initial.worker_id,
                data=EventData(
                    stage=initial.stage,
                    queue=(
                        "payment"
                        if initial.stage == "waiting_payment"
                        else "preparation"
                        if initial.stage == "waiting_preparation"
                        else None
                    ),
                    initial_stage=initial.stage,
                    queue_rank=initial.queue_rank,
                    worker_reserved=initial.worker_id is not None,
                    worker_active=worker_active,
                    remaining_s=initial.remaining_s,
                    arrival_s=initial.arrival_s,
                ),
            )
            order.stage_start_seq = len(self.events) - 1
        self._arrival_index = 0
        self._arrivals = sorted(
            (
                (order.arrival_s, index, order)
                for index, order in enumerate(demand)
                if order.arrival_s < config.horizon_s
            ),
            key=lambda item: (item[0], item[1]),
        )
        self._all_new_order_ids = tuple(
            order.order_id for order in demand if order.arrival_s < config.horizon_s
        )
        self.admissions_closed = False
        self.last_terminal_s = config.horizon_s

    def run(self) -> SimulationTrace:
        run_process = self.env.process(self._run())
        self.env.run(until=run_process)
        self._emit("run_finished", time_s=self.last_terminal_s)
        ordered_orders = sorted(
            self.orders.values(),
            key=lambda order: (0 if order.source_kind == "initial" else 1, order.source_sequence),
        )
        return SimulationTrace(
            config=self.config,
            declared_resource_ids=tuple(self.workers),
            initialized_order_ids=self._all_initial_order_ids,
            new_order_ids=self._all_new_order_ids,
            events=tuple(self.events),
            window_end_s=self.config.horizon_s,
            drain_end_s=self.last_terminal_s,
            final_orders=tuple(self._final_order(order) for order in ordered_orders),
            final_people=tuple(
                FinalPersonState(
                    person_id=person_id,
                    order_id=order.order_id,
                    state=_person_state(order.status),
                )
                for order in ordered_orders
                for person_id in order.person_ids
            ),
            final_workers=tuple(worker.public_state() for worker in self.workers.values()),
        )

    def _run(self) -> Generator[simpy.events.Event, object]:
        while True:
            self._settle_current_time()
            if (
                self.admissions_closed
                and self.current_time_s >= self.config.horizon_s
                and self._all_orders_terminal()
            ):
                break

            next_time = self._next_event_time()
            delta = next_time - self.current_time_s
            if delta < -_TIME_EPSILON:
                raise RuntimeError("The simulation event calendar moved backwards.")
            yield self.env.timeout(max(0.0, delta))
            self.current_time_s = next_time

    def _settle_current_time(self) -> None:
        self._finish_due_stages()
        self._admit_due_orders()
        if not self.admissions_closed and self.current_time_s >= self.config.horizon_s:
            self.admissions_closed = True
            self._emit("admissions_closed", time_s=self.config.horizon_s)

        while True:
            started = self._dispatch()
            finished = self._finish_due_stages()
            if not started and not finished:
                break
        self._expire_waiting_orders()

    def _finish_due_stages(self) -> bool:
        now = self.current_time_s
        due_orders = sorted(
            (
                order
                for order in self.orders.values()
                if order.status in {"payment_active", "payment_pending", "preparing"}
                and order.stage_due_s is not None
                and order.stage_due_s <= now
            ),
            key=lambda order: (order.stage_due_s or 0.0, order.stage_start_seq),
        )
        for order in due_orders:
            if order.status == "payment_active":
                self._finish_payment(order)
            elif order.status == "payment_pending":
                self._complete_payment(order)
            elif order.status == "preparing":
                self._finish_preparation(order)
        return bool(due_orders)

    def _admit_due_orders(self) -> None:
        now = self.current_time_s
        while self._arrival_index < len(self._arrivals):
            arrival_s, source_sequence, order_input = self._arrivals[self._arrival_index]
            if arrival_s > now:
                break
            self._arrival_index += 1
            order = _Order(
                order_id=order_input.order_id,
                person_ids=order_input.person_ids,
                source_sequence=source_sequence,
                source_kind="new",
                arrival_s=order_input.arrival_s,
                payment_active_s=order_input.payment_active_s,
                transfer_wait_s=order_input.transfer_wait_s,
                preparation_s=order_input.preparation_s,
                patience_s=order_input.patience_s,
                patience_deadline_s=(
                    order_input.arrival_s + order_input.patience_s
                    if order_input.patience_s is not None
                    else None
                ),
            )
            self.orders[order.order_id] = order
            self._emit(
                "order_arrived",
                order=order,
                data=EventData(
                    stage="waiting_payment",
                    queue="payment",
                    worker_reserved=False,
                    worker_active=False,
                ),
            )

    def _dispatch(self) -> bool:
        started = False
        if self.config.mode == "regular":
            integrated_workers = [
                worker for worker in self.workers.values() if worker.pool == "integrated"
            ]
            for worker in integrated_workers:
                if worker.reserved:
                    continue
                order = self._oldest_waiting_payment()
                if order is None:
                    break
                self._start_payment(order, worker)
                started = True
            return started

        cashiers = [worker for worker in self.workers.values() if worker.pool == "cashier"]
        for worker in cashiers:
            if worker.reserved:
                continue
            order = self._oldest_waiting_payment()
            if order is None:
                break
            self._start_payment(order, worker)
            started = True

        preparers = [worker for worker in self.workers.values() if worker.pool == "preparer"]
        for worker in preparers:
            if worker.reserved:
                continue
            order = self._oldest_paid_order()
            if order is None:
                break
            self._start_preparation(order, worker)
            started = True
        return started

    def _oldest_waiting_payment(self) -> _Order | None:
        candidates = [order for order in self.orders.values() if order.status == "waiting_payment"]
        if not candidates:
            return None
        return min(
            candidates,
            key=lambda order: (
                0 if order.source_kind == "initial" else 1,
                float(order.queue_rank or 0)
                if order.source_kind == "initial"
                else float(order.arrival_s or 0.0),
                order.source_sequence,
            ),
        )

    def _oldest_paid_order(self) -> _Order | None:
        candidates = [
            order for order in self.orders.values() if order.status == "waiting_preparation"
        ]
        if not candidates:
            return None
        return min(
            candidates,
            key=lambda order: (
                0 if order.source_kind == "initial" and order.queue_rank is not None else 1,
                float(order.queue_rank or 0)
                if order.source_kind == "initial" and order.queue_rank is not None
                else order.payment_completed_s
                if order.payment_completed_s is not None
                else math.inf,
                order.payment_completion_seq
                if order.payment_completion_seq is not None
                else math.inf,
                order.source_sequence,
            ),
        )

    def _start_payment(self, order: _Order, worker: _Worker) -> None:
        order.status = "payment_active"
        order.queue_rank = None
        order.worker_id = worker.worker_id
        order.stage_due_s = self.current_time_s + order.payment_active_s
        worker.assigned_order_id = order.order_id
        worker.reserved = True
        worker.active = True
        worker.stage = "payment_active"
        event = self._emit(
            "payment_started",
            order=order,
            worker_id=worker.worker_id,
            data=EventData(
                stage="payment_active",
                worker_reserved=True,
                worker_active=True,
            ),
        )
        order.stage_start_seq = event.seq

    def _finish_payment(self, order: _Order) -> None:
        worker = self.workers[order.worker_id or ""]
        worker_id = worker.worker_id
        worker.active = False
        if self.config.mode == "tuesday":
            worker.assigned_order_id = None
            worker.reserved = False
            worker.stage = None
            order.worker_id = None
        else:
            worker.reserved = True
            worker.stage = None
        order.stage_due_s = None
        active_end = self._emit(
            "payment_active_ended",
            order=order,
            worker_id=worker_id,
            data=EventData(
                stage="payment_pending" if order.transfer_wait_s > 0 else "waiting_preparation",
                worker_reserved=self.config.mode == "regular",
                worker_active=False,
            ),
        )
        if order.transfer_wait_s > 0:
            order.status = "payment_pending"
            order.stage_due_s = self.current_time_s + order.transfer_wait_s
            order.stage_start_seq = active_end.seq
            if self.config.mode == "regular":
                worker.stage = "external_confirmation"
            return

        self._complete_payment(order, worker_id=worker_id)

    def _complete_payment(self, order: _Order, *, worker_id: str | None = None) -> None:
        order.status = "waiting_preparation"
        order.payment_completed_s = self.current_time_s
        order.stage_due_s = None
        if self.config.mode == "regular":
            worker_id = order.worker_id
        completed = self._emit(
            "payment_completed",
            order=order,
            worker_id=worker_id if self.config.mode == "regular" else None,
            data=EventData(
                stage="waiting_preparation",
                queue="preparation" if self.config.mode == "tuesday" else None,
                worker_reserved=self.config.mode == "regular",
                worker_active=False,
            ),
        )
        order.payment_completion_seq = completed.seq
        if self.config.mode == "regular":
            worker = self.workers[order.worker_id or ""]
            self._start_preparation(order, worker)

    def _start_preparation(self, order: _Order, worker: _Worker) -> None:
        order.status = "preparing"
        order.worker_id = worker.worker_id
        order.stage_due_s = self.current_time_s + order.preparation_s
        worker.assigned_order_id = order.order_id
        worker.reserved = True
        worker.active = True
        worker.stage = "preparation"
        event = self._emit(
            "preparation_started",
            order=order,
            worker_id=worker.worker_id,
            data=EventData(
                stage="preparation",
                worker_reserved=True,
                worker_active=True,
            ),
        )
        order.stage_start_seq = event.seq

    def _finish_preparation(self, order: _Order) -> None:
        worker = self.workers[order.worker_id or ""]
        worker_id = worker.worker_id
        worker.assigned_order_id = None
        worker.reserved = False
        worker.active = False
        worker.stage = None
        order.worker_id = None
        order.stage_due_s = None
        order.status = "completed"
        order.terminal_s = self.current_time_s
        self.last_terminal_s = max(self.config.horizon_s, order.terminal_s)
        self._emit(
            "order_delivered",
            order=order,
            worker_id=worker_id,
            data=EventData(
                stage="completed",
                worker_reserved=False,
                worker_active=False,
            ),
        )

    def _next_event_time(self) -> float:
        candidates: list[float] = []
        if not self.admissions_closed:
            candidates.append(self.config.horizon_s)
        if self._arrival_index < len(self._arrivals):
            candidates.append(self._arrivals[self._arrival_index][0])
        candidates.extend(
            order.stage_due_s
            for order in self.orders.values()
            if order.stage_due_s is not None
        )
        candidates.extend(
            order.patience_deadline_s
            for order in self.orders.values()
            if order.status == "waiting_payment" and order.patience_deadline_s is not None
        )
        if not candidates:
            raise RuntimeError("No future event remains before the simulation has drained.")
        return min(candidates)

    def _expire_waiting_orders(self) -> None:
        expired = sorted(
            (
                order
                for order in self.orders.values()
                if order.status == "waiting_payment"
                and order.patience_deadline_s is not None
                and order.patience_deadline_s <= self.current_time_s
            ),
            key=lambda order: (
                order.patience_deadline_s or 0.0,
                order.arrival_s if order.arrival_s is not None else -math.inf,
                order.source_sequence,
            ),
        )
        for order in expired:
            order.status = "abandoned"
            order.terminal_s = self.current_time_s
            self.last_terminal_s = max(self.config.horizon_s, order.terminal_s)
            self._emit(
                "order_abandoned",
                order=order,
                data=EventData(
                    stage="abandoned",
                    queue="payment",
                    worker_reserved=False,
                    worker_active=False,
                ),
            )

    def _all_orders_terminal(self) -> bool:
        return all(order.status in {"completed", "abandoned"} for order in self.orders.values())

    def _final_order(self, order: _Order) -> FinalOrderState:
        return FinalOrderState(
            order_id=order.order_id,
            person_ids=order.person_ids,
            state=order.status,
            arrival_s=order.arrival_s,
            worker_id=order.worker_id,
        )

    def _emit(
        self,
        event_type: str,
        *,
        time_s: float | None = None,
        order: _Order | None = None,
        worker_id: str | None = None,
        data: EventData | None = None,
    ) -> SimulationEvent:
        event = SimulationEvent(
            seq=len(self.events),
            time_s=self.current_time_s if time_s is None else time_s,
            type=event_type,  # type: ignore[arg-type]
            order_id=None if order is None else order.order_id,
            person_ids=() if order is None else order.person_ids,
            worker_id=worker_id,
            data=data or EventData(),
        )
        self.events.append(event)
        return event


def _validate_config(config: EngineConfig) -> None:
    issues: list[InputValidationIssue] = []
    active_pools = (
        (("cashiers", config.cashiers), ("preparers", config.preparers))
        if config.mode == "tuesday"
        else (("integrated_workers", config.integrated_workers),)
    )
    inactive_pools = (
        (("integrated_workers", config.integrated_workers),)
        if config.mode == "tuesday"
        else (("cashiers", config.cashiers), ("preparers", config.preparers))
    )

    for pool, capacity in active_pools:
        if capacity is None or capacity < 1:
            issues.append(
                InputValidationIssue(
                    path=f"config.{pool}",
                    code="capacity_minimum",
                    message="An active worker pool must have capacity of at least 1.",
                )
            )
    for pool, capacity in inactive_pools:
        if capacity is not None and capacity != 0:
            issues.append(
                InputValidationIssue(
                    path=f"config.{pool}",
                    code="inactive_capacity",
                    message="A worker pool inactive in this mode must have capacity 0.",
                )
            )
    if not math.isfinite(config.horizon_s) or config.horizon_s <= 0:
        issues.append(
            InputValidationIssue(
                path="config.horizon_s",
                code="positive_finite",
                message="The simulation horizon must be finite and greater than 0.",
            )
        )
    if re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d", config.opening_time) is None:
        issues.append(
            InputValidationIssue(
                path="config.opening_time",
                code="time_format",
                message="Opening time must use a valid 24-hour HH:MM:SS value.",
            )
        )
    if issues:
        raise InputValidationError(tuple(issues))


def _validate_input_identities(
    demand: Sequence[OrderInput],
    initial_state: Sequence[InitialOrder],
) -> None:
    issues: list[InputValidationIssue] = []
    seen_order_ids: dict[str, str] = {}
    seen_person_ids: dict[str, str] = {}

    collections_to_check: tuple[
        tuple[str, Sequence[OrderInput | InitialOrder]], ...
    ] = (("initial_state", initial_state), ("demand", demand))
    for collection_name, orders in collections_to_check:
        for order_index, order in enumerate(orders):
            order_path = f"{collection_name}[{order_index}]"
            if not order.order_id.strip():
                issues.append(
                    InputValidationIssue(
                        path=f"{order_path}.order_id",
                        code="nonempty_id",
                        message="Order IDs must not be empty or whitespace.",
                    )
                )
            elif order.order_id in seen_order_ids:
                issues.append(
                    InputValidationIssue(
                        path=f"{order_path}.order_id",
                        code="duplicate_order_id",
                        message=f"Order ID duplicates {seen_order_ids[order.order_id]}.",
                    )
                )
            else:
                seen_order_ids[order.order_id] = f"{order_path}.order_id"

            for person_index, person_id in enumerate(order.person_ids):
                person_path = f"{order_path}.person_ids[{person_index}]"
                if not person_id.strip():
                    issues.append(
                        InputValidationIssue(
                            path=person_path,
                            code="nonempty_id",
                            message="Person IDs must not be empty or whitespace.",
                        )
                    )
                elif person_id in seen_person_ids:
                    issues.append(
                        InputValidationIssue(
                            path=person_path,
                            code="duplicate_person_id",
                            message=f"Person ID duplicates {seen_person_ids[person_id]}.",
                        )
                    )
                else:
                    seen_person_ids[person_id] = person_path

    if issues:
        raise InputValidationError(tuple(issues))


def _validate_initial_state(
    config: EngineConfig,
    initial_state: Sequence[InitialOrder],
) -> None:
    issues: list[InputValidationIssue] = []
    worker_pools = {worker_id: worker.pool for worker_id, worker in _make_workers(config).items()}
    assigned_workers: dict[str, str] = {}
    queue_ranks: dict[str, dict[int, str]] = {"waiting_payment": {}, "waiting_preparation": {}}
    required_fields = {
        "waiting_payment": ("payment_active_s", "transfer_wait_s", "preparation_s"),
        "payment_active": ("remaining_s", "transfer_wait_s", "preparation_s"),
        "payment_pending": ("remaining_s", "preparation_s"),
        "waiting_preparation": ("preparation_s",),
        "preparing": ("remaining_s",),
    }
    forbidden_fields = {
        "waiting_payment": ("remaining_s",),
        "payment_active": ("payment_active_s", "patience_remaining_s"),
        "payment_pending": ("payment_active_s", "transfer_wait_s", "patience_remaining_s"),
        "waiting_preparation": (
            "remaining_s",
            "payment_active_s",
            "transfer_wait_s",
            "patience_remaining_s",
        ),
        "preparing": (
            "payment_active_s",
            "transfer_wait_s",
            "preparation_s",
            "patience_remaining_s",
        ),
    }

    for index, initial in enumerate(initial_state):
        path = f"initial_state[{index}]"
        stage = initial.stage
        for field_name in required_fields[stage]:
            if getattr(initial, field_name) is None:
                issues.append(
                    InputValidationIssue(
                        path=f"{path}.{field_name}",
                        code="required_for_stage",
                        message=f"{field_name} is required for initial stage {stage}.",
                    )
                )
        for field_name in forbidden_fields[stage]:
            if getattr(initial, field_name) is not None:
                issues.append(
                    InputValidationIssue(
                        path=f"{path}.{field_name}",
                        code="incompatible_stage_field",
                        message=f"{field_name} is not valid for initial stage {stage}.",
                    )
                )

        queued = stage in {"waiting_payment", "waiting_preparation"}
        if queued and initial.queue_rank is None:
            issues.append(
                InputValidationIssue(
                    path=f"{path}.queue_rank",
                    code="queue_rank_required",
                    message="An initial queued order needs an explicit queue rank.",
                )
            )
        elif not queued and initial.queue_rank is not None:
            issues.append(
                InputValidationIssue(
                    path=f"{path}.queue_rank",
                    code="queue_rank_incompatible",
                    message="Only an initial queued order may specify a queue rank.",
                )
            )
        if queued and initial.queue_rank is not None:
            seen = queue_ranks[stage]
            if initial.queue_rank in seen:
                issues.append(
                    InputValidationIssue(
                        path=f"{path}.queue_rank",
                        code="duplicate_queue_rank",
                        message=f"Queue rank duplicates {seen[initial.queue_rank]}.",
                    )
                )
            else:
                seen[initial.queue_rank] = f"{path}.queue_rank"

        if stage == "waiting_preparation" and config.mode != "tuesday":
            issues.append(
                InputValidationIssue(
                    path=f"{path}.stage",
                    code="stage_incompatible_with_mode",
                    message="Regular mode does not have an independent preparation queue.",
                )
            )

        expected_pool: str | None = None
        if stage == "payment_active":
            expected_pool = "cashier" if config.mode == "tuesday" else "integrated"
        elif stage == "payment_pending" and config.mode == "regular":
            expected_pool = "integrated"
        elif stage == "preparing":
            expected_pool = "preparer" if config.mode == "tuesday" else "integrated"

        if expected_pool is None:
            if initial.worker_id is not None:
                issues.append(
                    InputValidationIssue(
                        path=f"{path}.worker_id",
                        code="worker_incompatible_with_stage",
                        message=f"Initial stage {stage} must not reserve a worker.",
                    )
                )
        elif initial.worker_id is None:
            issues.append(
                InputValidationIssue(
                    path=f"{path}.worker_id",
                    code="worker_required",
                    message=f"Initial stage {stage} requires a reserved {expected_pool} worker.",
                )
            )
        elif initial.worker_id not in worker_pools:
            issues.append(
                InputValidationIssue(
                    path=f"{path}.worker_id",
                    code="unknown_worker",
                    message="The assigned worker does not exist in the configured pool.",
                )
            )
        elif worker_pools[initial.worker_id] != expected_pool:
            issues.append(
                InputValidationIssue(
                    path=f"{path}.worker_id",
                    code="worker_pool_mismatch",
                    message=f"Initial stage {stage} requires a {expected_pool} worker.",
                )
            )
        elif initial.worker_id in assigned_workers:
            issues.append(
                InputValidationIssue(
                    path=f"{path}.worker_id",
                    code="worker_overassigned",
                    message=f"Worker is already assigned to {assigned_workers[initial.worker_id]}.",
                )
            )
        else:
            assigned_workers[initial.worker_id] = path

    if issues:
        raise InputValidationError(tuple(issues))


def _make_workers(config: EngineConfig) -> dict[str, _Worker]:
    pools: tuple[tuple[str, int | None], ...]
    if config.mode == "tuesday":
        pools = (("cashier", config.cashiers), ("preparer", config.preparers))
    else:
        pools = (("integrated", config.integrated_workers),)
    return {
        f"{pool}-{worker_number}": _Worker(
            worker_id=f"{pool}-{worker_number}",
            pool=pool,
        )
        for pool, capacity in pools
        for worker_number in range(1, (capacity or 0) + 1)
    }


def _person_state(order_state: str) -> str:
    if order_state == "completed":
        return "completed"
    if order_state == "abandoned":
        return "abandoned"
    return order_state
