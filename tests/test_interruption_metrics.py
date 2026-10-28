from __future__ import annotations

import pytest

from boquitas import simulate
from boquitas.metrics import summarize
from boquitas.models import (
    CashierInterruption,
    EngineConfigV2,
    EventDataV2,
    FinalOrderState,
    FinalPersonState,
    OrderInput,
    SimulationEventV2,
    SimulationTraceV2,
    WorkerState,
)


def _core_trace() -> SimulationTraceV2:
    worker = "integrated-1"
    events = (
        SimulationEventV2(seq=0, time_s=0, type="order_arrived", order_id="A", person_ids=("a",)),
        SimulationEventV2(
            seq=1,
            time_s=0,
            type="payment_started",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(stage="payment_active", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(
            seq=2,
            time_s=2,
            type="payment_completed",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(worker_reserved=True, worker_active=False),
        ),
        SimulationEventV2(
            seq=3,
            time_s=2,
            type="preparation_started",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(stage="preparing", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(seq=4, time_s=5, type="order_arrived", order_id="B", person_ids=("b",)),
        SimulationEventV2(
            seq=5,
            time_s=5,
            type="preparation_paused",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(
                stage="preparation_paused",
                worker_reserved=False,
                worker_active=False,
                remaining_s=7,
                related_cashier_order_id="B",
                assigned_order_id=None,
            ),
        ),
        SimulationEventV2(
            seq=6,
            time_s=5,
            type="payment_started",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
            data=EventDataV2(stage="payment_active", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(
            seq=7,
            time_s=7,
            type="payment_completed",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
            data=EventDataV2(
                stage="waiting_preparation",
                queue="preparation",
                worker_reserved=False,
                worker_active=False,
                assigned_order_id=None,
            ),
        ),
        SimulationEventV2(
            seq=8,
            time_s=7,
            type="preparation_resumed",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(
                stage="preparing",
                worker_reserved=True,
                worker_active=True,
                remaining_s=7,
                related_cashier_order_id="B",
                assigned_order_id="A",
            ),
        ),
        SimulationEventV2(
            seq=9,
            time_s=14,
            type="order_delivered",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
        ),
        SimulationEventV2(
            seq=10,
            time_s=14,
            type="preparation_started",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
            data=EventDataV2(stage="preparing", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(
            seq=11,
            time_s=17,
            type="order_delivered",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
        ),
        SimulationEventV2(seq=12, time_s=20, type="run_finished"),
    )
    return SimulationTraceV2(
        config=EngineConfigV2(horizon_s=20),
        declared_resource_ids=(worker,),
        new_order_ids=("A", "B"),
        events=events,
        window_end_s=20,
        drain_end_s=20,
        final_orders=(
            FinalOrderState(order_id="A", person_ids=("a",), state="completed", arrival_s=0),
            FinalOrderState(order_id="B", person_ids=("b",), state="completed", arrival_s=5),
        ),
        final_people=(
            FinalPersonState(person_id="a", order_id="A", state="completed"),
            FinalPersonState(person_id="b", order_id="B", state="completed"),
        ),
        final_workers=(WorkerState(worker_id=worker, pool="integrated", stage="idle"),),
    )


def _initial_residual_trace() -> SimulationTraceV2:
    worker = "integrated-1"
    events = (
        SimulationEventV2(
            seq=0,
            time_s=0,
            type="order_initialized",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(
                initial_stage="preparing",
                stage="preparing",
                worker_reserved=True,
                worker_active=True,
                assigned_order_id="A",
            ),
        ),
        SimulationEventV2(seq=1, time_s=2, type="order_arrived", order_id="B", person_ids=("b",)),
        SimulationEventV2(
            seq=2,
            time_s=2,
            type="preparation_paused",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(
                stage="preparation_paused",
                worker_reserved=False,
                worker_active=False,
                remaining_s=8,
                related_cashier_order_id="B",
                assigned_order_id=None,
            ),
        ),
        SimulationEventV2(
            seq=3,
            time_s=2,
            type="payment_started",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
            data=EventDataV2(stage="payment_active", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(
            seq=4,
            time_s=3,
            type="payment_completed",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
            data=EventDataV2(
                stage="waiting_preparation",
                queue="preparation",
                worker_reserved=False,
                worker_active=False,
                assigned_order_id=None,
            ),
        ),
        SimulationEventV2(
            seq=5,
            time_s=3,
            type="preparation_resumed",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(
                stage="preparing",
                worker_reserved=True,
                worker_active=True,
                remaining_s=8,
                related_cashier_order_id="B",
                assigned_order_id="A",
            ),
        ),
        SimulationEventV2(
            seq=6,
            time_s=11,
            type="order_delivered",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
        ),
        SimulationEventV2(
            seq=7,
            time_s=11,
            type="preparation_started",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
            data=EventDataV2(stage="preparing", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(
            seq=8,
            time_s=12,
            type="order_delivered",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
        ),
        SimulationEventV2(seq=9, time_s=12, type="run_finished"),
    )
    return SimulationTraceV2(
        config=EngineConfigV2(horizon_s=12),
        declared_resource_ids=(worker,),
        initialized_order_ids=("A",),
        new_order_ids=("B",),
        events=events,
        window_end_s=12,
        drain_end_s=12,
        final_orders=(
            FinalOrderState(order_id="A", person_ids=("a",), state="completed", arrival_s=None),
            FinalOrderState(order_id="B", person_ids=("b",), state="completed", arrival_s=2),
        ),
        final_people=(
            FinalPersonState(person_id="a", order_id="A", state="completed"),
            FinalPersonState(person_id="b", order_id="B", state="completed"),
        ),
        final_workers=(WorkerState(worker_id=worker, pool="integrated", stage="idle"),),
    )


def _confirmation_trace() -> SimulationTraceV2:
    trace = _core_trace()
    worker = "integrated-1"
    events = trace.events[:7] + (
        SimulationEventV2(
            seq=7,
            time_s=7,
            type="payment_active_ended",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
            data=EventDataV2(
                stage="payment_pending",
                worker_reserved=True,
                worker_active=False,
            ),
        ),
        SimulationEventV2(
            seq=8,
            time_s=10,
            type="payment_completed",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
            data=EventDataV2(
                stage="waiting_preparation",
                queue="preparation",
                worker_reserved=False,
                worker_active=False,
                assigned_order_id=None,
            ),
        ),
        SimulationEventV2(
            seq=9,
            time_s=10,
            type="preparation_resumed",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(
                stage="preparing",
                worker_reserved=True,
                worker_active=True,
                remaining_s=7,
                related_cashier_order_id="B",
                assigned_order_id="A",
            ),
        ),
        SimulationEventV2(
            seq=10,
            time_s=17,
            type="order_delivered",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
        ),
        SimulationEventV2(
            seq=11,
            time_s=17,
            type="preparation_started",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
            data=EventDataV2(stage="preparing", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(
            seq=12,
            time_s=20,
            type="order_delivered",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
        ),
        SimulationEventV2(seq=13, time_s=20, type="run_finished"),
    )
    return trace.model_copy(update={"events": events})


def _repeated_pause_trace() -> SimulationTraceV2:
    trace = _core_trace()
    worker = "integrated-1"
    events = trace.events[:7] + (
        SimulationEventV2(
            seq=7,
            time_s=7,
            type="payment_completed",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
            data=EventDataV2(
                stage="waiting_preparation",
                queue="preparation",
                worker_reserved=False,
                worker_active=False,
                assigned_order_id=None,
            ),
        ),
        SimulationEventV2(
            seq=8,
            time_s=7,
            type="preparation_resumed",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(
                stage="preparing",
                worker_reserved=True,
                worker_active=True,
                remaining_s=7,
                related_cashier_order_id="B",
                assigned_order_id="A",
            ),
        ),
        SimulationEventV2(seq=9, time_s=8, type="order_arrived", order_id="C", person_ids=("c",)),
        SimulationEventV2(
            seq=10,
            time_s=9,
            type="preparation_paused",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(
                stage="preparation_paused",
                worker_reserved=False,
                worker_active=False,
                remaining_s=5,
                related_cashier_order_id="C",
                assigned_order_id=None,
            ),
        ),
        SimulationEventV2(
            seq=11,
            time_s=9,
            type="payment_started",
            order_id="C",
            person_ids=("c",),
            worker_id=worker,
            data=EventDataV2(stage="payment_active", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(
            seq=12,
            time_s=10,
            type="payment_completed",
            order_id="C",
            person_ids=("c",),
            worker_id=worker,
            data=EventDataV2(
                stage="waiting_preparation",
                queue="preparation",
                worker_reserved=False,
                worker_active=False,
                assigned_order_id=None,
            ),
        ),
        SimulationEventV2(
            seq=13,
            time_s=10,
            type="preparation_resumed",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(
                stage="preparing",
                worker_reserved=True,
                worker_active=True,
                remaining_s=5,
                related_cashier_order_id="C",
                assigned_order_id="A",
            ),
        ),
        SimulationEventV2(
            seq=14,
            time_s=15,
            type="order_delivered",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
        ),
        SimulationEventV2(
            seq=15,
            time_s=15,
            type="preparation_started",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
            data=EventDataV2(stage="preparing", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(
            seq=16,
            time_s=18,
            type="order_delivered",
            order_id="B",
            person_ids=("b",),
            worker_id=worker,
        ),
        SimulationEventV2(
            seq=17,
            time_s=18,
            type="preparation_started",
            order_id="C",
            person_ids=("c",),
            worker_id=worker,
            data=EventDataV2(stage="preparing", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(
            seq=18,
            time_s=19,
            type="order_delivered",
            order_id="C",
            person_ids=("c",),
            worker_id=worker,
        ),
        SimulationEventV2(seq=19, time_s=20, type="run_finished"),
    )
    config = trace.config.model_copy(
        update={
            "cashier_interruptions": (
                CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
                CashierInterruption(at_s=9, suspended_order_id="A", cashier_order_id="C"),
            )
        }
    )
    return trace.model_copy(
        update={
            "config": config,
            "events": events,
            "new_order_ids": ("A", "B", "C"),
            "final_orders": (
                FinalOrderState(
                    order_id="A",
                    person_ids=("a",),
                    state="completed",
                    arrival_s=0,
                ),
                FinalOrderState(
                    order_id="B",
                    person_ids=("b",),
                    state="completed",
                    arrival_s=5,
                ),
                FinalOrderState(
                    order_id="C",
                    person_ids=("c",),
                    state="completed",
                    arrival_s=8,
                ),
            ),
            "final_people": (
                FinalPersonState(person_id="a", order_id="A", state="completed"),
                FinalPersonState(person_id="b", order_id="B", state="completed"),
                FinalPersonState(person_id="c", order_id="C", state="completed"),
            ),
        }
    )


def _draining_trace() -> SimulationTraceV2:
    worker = "integrated-1"
    events = (
        SimulationEventV2(seq=0, time_s=0, type="order_arrived", order_id="A", person_ids=("a",)),
        SimulationEventV2(
            seq=1,
            time_s=0,
            type="payment_started",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(stage="payment_active", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(
            seq=2,
            time_s=2,
            type="payment_completed",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(worker_reserved=True, worker_active=False),
        ),
        SimulationEventV2(
            seq=3,
            time_s=2,
            type="preparation_started",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
            data=EventDataV2(stage="preparing", worker_reserved=True, worker_active=True),
        ),
        SimulationEventV2(
            seq=4,
            time_s=5,
            type="order_delivered",
            order_id="A",
            person_ids=("a",),
            worker_id=worker,
        ),
        SimulationEventV2(seq=5, time_s=5, type="run_finished"),
    )
    return SimulationTraceV2(
        config=EngineConfigV2(horizon_s=4),
        declared_resource_ids=(worker,),
        new_order_ids=("A",),
        events=events,
        window_end_s=4,
        drain_end_s=5,
        final_orders=(
            FinalOrderState(order_id="A", person_ids=("a",), state="completed", arrival_s=0),
        ),
        final_people=(FinalPersonState(person_id="a", order_id="A", state="completed"),),
        final_workers=(WorkerState(worker_id=worker, pool="integrated", stage="idle"),),
    )


def test_core_version_two_summary_reports_active_preparation_seconds() -> None:
    metrics = summarize(_core_trace())

    order_a, order_b = metrics.orders
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}

    assert metrics.contract_version == 2
    assert (
        order_a.preparation_started_s,
        order_a.preparation_active_s,
        order_a.preparation_paused_s,
        order_a.preparation_pause_count,
        order_a.preparation_elapsed_s,
    ) == (2, 10, 2, 1, 12)
    assert order_b.preparation_queue_wait_s == 7
    assert summaries["queue.preparation.mean.orders"].value == 0.35
    assert summaries["resource.integrated.total.active_fraction"].value == 0.85
    assert summaries["duration.preparation_active.order.new"].value == 6.5
    assert summaries["duration.preparation_paused.order.new"].value == 1
    assert summaries["duration.preparation_pause_count.order.new"].value == 0.5

    pause_window = next(
        interval
        for interval in metrics.queue_series
        if interval.queue == "preparation" and interval.start_s <= 5 and interval.end_s >= 7
    )
    paid_queue_window = next(
        interval
        for interval in metrics.queue_series
        if interval.queue == "preparation" and interval.start_s == 7 and interval.end_s == 14
    )
    assert pause_window.order_count == 0
    assert paid_queue_window.order_count == 1


def test_core_engine_trace_produces_the_same_interruption_metrics() -> None:
    trace = simulate(
        EngineConfigV2(
            horizon_s=20,
            cashier_interruptions=(
                CashierInterruption(
                    at_s=5,
                    suspended_order_id="A",
                    cashier_order_id="B",
                ),
            ),
        ),
        demand=(
            OrderInput(
                order_id="A",
                person_ids=("a",),
                arrival_s=0,
                payment_active_s=2,
                transfer_wait_s=0,
                preparation_s=10,
            ),
            OrderInput(
                order_id="B",
                person_ids=("b",),
                arrival_s=5,
                payment_active_s=2,
                transfer_wait_s=0,
                preparation_s=3,
            ),
        ),
        initial_state=(),
    )

    metrics = summarize(trace)

    assert [(order.order_id, order.delivery_s) for order in metrics.orders] == [
        ("A", 14),
        ("B", 17),
    ]
    assert (
        metrics.orders[0].preparation_active_s,
        metrics.orders[0].preparation_paused_s,
        metrics.orders[0].preparation_pause_count,
        metrics.orders[0].preparation_elapsed_s,
    ) == (10, 2, 1, 12)
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}
    assert summaries["queue.preparation.mean.orders"].value == 0.35
    assert summaries["resource.integrated.total.active_fraction"].value == 0.85


def test_initial_residual_pause_keeps_full_history_unknown_but_counts_worker_time() -> None:
    metrics = summarize(_initial_residual_trace())
    order_a = metrics.orders[0]
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}

    assert (
        order_a.preparation_elapsed_s,
        order_a.preparation_active_s,
        order_a.preparation_paused_s,
        order_a.preparation_pause_count,
    ) == (None, None, None, None)
    assert {
        item.field: item.reason
        for item in order_a.unavailable_fields
        if item.field.startswith("preparation_")
    } == {
        "preparation_elapsed_s": "preparation_start_predates_trace",
        "preparation_active_s": "preparation_start_predates_trace",
        "preparation_paused_s": "preparation_start_predates_trace",
        "preparation_pause_count": "preparation_start_predates_trace",
        "preparation_queue_wait_s": "payment_completion_predates_trace",
    }
    assert summaries["duration.preparation_active.order.initialized"].unavailable_reason == (
        "preparation_start_predates_trace"
    )
    assert summaries["resource.integrated.total.active_fraction"].value == 1
    assert metrics.resource_usage[-1].active_worker_s == 12


def test_external_confirmation_is_reserved_but_not_active_or_paid_queue_time() -> None:
    metrics = summarize(_confirmation_trace())
    order_a = metrics.orders[0]
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}
    usage = {(item.pool, item.component): item for item in metrics.resource_usage}

    assert (
        order_a.preparation_active_s,
        order_a.preparation_paused_s,
        order_a.preparation_pause_count,
        order_a.preparation_elapsed_s,
    ) == (10, 5, 1, 15)
    assert summaries["resource.integrated.external_confirmation.active_fraction"].value == 0
    assert summaries["resource.integrated.external_confirmation.reserved_fraction"].value == 0.15
    assert usage[("integrated", "external_confirmation")].reserved_worker_s == 3
    assert summaries["queue.preparation.mean.orders"].value == 0.35


def test_repeated_pause_segments_conserve_work_and_paid_fifo_metrics() -> None:
    metrics = summarize(_repeated_pause_trace())
    order_a, order_b, order_c = metrics.orders
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}

    assert (
        order_a.preparation_active_s,
        order_a.preparation_paused_s,
        order_a.preparation_pause_count,
        order_a.preparation_elapsed_s,
    ) == (10, 3, 2, 13)
    assert (order_b.delivery_s, order_c.delivery_s) == (18, 19)
    assert (order_b.preparation_queue_wait_s, order_c.preparation_queue_wait_s) == (8, 8)
    assert summaries["queue.preparation.mean.orders"].value == 0.8
    assert summaries["resource.integrated.total.active_fraction"].value == 0.95


def test_shared_group_weights_people_without_duplicating_order_or_worker_work() -> None:
    trace = _core_trace()
    shared_people = ("a1", "a2")
    events = tuple(
        event.model_copy(update={"person_ids": shared_people}) if event.order_id == "A" else event
        for event in trace.events
    )
    orders = tuple(
        order.model_copy(update={"person_ids": shared_people}) if order.order_id == "A" else order
        for order in trace.final_orders
    )
    grouped_trace = trace.model_copy(
        update={
            "events": events,
            "final_orders": orders,
            "final_people": (
                FinalPersonState(person_id="a1", order_id="A", state="completed"),
                FinalPersonState(person_id="a2", order_id="A", state="completed"),
                FinalPersonState(person_id="b", order_id="B", state="completed"),
            ),
        }
    )

    metrics = summarize(grouped_trace)
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}

    assert len(metrics.orders) == 2
    assert len(metrics.people) == 3
    assert summaries["duration.preparation_active.order.new"].value == 6.5
    assert summaries["duration.preparation_active.order.new"].count == 2
    assert summaries["duration.preparation_active.person.new"].value == pytest.approx(23 / 3)
    assert summaries["duration.preparation_active.person.new"].count == 3
    assert summaries["queue.preparation.mean.orders"].value == 0.35
    assert summaries["queue.preparation.mean.people"].value == 0.35
    assert metrics.resource_usage[-1].active_worker_s == 17


def test_window_usage_clips_at_h_while_completed_cohort_metrics_drain_after_h() -> None:
    metrics = summarize(_draining_trace())
    order = metrics.orders[0]
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}
    usage = {(item.pool, item.component): item for item in metrics.resource_usage}

    assert (metrics.horizon_s, metrics.drain_end_s, metrics.overtime_s) == (4, 5, 1)
    assert (order.preparation_active_s, order.preparation_elapsed_s, order.delivery_s) == (3, 3, 5)
    assert summaries["duration.preparation_elapsed.order.new"].value == 3
    assert summaries["throughput.window.delivery.orders_per_s"].value == 0
    assert usage[("integrated", "total")].active_worker_s == 4
    assert summaries["resource.integrated.total.active_fraction"].value == 1
