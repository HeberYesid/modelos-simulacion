import pytest
from pydantic import ValidationError

from boquitas import EngineConfig, InitialOrder, OrderInput, simulate
from boquitas.metrics import summarize


def test_shared_order_waiting_time_is_summarized_by_order_and_person() -> None:
    trace = simulate(
        EngineConfig(horizon_s=20),
        demand=[
            OrderInput(
                order_id="A",
                person_ids=("A1",),
                arrival_s=0,
                payment_active_s=7,
                transfer_wait_s=0,
                preparation_s=1,
            ),
            OrderInput(
                order_id="B",
                person_ids=("B1", "B2"),
                arrival_s=1,
                payment_active_s=1,
                transfer_wait_s=0,
                preparation_s=1,
            ),
        ],
        initial_state=[],
    )

    trace_before = trace.model_dump(mode="json")
    metrics = summarize(trace)
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}

    order_wait = summaries["duration.payment_wait.served.order.new"]
    person_wait = summaries["duration.payment_wait.served.person.new"]
    assert (order_wait.value, order_wait.count, order_wait.n_valid) == (3, 2, 2)
    assert (person_wait.value, person_wait.count, person_wait.n_valid) == (4, 3, 3)
    assert order_wait.median == 3
    assert order_wait.p95 == pytest.approx(5.7)
    assert order_wait.maximum == 6
    assert (person_wait.median, person_wait.p95, person_wait.maximum) == (6, 6, 6)
    assert trace.model_dump(mode="json") == trace_before


def test_payment_queue_area_and_maximum_use_settled_half_open_intervals() -> None:
    trace = simulate(
        EngineConfig(horizon_s=10),
        demand=[
            OrderInput(
                order_id="A",
                person_ids=("A1",),
                arrival_s=0,
                payment_active_s=5,
                transfer_wait_s=0,
                preparation_s=0,
            ),
            OrderInput(
                order_id="B",
                person_ids=("B1",),
                arrival_s=1,
                payment_active_s=1,
                transfer_wait_s=0,
                preparation_s=0,
            ),
        ],
        initial_state=[],
    )

    metrics = summarize(trace)
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}
    assert summaries["queue.payment.mean.orders"].value == 0.4
    assert summaries["queue.payment.mean.orders"].denominator == 10
    assert summaries["queue.payment.max.orders"].value == 1
    assert summaries["queue.payment.max.orders"].denominator is None
    assert [
        (interval.start_s, interval.end_s, interval.order_count)
        for interval in metrics.queue_series
        if interval.queue == "payment" and interval.order_count > 0
    ] == [(1, 5, 1)]


def test_zero_time_dispatch_cascade_has_no_queue_spike() -> None:
    trace = simulate(
        EngineConfig(horizon_s=5),
        demand=[
            OrderInput(
                order_id="A",
                person_ids=("A1",),
                arrival_s=0,
                payment_active_s=0,
                transfer_wait_s=0,
                preparation_s=0,
            ),
            OrderInput(
                order_id="B",
                person_ids=("B1",),
                arrival_s=0,
                payment_active_s=0,
                transfer_wait_s=0,
                preparation_s=0,
            ),
        ],
        initial_state=[],
    )

    metrics = summarize(trace)
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}
    assert summaries["queue.payment.max.orders"].value == 0
    assert summaries["queue.payment.mean.orders"].value == 0


def test_withdrawn_wait_uses_abandonment_time_and_person_weights() -> None:
    trace = simulate(
        EngineConfig(mode="regular", horizon_s=10),
        demand=[
            OrderInput(
                order_id="W",
                person_ids=("W1", "W2"),
                arrival_s=1,
                payment_active_s=1,
                transfer_wait_s=0,
                preparation_s=1,
                patience_s=2,
            )
        ],
        initial_state=[
            InitialOrder(
                order_id="I",
                person_ids=("I1",),
                arrival_s=None,
                stage="preparing",
                worker_id="integrated-1",
                remaining_s=20,
            )
        ],
    )

    metrics = summarize(trace)
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}
    order_wait = summaries["duration.payment_wait.withdrawn.order.new"]
    person_wait = summaries["duration.payment_wait.withdrawn.person.new"]
    assert (order_wait.value, order_wait.count, order_wait.n_valid) == (2, 1, 1)
    assert (person_wait.value, person_wait.count, person_wait.n_valid) == (2, 2, 2)
    assert summaries["queue.payment.mean.orders"].value == 0.2
    assert summaries["queue.payment.mean.people"].value == 0.4
    assert summaries["duration.payment_wait.served.order.new"].unavailable_reason == (
        "no_eligible_samples"
    )
    permanence = summaries["duration.permanence.completed.order.new"]
    assert (permanence.value, permanence.n_valid) == (None, 0)
    assert permanence.unavailable_reason == "no_completed_orders"


