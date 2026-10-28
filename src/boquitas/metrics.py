"""Public metrics derived from immutable simulation traces."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping
from typing import Protocol, overload

from .metrics_models import (
    MetricCohort,
    MetricSummary,
    OrderCohort,
    OrderMetric,
    OrderMetricV2,
    PersonMetric,
    PersonMetricV2,
    QueueInterval,
    ResourceUsage,
    RunMetrics,
    RunMetricsV2,
    UnavailableField,
)
from .models import SimulationEvent, SimulationEventV2, SimulationTrace, SimulationTraceV2


class _MetricRecord(Protocol):
    cohort: OrderCohort
    state: str
    payment_started_s: float | None
    payment_completed_s: float | None
    preparation_started_s: float | None
    delivery_s: float | None
    unavailable_fields: tuple[UnavailableField, ...]


@overload
def summarize(trace: SimulationTrace) -> RunMetrics: ...


@overload
def summarize(trace: SimulationTraceV2) -> RunMetricsV2: ...


def summarize(trace: SimulationTrace | SimulationTraceV2) -> RunMetrics | RunMetricsV2:
    """Summarize either supported public trace version without mutating it."""

    if isinstance(trace, SimulationTraceV2):
        return _summarize_v2(trace)
    return _summarize_v1(trace)


def _summarize_v1(trace: SimulationTrace) -> RunMetrics:
    """Summarize one public trace without mutating it or consulting engine state."""

    lifecycle: dict[str, dict[str, float | str | None]] = defaultdict(dict)
    initial_stages: dict[str, str] = {}
    for event in trace.events:
        if event.order_id is None:
            continue
        data = lifecycle[event.order_id]
        if event.type == "order_initialized":
            initial_stages[event.order_id] = event.data.initial_stage or "unknown"
        elif event.type == "payment_started":
            data["payment_started_s"] = event.time_s
        elif event.type == "payment_active_ended":
            data["payment_active_ended_s"] = event.time_s
        elif event.type == "payment_completed":
            data["payment_completed_s"] = event.time_s
        elif event.type == "preparation_started":
            data["preparation_started_s"] = event.time_s
        elif event.type == "order_delivered":
            data["delivery_s"] = event.time_s
        elif event.type == "order_abandoned":
            data["abandonment_s"] = event.time_s

    order_metrics = tuple(
        _make_order_metric(
            order.order_id,
            order.person_ids,
            "initialized" if order.order_id in trace.initialized_order_ids else "new",
            order.state,
            order.arrival_s,
            lifecycle[order.order_id],
            initial_stages.get(order.order_id),
            trace.config.mode,
        )
        for order in trace.final_orders
    )
    person_metrics = tuple(
        _as_person_metric(order_metric, person_id)
        for order_metric in order_metrics
        for person_id in order_metric.person_ids
    )
    queue_series = _queue_intervals(trace)
    resource_usage = _resource_usage(trace)

    summaries = _count_summaries(order_metrics, person_metrics)
    summaries.extend(_payment_wait_summaries(order_metrics, person_metrics))
    summaries.extend(_elapsed_summaries(order_metrics, person_metrics, trace.config.mode))
    summaries.extend(_queue_summaries(trace, order_metrics, person_metrics, queue_series))
    summaries.extend(_resource_summaries(resource_usage))
    summaries.extend(_throughput_summaries(trace, order_metrics, person_metrics))
    summaries.extend(_drain_summaries(trace))
    return RunMetrics(
        horizon_s=trace.window_end_s,
        drain_end_s=trace.drain_end_s,
        overtime_s=max(0.0, trace.drain_end_s - trace.window_end_s),
        metric_summaries=tuple(summaries),
        orders=order_metrics,
        people=person_metrics,
        queue_series=queue_series,
        resource_usage=resource_usage,
    )


def _summarize_v2(trace: SimulationTraceV2) -> RunMetricsV2:
    lifecycle: dict[str, dict[str, float | str | None]] = defaultdict(dict)
    initial_stages: dict[str, str] = {}
    paused_seconds: dict[str, float] = defaultdict(float)
    pause_started: dict[str, float] = {}
    pause_counts: dict[str, int] = defaultdict(int)
    for event in trace.events:
        if event.order_id is None:
            continue
        data = lifecycle[event.order_id]
        if event.type == "order_initialized":
            initial_stages[event.order_id] = event.data.initial_stage or "unknown"
        elif event.type == "payment_started":
            data["payment_started_s"] = event.time_s
        elif event.type == "payment_active_ended":
            data["payment_active_ended_s"] = event.time_s
        elif event.type == "payment_completed":
            data["payment_completed_s"] = event.time_s
        elif event.type == "preparation_started":
            data["preparation_started_s"] = event.time_s
        elif event.type == "preparation_paused":
            pause_started[event.order_id] = event.time_s
            pause_counts[event.order_id] += 1
        elif event.type == "preparation_resumed":
            start_s = pause_started.pop(event.order_id, None)
            if start_s is not None:
                paused_seconds[event.order_id] += event.time_s - start_s
        elif event.type == "order_delivered":
            data["delivery_s"] = event.time_s
        elif event.type == "order_abandoned":
            data["abandonment_s"] = event.time_s

    order_metrics: list[OrderMetricV2] = []
    for order in trace.final_orders:
        initial_stage = initial_stages.get(order.order_id)
        base = _make_order_metric(
            order.order_id,
            order.person_ids,
            "initialized" if order.order_id in trace.initialized_order_ids else "new",
            order.state,
            order.arrival_s,
            lifecycle[order.order_id],
            initial_stage,
            trace.config.mode,
            version2=True,
        )
        start_s = base.preparation_started_s
        delivery_s = base.delivery_s
        history_known = (
            initial_stage != "preparing"
            and start_s is not None
            and delivery_s is not None
            and order.state == "completed"
        )
        active_s: float | None = None
        paused_s: float | None = None
        pause_count: int | None = None
        extra_unavailable: list[UnavailableField] = []
        if history_known and start_s is not None and delivery_s is not None:
            elapsed_s = delivery_s - start_s
            paused_s = paused_seconds[order.order_id]
            if paused_s > elapsed_s:
                raise ValueError(f"Paused preparation exceeds elapsed time for {order.order_id!r}.")
            active_s = elapsed_s - paused_s
            pause_count = pause_counts[order.order_id]
        else:
            reason = (
                "preparation_start_predates_trace"
                if initial_stage == "preparing"
                else "preparation_not_completed"
                if order.state != "completed" or delivery_s is None
                else "preparation_start_unknown"
            )
            extra_unavailable.extend(
                UnavailableField(field=field, reason=reason)
                for field in (
                    "preparation_active_s",
                    "preparation_paused_s",
                    "preparation_pause_count",
                )
            )
        order_metrics.append(
            OrderMetricV2(
                **base.model_dump(exclude={"unavailable_fields"}),
                preparation_active_s=active_s,
                preparation_paused_s=paused_s,
                preparation_pause_count=pause_count,
                unavailable_fields=base.unavailable_fields + tuple(extra_unavailable),
            )
        )

    typed_orders = tuple(order_metrics)
    person_metrics = tuple(
        _as_person_metric_v2(order_metric, person_id)
        for order_metric in typed_orders
        for person_id in order_metric.person_ids
    )
    queue_series = _queue_intervals(trace)
    resource_usage = _resource_usage(trace)

    summaries = _count_summaries(typed_orders, person_metrics)
    summaries.extend(_payment_wait_summaries(typed_orders, person_metrics))
    summaries.extend(
        _elapsed_summaries(typed_orders, person_metrics, trace.config.mode, version2=True)
    )
    summaries.extend(_preparation_detail_summaries(typed_orders, person_metrics))
    summaries.extend(_queue_summaries(trace, typed_orders, person_metrics, queue_series))
    summaries.extend(_resource_summaries(resource_usage))
    summaries.extend(_throughput_summaries(trace, typed_orders, person_metrics))
    summaries.extend(_drain_summaries(trace))
    return RunMetricsV2(
        horizon_s=trace.window_end_s,
        drain_end_s=trace.drain_end_s,
        overtime_s=max(0.0, trace.drain_end_s - trace.window_end_s),
        metric_summaries=tuple(summaries),
        orders=typed_orders,
        people=person_metrics,
        queue_series=queue_series,
        resource_usage=resource_usage,
    )


def _make_order_metric(
    order_id: str,
    person_ids: tuple[str, ...],
    cohort: OrderCohort,
    state: str,
    arrival_s: float | None,
    timestamps: dict[str, float | str | None],
    initial_stage: str | None,
    mode: str,
    *,
    version2: bool = False,
) -> OrderMetric:
    payment_started_s = _time(timestamps, "payment_started_s")
    payment_active_ended_s = _time(timestamps, "payment_active_ended_s")
    payment_completed_s = _time(timestamps, "payment_completed_s")
    preparation_started_s = _time(timestamps, "preparation_started_s")
    delivery_s = _time(timestamps, "delivery_s")
    abandonment_s = _time(timestamps, "abandonment_s")
    payment_wait_s = _difference(payment_started_s, arrival_s)
    transaction_elapsed_s = _difference(payment_completed_s, payment_started_s)
    preparation_queue_wait_s = (
        _difference(preparation_started_s, payment_completed_s)
        if mode == "tuesday" or version2
        else None
    )
    preparation_elapsed_s = _difference(delivery_s, preparation_started_s)
    permanence_s = _difference(delivery_s, arrival_s)
    withdrawal_wait_s = _difference(abandonment_s, arrival_s)

    values: dict[str, float | None] = {
        "payment_wait_s": payment_wait_s,
        "transaction_elapsed_s": transaction_elapsed_s,
        "preparation_queue_wait_s": preparation_queue_wait_s,
        "preparation_elapsed_s": preparation_elapsed_s,
        "permanence_s": permanence_s,
        "withdrawal_wait_s": withdrawal_wait_s,
    }
    reasons = tuple(
        UnavailableField(field=field, reason=reason)
        for field, value in values.items()
        if value is None
        if (
            reason := _missing_reason(
                field,
                arrival_s,
                payment_started_s,
                payment_completed_s,
                preparation_started_s,
                delivery_s,
                abandonment_s,
                initial_stage,
                "tuesday" if version2 else mode,
            )
        )
    )
    return OrderMetric(
        order_id=order_id,
        person_ids=person_ids,
        cohort=cohort,
        state=state,
        arrival_s=arrival_s,
        payment_started_s=payment_started_s,
        payment_active_ended_s=payment_active_ended_s,
        payment_completed_s=payment_completed_s,
        preparation_started_s=preparation_started_s,
        delivery_s=delivery_s,
        abandonment_s=abandonment_s,
        payment_wait_s=payment_wait_s,
        transaction_elapsed_s=transaction_elapsed_s,
        preparation_queue_wait_s=preparation_queue_wait_s,
        preparation_elapsed_s=preparation_elapsed_s,
        permanence_s=permanence_s,
        withdrawal_wait_s=withdrawal_wait_s,
        unavailable_fields=reasons,
    )


def _missing_reason(
    field: str,
    arrival_s: float | None,
    payment_started_s: float | None,
    payment_completed_s: float | None,
    preparation_started_s: float | None,
    delivery_s: float | None,
    abandonment_s: float | None,
    initial_stage: str | None,
    mode: str,
) -> str:
    if field in {"payment_wait_s", "permanence_s", "withdrawal_wait_s"} and arrival_s is None:
        return "unknown_arrival_time"
    if field == "payment_wait_s":
        return "not_served" if abandonment_s is not None else "payment_not_started"
    if field == "transaction_elapsed_s":
        if initial_stage in {
            "payment_active",
            "payment_pending",
            "waiting_preparation",
            "preparing",
        }:
            return "payment_start_predates_trace"
        return "payment_not_completed"
    if field == "preparation_queue_wait_s":
        if mode != "tuesday":
            return "not_applicable_in_regular_mode"
        if initial_stage in {"waiting_preparation", "preparing"}:
            return "payment_completion_predates_trace"
        return "preparation_not_started"
    if field == "preparation_elapsed_s":
        if initial_stage == "preparing":
            return "preparation_start_predates_trace"
        return "preparation_not_completed" if delivery_s is None else "preparation_start_unknown"
    if field == "permanence_s":
        return "not_delivered"
    if field == "withdrawal_wait_s":
        return "not_withdrawn"
    if payment_started_s is None or payment_completed_s is None or preparation_started_s is None:
        return "incomplete_history"
    return "unavailable"


def _as_person_metric(order: OrderMetric, person_id: str) -> PersonMetric:
    values = order.model_dump(exclude={"order_id", "person_ids"})
    return PersonMetric(person_id=person_id, order_id=order.order_id, **values)


def _as_person_metric_v2(order: OrderMetricV2, person_id: str) -> PersonMetricV2:
    values = order.model_dump(exclude={"order_id", "person_ids"})
    return PersonMetricV2(person_id=person_id, order_id=order.order_id, **values)


def _count_summaries(
    orders: tuple[_MetricRecord, ...], people: tuple[_MetricRecord, ...]
) -> list[MetricSummary]:
    summaries: list[MetricSummary] = []
    for cohort in ("new", "initialized", "all"):
        selected_orders = _select_cohort(orders, cohort)
        selected_people = _select_cohort(people, cohort)
        if cohort == "new":
            summaries.append(
                _scalar_count(
                    "count.admitted.orders.new",
                    len(selected_orders),
                    len(selected_orders),
                    "orders",
                    "orders",
                    cohort,
                )
            )
            summaries.append(
                _scalar_count(
                    "count.admitted.people.new",
                    len(selected_people),
                    len(selected_people),
                    "people",
                    "people",
                    cohort,
                )
            )
        elif cohort == "initialized":
            summaries.append(
                _scalar_count(
                    "count.initialized.orders",
                    len(selected_orders),
                    len(selected_orders),
                    "orders",
                    "orders",
                    cohort,
                )
            )
            summaries.append(
                _scalar_count(
                    "count.initialized.people",
                    len(selected_people),
                    len(selected_people),
                    "people",
                    "people",
                    cohort,
                )
            )
        if cohort in {"new", "initialized"}:
            cohort_label = cohort
        else:
            cohort_label = "all"
        for state, verb in (("completed", "delivered"), ("abandoned", "withdrawn")):
            order_count = sum(order.state == state for order in selected_orders)
            person_count = sum(person.state == state for person in selected_people)
            summaries.append(
                _scalar_count(
                    f"count.{verb}.orders.{cohort_label}",
                    order_count,
                    len(selected_orders),
                    "orders",
                    "orders",
                    cohort,
                )
            )
            summaries.append(
                _scalar_count(
                    f"count.{verb}.people.{cohort_label}",
                    person_count,
                    len(selected_people),
                    "people",
                    "people",
                    cohort,
                )
            )
    return summaries


def _payment_wait_summaries(
    orders: tuple[_MetricRecord, ...], people: tuple[_MetricRecord, ...]
) -> list[MetricSummary]:
    summaries: list[MetricSummary] = []
    for outcome in ("served", "withdrawn"):
        selected_orders = tuple(
            order
            for order in orders
            if (
                order.payment_started_s is not None
                if outcome == "served"
                else order.state == "abandoned"
            )
        )
        selected_people = tuple(
            person
            for person in people
            if (
                person.payment_started_s is not None
                if outcome == "served"
                else person.state == "abandoned"
            )
        )
        for cohort in ("new", "initialized", "all"):
            cohort_orders = _select_cohort(selected_orders, cohort)
            cohort_people = _select_cohort(selected_people, cohort)
            wait_field = "payment_wait_s" if outcome == "served" else "withdrawal_wait_s"
            values_orders = [getattr(order, wait_field) for order in cohort_orders]
            values_people = [getattr(person, wait_field) for person in cohort_people]
            summaries.append(
                _duration_summary(
                    f"duration.payment_wait.{outcome}.order.{cohort}",
                    values_orders,
                    len(_select_cohort(orders, cohort)),
                    "s",
                    "orders",
                    cohort,
                )
            )
            summaries.append(
                _duration_summary(
                    f"duration.payment_wait.{outcome}.person.{cohort}",
                    values_people,
                    len(_select_cohort(people, cohort)),
                    "s",
                    "people",
                    cohort,
                )
            )
    return summaries


def _elapsed_summaries(
    orders: tuple[_MetricRecord, ...],
    people: tuple[_MetricRecord, ...],
    mode: str,
    *,
    version2: bool = False,
) -> list[MetricSummary]:
    definitions = (
        ("transaction_elapsed", "transaction_elapsed_s", "no_completed_transaction"),
        ("preparation_queue_wait", "preparation_queue_wait_s", "no_preparation_queue_wait"),
        ("preparation_elapsed", "preparation_elapsed_s", "no_completed_preparation"),
        ("permanence.completed", "permanence_s", "no_completed_orders"),
        ("withdrawal_wait", "withdrawal_wait_s", "no_withdrawals"),
    )
    summaries: list[MetricSummary] = []
    for metric_name, field, empty_reason in definitions:
        for cohort in ("new", "initialized", "all"):
            cohort_orders = _select_cohort(orders, cohort)
            cohort_people = _select_cohort(people, cohort)
            order_values = [getattr(order, field) for order in cohort_orders]
            person_values = [getattr(person, field) for person in cohort_people]
            reason = (
                "not_applicable_in_regular_mode"
                if field == "preparation_queue_wait_s" and mode == "regular" and not version2
                else _collection_empty_reason(
                    cohort_orders,
                    field,
                    _elapsed_sample_is_eligible(metric_name),
                    empty_reason,
                )
            )
            person_reason = (
                "not_applicable_in_regular_mode"
                if field == "preparation_queue_wait_s" and mode == "regular" and not version2
                else _collection_empty_reason(
                    cohort_people,
                    field,
                    _elapsed_sample_is_eligible(metric_name),
                    empty_reason,
                )
            )
            summaries.append(
                _duration_summary(
                    f"duration.{metric_name}.order.{cohort}",
                    order_values,
                    len(cohort_orders),
                    "s",
                    "orders",
                    cohort,
                    empty_reason=reason,
                )
            )
            summaries.append(
                _duration_summary(
                    f"duration.{metric_name}.person.{cohort}",
                    person_values,
                    len(cohort_people),
                    "s",
                    "people",
                    cohort,
                    empty_reason=person_reason,
                )
            )
    return summaries


def _preparation_detail_summaries(
    orders: tuple[OrderMetricV2, ...], people: tuple[PersonMetricV2, ...]
) -> list[MetricSummary]:
    summaries: list[MetricSummary] = []
    for metric_name, field, unit in (
        ("preparation_active", "preparation_active_s", "s"),
        ("preparation_paused", "preparation_paused_s", "s"),
        ("preparation_pause_count", "preparation_pause_count", "pauses"),
    ):
        for cohort in ("new", "initialized", "all"):
            for population, records in (("order", orders), ("person", people)):
                selected: tuple[_MetricRecord, ...] = tuple(
                    item for item in records if cohort == "all" or item.cohort == cohort
                )
                values = [
                    float(value) if value is not None else None
                    for value in (getattr(item, field) for item in selected)
                ]
                empty_reason = _collection_empty_reason(
                    selected,
                    field,
                    lambda item: item.state == "completed",
                    "no_completed_preparation",
                )
                summaries.append(
                    _duration_summary(
                        f"duration.{metric_name}.{population}.{cohort}",
                        values,
                        len(selected),
                        unit,
                        "orders" if population == "order" else "people",
                        cohort,
                        empty_reason=empty_reason,
                    )
                )
    return summaries


def _elapsed_sample_is_eligible(metric_name: str) -> Callable[[_MetricRecord], bool]:
    if metric_name in {"permanence.completed", "preparation_elapsed"}:
        return lambda item: item.state == "completed"
    if metric_name == "withdrawal_wait":
        return lambda item: item.state == "abandoned"
    if metric_name == "transaction_elapsed":
        return lambda item: (
            item.payment_completed_s is not None
            or any(
                missing.field == "transaction_elapsed_s"
                and missing.reason == "payment_start_predates_trace"
                for missing in item.unavailable_fields
            )
        )
    if metric_name == "preparation_queue_wait":
        return lambda item: (
            item.preparation_started_s is not None or item.payment_completed_s is not None
        )
    return lambda item: True


def _collection_empty_reason(
    items: tuple[_MetricRecord, ...],
    field: str,
    eligible: Callable[[_MetricRecord], bool],
    default_reason: str,
) -> str:
    selected = [item for item in items if eligible(item)]
    if not selected:
        return default_reason
    reasons = [
        next(
            (missing.reason for missing in item.unavailable_fields if missing.field == field),
            "incomplete_history",
        )
        for item in selected
    ]
    return (
        reasons[0]
        if all(reason == reasons[0] for reason in reasons)
        else "mixed_unavailable_reasons"
    )


def _scalar_count(
    metric_id: str,
    value: int,
    count: int,
    unit: str,
    population: str,
    cohort: MetricCohort,
) -> MetricSummary:
    return MetricSummary(
        metric_id=metric_id,
        value=float(value),
        unit=unit,
        population=population,
        cohort=cohort,
        count=count,
        n_valid=count,
    )


def _duration_summary(
    metric_id: str,
    values: Iterable[float | None],
    count: int,
    unit: str,
    population: str,
    cohort: MetricCohort,
    *,
    empty_reason: str = "no_eligible_samples",
) -> MetricSummary:
    valid = sorted(value for value in values if value is not None)
    n_valid = len(valid)
    if n_valid == 0:
        return MetricSummary(
            metric_id=metric_id,
            value=None,
            unit=unit,
            population=population,
            cohort=cohort,
            count=count,
            n_valid=0,
            unavailable_reason=empty_reason,
        )
    mean = sum(valid) / n_valid
    return MetricSummary(
        metric_id=metric_id,
        value=mean,
        unit=unit,
        population=population,
        cohort=cohort,
        count=count,
        n_valid=n_valid,
        mean=mean,
        median=_median(valid),
        p95=_percentile_linear(valid, 0.95),
        maximum=valid[-1],
    )


def _queue_intervals(trace: SimulationTrace | SimulationTraceV2) -> tuple[QueueInterval, ...]:
    horizon_s = trace.window_end_s
    boundaries = sorted(
        {0.0, horizon_s} | {event.time_s for event in trace.events if 0 <= event.time_s < horizon_s}
    )
    states: dict[str, tuple[str, int]] = {}
    event_index = 0
    per_queue: dict[str, list[QueueInterval]] = {"payment": [], "preparation": []}

    for start_s, end_s in zip(boundaries, boundaries[1:], strict=False):
        while event_index < len(trace.events) and trace.events[event_index].time_s <= start_s:
            _apply_queue_event(states, trace.events[event_index])
            event_index += 1
        counts = {
            "payment": (0, 0),
            "preparation": (0, 0),
        }
        for state, person_count in states.values():
            if state == "waiting_payment":
                orders, people = counts["payment"]
                counts["payment"] = (orders + 1, people + person_count)
            elif state == "waiting_preparation":
                orders, people = counts["preparation"]
                counts["preparation"] = (orders + 1, people + person_count)
        for queue, (order_count, person_count) in counts.items():
            points = per_queue[queue]
            if (
                points
                and points[-1].end_s == start_s
                and points[-1].order_count == order_count
                and points[-1].person_count == person_count
            ):
                previous = points[-1]
                points[-1] = previous.model_copy(update={"end_s": end_s})
            else:
                points.append(
                    QueueInterval(
                        queue=queue,  # type: ignore[arg-type]
                        start_s=start_s,
                        end_s=end_s,
                        order_count=order_count,
                        person_count=person_count,
                    )
                )

    combined = [interval for intervals in per_queue.values() for interval in intervals]
    return tuple(sorted(combined, key=lambda interval: (interval.start_s, interval.queue)))


def _apply_queue_event(
    states: dict[str, tuple[str, int]], event: SimulationEvent | SimulationEventV2
) -> None:
    order_id = event.order_id
    if order_id is None:
        return
    data = event.data
    people_count = len(event.person_ids)
    if event.type == "order_initialized":
        states[order_id] = (data.initial_stage or "unknown", people_count)
    elif event.type == "order_arrived":
        states[order_id] = ("waiting_payment", people_count)
    elif event.type == "payment_started":
        states[order_id] = ("payment_active", people_count)
    elif event.type == "payment_active_ended":
        states[order_id] = (data.stage or "payment_pending", people_count)
    elif event.type == "payment_completed":
        states[order_id] = ("waiting_preparation", people_count)
    elif event.type == "preparation_started":
        states[order_id] = ("preparing", people_count)
    elif event.type == "preparation_paused":
        states[order_id] = ("preparation_paused", people_count)
    elif event.type == "preparation_resumed":
        states[order_id] = ("preparing", people_count)
    elif event.type in {"order_delivered", "order_abandoned"}:
        states[order_id] = ("terminal", people_count)


def _queue_summaries(
    trace: SimulationTrace | SimulationTraceV2,
    orders: tuple[_MetricRecord, ...],
    people: tuple[_MetricRecord, ...],
    queue_series: tuple[QueueInterval, ...],
) -> list[MetricSummary]:
    summaries: list[MetricSummary] = []
    for queue in ("payment", "preparation"):
        intervals = tuple(point for point in queue_series if point.queue == queue)
        for unit_name, count_field, population, denominator_count in (
            ("orders", "order_count", "waiting_orders", len(orders)),
            ("people", "person_count", "waiting_people", len(people)),
        ):
            area = sum(
                (point.end_s - point.start_s) * getattr(point, count_field) for point in intervals
            )
            maximum = max((getattr(point, count_field) for point in intervals), default=0)
            summaries.extend(
                (
                    _window_summary(
                        f"queue.{queue}.mean.{unit_name}",
                        area / trace.window_end_s,
                        unit_name,
                        population,
                        denominator_count,
                        trace.window_end_s,
                    ),
                    _window_summary(
                        f"queue.{queue}.max.{unit_name}",
                        maximum,
                        unit_name,
                        population,
                        denominator_count,
                        None,
                    ),
                )
            )
    return summaries


def _window_summary(
    metric_id: str,
    value: float,
    unit: str,
    population: str,
    count: int,
    denominator: float | None,
) -> MetricSummary:
    return MetricSummary(
        metric_id=metric_id,
        value=value,
        unit=unit,
        population=population,
        cohort="all",
        count=count,
        n_valid=1,
        denominator=denominator,
    )


def _resource_usage(trace: SimulationTrace | SimulationTraceV2) -> tuple[ResourceUsage, ...]:
    horizon_s = trace.window_end_s
    workers = {worker.worker_id: worker.pool for worker in trace.final_workers}
    capacities = {
        pool: sum(worker.pool == pool for worker in trace.final_workers)
        for pool in ("cashier", "preparer", "integrated")
    }
    states: dict[str, tuple[bool, bool, str | None]] = {
        worker_id: (False, False, None) for worker_id in workers
    }
    component_active = {
        (pool, component): 0.0
        for pool in capacities
        for component in ("payment", "preparation", "external_confirmation")
    }
    component_reserved = dict(component_active)
    pool_active = {pool: 0.0 for pool in capacities}
    pool_reserved = {pool: 0.0 for pool in capacities}
    boundaries = sorted(
        {0.0, horizon_s} | {event.time_s for event in trace.events if 0 <= event.time_s < horizon_s}
    )
    event_index = 0

    for start_s, end_s in zip(boundaries, boundaries[1:], strict=False):
        while event_index < len(trace.events) and trace.events[event_index].time_s <= start_s:
            _apply_resource_event(states, workers, trace.events[event_index])
            event_index += 1
        elapsed_s = end_s - start_s
        if elapsed_s <= 0:
            continue
        for worker_id, (active, reserved, component) in states.items():
            pool = workers[worker_id]
            if active:
                pool_active[pool] += elapsed_s
                if component is not None:
                    component_active[(pool, component)] += elapsed_s
            if reserved:
                pool_reserved[pool] += elapsed_s
                if component is not None:
                    component_reserved[(pool, component)] += elapsed_s

    usage: list[ResourceUsage] = []
    for pool_name, capacity in capacities.items():
        for component in ("payment", "preparation", "external_confirmation"):
            active_s = component_active[(pool_name, component)]
            reserved_s = component_reserved[(pool_name, component)]
            usage.append(
                _resource_usage_record(
                    pool_name, component, capacity, horizon_s, active_s, reserved_s
                )
            )
        usage.append(
            _resource_usage_record(
                pool_name,
                "total",
                capacity,
                horizon_s,
                pool_active[pool],
                pool_reserved[pool],
            )
        )

    all_capacity = sum(capacities.values())
    usage.append(
        _resource_usage_record(
            "all",
            "total",
            all_capacity,
            horizon_s,
            sum(pool_active.values()),
            sum(pool_reserved.values()),
        )
    )
    return tuple(usage)


def _apply_resource_event(
    states: dict[str, tuple[bool, bool, str | None]],
    pools: Mapping[str, str],
    event: SimulationEvent | SimulationEventV2,
) -> None:
    worker_id = event.worker_id
    if worker_id is None or worker_id not in states:
        return
    data = event.data
    if event.type == "order_initialized":
        stage = data.initial_stage or data.stage
        component = {
            "payment_active": "payment",
            "payment_pending": "external_confirmation",
            "preparing": "preparation",
        }.get(stage or "")
        states[worker_id] = (data.worker_active is True, data.worker_reserved is True, component)
    elif event.type == "payment_started":
        states[worker_id] = (
            data.worker_active is not False,
            data.worker_reserved is not False,
            "payment",
        )
    elif event.type == "payment_active_ended":
        if data.worker_reserved is True:
            component = (
                "external_confirmation"
                if pools[worker_id] == "integrated" and data.stage == "payment_pending"
                else "payment"
            )
            states[worker_id] = (False, True, component)
        else:
            states[worker_id] = (False, False, None)
    elif event.type == "payment_completed":
        states[worker_id] = (False, data.worker_reserved is True, "payment")
    elif event.type == "preparation_started":
        states[worker_id] = (
            data.worker_active is not False,
            data.worker_reserved is not False,
            "preparation",
        )
    elif event.type == "preparation_paused":
        states[worker_id] = (False, False, None)
    elif event.type == "preparation_resumed":
        states[worker_id] = (True, True, "preparation")
    elif event.type == "order_delivered":
        states[worker_id] = (False, False, None)


def _resource_usage_record(
    pool: str,
    component: str,
    capacity: int,
    horizon_s: float,
    active_worker_s: float,
    reserved_worker_s: float,
) -> ResourceUsage:
    available_worker_s = capacity * horizon_s
    return ResourceUsage(
        pool=pool,  # type: ignore[arg-type]
        component=component,  # type: ignore[arg-type]
        capacity=capacity,
        active_worker_s=active_worker_s,
        reserved_worker_s=reserved_worker_s,
        available_worker_s=available_worker_s,
        active_fraction=active_worker_s / available_worker_s if available_worker_s else None,
        reserved_fraction=reserved_worker_s / available_worker_s if available_worker_s else None,
    )


def _resource_summaries(usage_records: tuple[ResourceUsage, ...]) -> list[MetricSummary]:
    summaries: list[MetricSummary] = []
    for usage in usage_records:
        for measure in ("active", "reserved"):
            value = getattr(usage, f"{measure}_fraction")
            summaries.append(
                MetricSummary(
                    metric_id=f"resource.{usage.pool}.{usage.component}.{measure}_fraction",
                    value=value,
                    unit="fraction",
                    population="workers",
                    cohort="all",
                    count=usage.capacity,
                    n_valid=usage.capacity if value is not None else 0,
                    denominator=usage.available_worker_s if value is not None else None,
                    unavailable_reason="pool_unavailable" if value is None else None,
                )
            )
    return summaries


def _throughput_summaries(
    trace: SimulationTrace | SimulationTraceV2,
    orders: tuple[_MetricRecord, ...],
    people: tuple[_MetricRecord, ...],
) -> list[MetricSummary]:
    delivered_orders = tuple(
        order
        for order in orders
        if order.delivery_s is not None and order.delivery_s < trace.window_end_s
    )
    delivered_people = tuple(
        person
        for person in people
        if person.delivery_s is not None and person.delivery_s < trace.window_end_s
    )
    return [
        MetricSummary(
            metric_id="throughput.window.delivery.orders_per_s",
            value=len(delivered_orders) / trace.window_end_s,
            unit="orders/s",
            population="delivered_orders",
            cohort="all",
            count=len(delivered_orders),
            n_valid=1,
            denominator=trace.window_end_s,
        ),
        MetricSummary(
            metric_id="throughput.window.delivery.people_per_s",
            value=len(delivered_people) / trace.window_end_s,
            unit="people/s",
            population="delivered_people",
            cohort="all",
            count=len(delivered_people),
            n_valid=1,
            denominator=trace.window_end_s,
        ),
    ]


def _drain_summaries(trace: SimulationTrace | SimulationTraceV2) -> list[MetricSummary]:
    return [
        MetricSummary(
            metric_id="drain.end_s",
            value=trace.drain_end_s,
            unit="s",
            population="run",
            cohort="all",
            count=1,
            n_valid=1,
        ),
        MetricSummary(
            metric_id="drain.overtime_s",
            value=max(0.0, trace.drain_end_s - trace.window_end_s),
            unit="s",
            population="run",
            cohort="all",
            count=1,
            n_valid=1,
        ),
    ]


def _percentile_linear(values: list[float], percentile: float) -> float:
    if len(values) == 1:
        return values[0]
    position = percentile * (len(values) - 1)
    lower = int(position)
    upper = min(lower + 1, len(values) - 1)
    fraction = position - lower
    return values[lower] + (values[upper] - values[lower]) * fraction


def _median(values: list[float]) -> float:
    middle = len(values) // 2
    if len(values) % 2:
        return values[middle]
    return (values[middle - 1] + values[middle]) / 2


def _select_cohort[T](items: tuple[T, ...], cohort: MetricCohort) -> tuple[T, ...]:
    if cohort == "all":
        return items
    return tuple(item for item in items if item.cohort == cohort)  # type: ignore[attr-defined]


def _time(timestamps: dict[str, float | str | None], key: str) -> float | None:
    value = timestamps.get(key)
    return value if isinstance(value, float) else None


def _difference(end: float | None, start: float | None) -> float | None:
    if end is None or start is None:
        return None
    return end - start