def test_regular_external_confirmation_is_reserved_but_not_active() -> None:
    trace = simulate(
        EngineConfig(mode="regular", horizon_s=10),
        demand=[
            OrderInput(
                order_id="A",
                person_ids=("A1",),
                arrival_s=0,
                payment_active_s=2,
                transfer_wait_s=6,
                preparation_s=2,
            )
        ],
        initial_state=[],
    )

    metrics = summarize(trace)
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}
    assert summaries["resource.integrated.payment.active_fraction"].value == 0.2
    assert summaries["resource.integrated.external_confirmation.active_fraction"].value == 0
    assert summaries["resource.integrated.external_confirmation.reserved_fraction"].value == 0.6
    assert summaries["resource.integrated.preparation.active_fraction"].value == 0.2
    assert summaries["resource.integrated.total.active_fraction"].value == 0.4
    assert summaries["resource.integrated.total.reserved_fraction"].value == 1

    usage = {(item.pool, item.component): item for item in metrics.resource_usage}
    assert usage[("integrated", "external_confirmation")].reserved_worker_s == 6
    assert usage[("integrated", "total")].available_worker_s == 10


def test_window_throughput_excludes_delivery_at_closing_but_cohort_drain_includes_it() -> None:
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("A1",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
        OrderInput(
            order_id="B",
            person_ids=("B1",),
            arrival_s=1,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
    ]

    regular = summarize(simulate(EngineConfig(mode="regular", horizon_s=10), demand, []))
    regular_summaries = {summary.metric_id: summary for summary in regular.metric_summaries}
    assert regular_summaries["duration.permanence.completed.order.new"].value == 7
    assert regular_summaries["duration.permanence.completed.order.new"].n_valid == 2
    assert regular_summaries["throughput.window.delivery.orders_per_s"].value == 0.1
    assert regular_summaries["count.delivered.orders.new"].value == 2
    assert regular.orders[1].delivery_s == 10
    assert regular.overtime_s == 0

    tuesday = summarize(simulate(EngineConfig(mode="tuesday", horizon_s=10), demand, []))
    tuesday_summaries = {summary.metric_id: summary for summary in tuesday.metric_summaries}
    assert tuesday_summaries["duration.permanence.completed.order.new"].value == 5.5


def test_new_cohort_permanence_includes_drain_after_horizon() -> None:
    trace = simulate(
        EngineConfig(mode="regular", horizon_s=10),
        demand=[
            OrderInput(
                order_id="A",
                person_ids=("A1",),
                arrival_s=9,
                payment_active_s=2,
                transfer_wait_s=0,
                preparation_s=3,
            )
        ],
        initial_state=[],
    )

    metrics = summarize(trace)
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}
    assert summaries["duration.permanence.completed.order.new"].value == 5
    assert summaries["throughput.window.delivery.orders_per_s"].value == 0
    assert metrics.drain_end_s == 14
    assert metrics.overtime_s == 4


def test_initial_preparation_preserves_unknown_arrival_and_start_history() -> None:
    trace = simulate(
        EngineConfig(mode="regular", horizon_s=10),
        demand=[],
        initial_state=[
            InitialOrder(
                order_id="I",
                person_ids=("I1",),
                arrival_s=None,
                stage="preparing",
                worker_id="integrated-1",
                remaining_s=5,
            )
        ],
    )

    metrics = summarize(trace)
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}
    permanence = summaries["duration.permanence.completed.order.initialized"]
    preparation = summaries["duration.preparation_elapsed.order.initialized"]
    assert (permanence.value, permanence.count, permanence.n_valid) == (None, 1, 0)
    assert permanence.unavailable_reason == "unknown_arrival_time"
    assert preparation.unavailable_reason == "preparation_start_predates_trace"
    assert metrics.orders[0].permanence_s is None
    assert metrics.orders[0].preparation_elapsed_s is None
    assert summaries["resource.integrated.total.active_fraction"].value == 0.5
    assert summaries["resource.integrated.total.reserved_fraction"].value == 0.5


def test_empty_run_has_valid_zero_window_metrics_and_unavailable_durations() -> None:
    trace = simulate(EngineConfig(horizon_s=10), demand=[], initial_state=[])

    metrics = summarize(trace)
    summaries = {summary.metric_id: summary for summary in metrics.metric_summaries}
    for metric_id in (
        "queue.payment.mean.orders",
        "queue.payment.max.orders",
        "queue.payment.mean.people",
        "queue.preparation.mean.orders",
        "throughput.window.delivery.orders_per_s",
        "resource.all.total.active_fraction",
    ):
        assert summaries[metric_id].value == 0
    permanence = summaries["duration.permanence.completed.order.new"]
    assert (permanence.value, permanence.count, permanence.n_valid) == (None, 0, 0)
    assert permanence.unavailable_reason == "no_completed_orders"


def test_finite_inputs_that_overflow_metric_outputs_are_rejected() -> None:
    trace = simulate(
        EngineConfig(horizon_s=1e308, cashiers=2, preparers=1),
        demand=[],
        initial_state=[],
    )

    with pytest.raises(ValidationError):
        summarize(trace)
