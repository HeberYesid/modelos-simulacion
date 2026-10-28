import pytest
from pydantic import ValidationError

from boquitas import (
    EngineConfig,
    InitialOrder,
    InputValidationError,
    OrderInput,
    SimulationTrace,
    simulate,
)


def test_empty_input_returns_repeatable_trace_with_closed_window_and_idle_resources() -> None:
    config = EngineConfig(horizon_s=10)

    first = simulate(config, demand=[], initial_state=[])
    second = simulate(config, demand=[], initial_state=[])

    assert first == second
    assert first.window_end_s == 10
    assert first.drain_end_s == 10
    assert [(event.type, event.time_s) for event in first.events] == [
        ("admissions_closed", 10),
        ("run_finished", 10),
    ]
    assert first.final_orders == ()
    assert first.final_people == ()
    assert [worker.worker_id for worker in first.final_workers] == [
        "cashier-1",
        "preparer-1",
        "preparer-2",
        "preparer-3",
        "preparer-4",
    ]
    assert all(worker.assigned_order_id is None for worker in first.final_workers)
    assert all(not worker.reserved and not worker.active for worker in first.final_workers)


def test_active_pool_with_zero_capacity_is_rejected_with_field_issue() -> None:
    config = EngineConfig(cashiers=0)

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=[], initial_state=[])

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("config.cashiers", "capacity_minimum")
    ]


def test_nonfinite_horizon_is_rejected_as_a_field_issue() -> None:
    with pytest.raises(InputValidationError) as captured:
        EngineConfig(horizon_s=float("inf"))

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("horizon_s", "finite_number")
    ]


def test_person_identity_cannot_appear_twice_in_one_order() -> None:
    with pytest.raises(InputValidationError) as captured:
        OrderInput(
            order_id="A",
            person_ids=("P1", "P1"),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        )

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("person_ids", "value_error")
    ]


def test_order_requires_at_least_one_person() -> None:
    with pytest.raises(InputValidationError) as captured:
        order = OrderInput(
            order_id="A",
            person_ids=(),
            arrival_s=0,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        )
        simulate(EngineConfig(horizon_s=5), demand=[order], initial_state=[])

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("person_ids", "value_error")
    ]


def test_person_id_is_unique_across_all_scheduled_orders_before_admission_filtering() -> None:
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("P1",),
            arrival_s=0,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
        OrderInput(
            order_id="B",
            person_ids=("P1",),
            arrival_s=5,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    ]

    with pytest.raises(InputValidationError) as captured:
        simulate(EngineConfig(horizon_s=5), demand=demand, initial_state=[])

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("demand[1].person_ids[0]", "duplicate_person_id")
    ]


def test_opening_time_must_be_a_valid_hh_mm_ss_clock() -> None:
    with pytest.raises(InputValidationError) as captured:
        simulate(
            EngineConfig(opening_time="99:99:99", horizon_s=5),
            demand=[],
            initial_state=[],
        )

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("config.opening_time", "time_format")
    ]


def test_two_people_share_one_payment_and_one_preparation() -> None:
    order = OrderInput(
        order_id="O1",
        person_ids=("P1", "P2"),
        arrival_s=0,
        payment_active_s=2,
        transfer_wait_s=0,
        preparation_s=3,
    )

    trace = simulate(EngineConfig(horizon_s=10), demand=[order], initial_state=[])

    assert [(event.type, event.time_s) for event in trace.events] == [
        ("order_arrived", 0),
        ("payment_started", 0),
        ("payment_active_ended", 2),
        ("payment_completed", 2),
        ("preparation_started", 2),
        ("order_delivered", 5),
        ("admissions_closed", 10),
        ("run_finished", 10),
    ]
    assert [person.person_id for person in trace.final_people] == ["P1", "P2"]
    assert all(
        person.order_id == "O1" and person.state == "completed"
        for person in trace.final_people
    )


def test_positive_subnanosecond_payment_is_not_completed_early() -> None:
    order = OrderInput(
        order_id="O1",
        person_ids=("P1",),
        arrival_s=0,
        payment_active_s=5e-10,
        transfer_wait_s=0,
        preparation_s=0,
    )

    trace = simulate(EngineConfig(horizon_s=1), demand=[order], initial_state=[])

    payment_end = next(event for event in trace.events if event.type == "payment_active_ended")
    delivery = next(event for event in trace.events if event.type == "order_delivered")
    assert payment_end.time_s == 5e-10
    assert delivery.time_s == 5e-10


def test_tuesday_orders_a_and_b_follow_the_solved_payment_and_prep_timeline() -> None:
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("P1",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
        OrderInput(
            order_id="B",
            person_ids=("P2",),
            arrival_s=1,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
    ]

    trace = simulate(EngineConfig(horizon_s=10), demand=demand, initial_state=[])

    stage_times = {
        (event.order_id, event.type): event.time_s
        for event in trace.events
        if event.order_id is not None
    }
    assert (
        stage_times[("A", "payment_started")],
        stage_times[("A", "payment_active_ended")],
        stage_times[("A", "preparation_started")],
        stage_times[("A", "order_delivered")],
    ) == (0, 2, 2, 5)
    assert (
        stage_times[("B", "payment_started")],
        stage_times[("B", "payment_active_ended")],
        stage_times[("B", "preparation_started")],
        stage_times[("B", "order_delivered")],
    ) == (2, 4, 4, 7)


def test_fifth_paid_order_waits_until_a_preparer_is_released() -> None:
    demand = [
        OrderInput(
            order_id=order_id,
            person_ids=(f"P{index}",),
            arrival_s=(index - 1) / 10,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=5 if index < 5 else 2,
        )
        for index, order_id in enumerate(("A", "B", "C", "D", "E"), start=1)
    ]

    trace = simulate(EngineConfig(horizon_s=20), demand=demand, initial_state=[])

    first_delivery = next(
        event for event in trace.events if event.order_id == "A" and event.type == "order_delivered"
    )
    fifth_start = next(
        event
        for event in trace.events
        if event.order_id == "E" and event.type == "preparation_started"
    )
    first_preparation = next(
        event
        for event in trace.events
        if event.order_id == "A" and event.type == "preparation_started"
    )

    assert first_preparation.time_s == 1
    assert first_delivery.time_s == 6
    assert fifth_start.time_s == 6
    assert fifth_start.worker_id == first_delivery.worker_id == first_preparation.worker_id


def test_regular_mode_keeps_the_integrated_worker_until_each_delivery() -> None:
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("P1",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
        OrderInput(
            order_id="B",
            person_ids=("P2",),
            arrival_s=1,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
    ]

    trace = simulate(
        EngineConfig(mode="regular", horizon_s=20),
        demand=demand,
        initial_state=[],
    )

    stage_times = {
        (event.order_id, event.type): event.time_s
        for event in trace.events
        if event.order_id is not None
    }
    assert (
        stage_times[("A", "payment_started")],
        stage_times[("A", "preparation_started")],
        stage_times[("A", "order_delivered")],
    ) == (0, 2, 5)
    assert (
        stage_times[("B", "payment_started")],
        stage_times[("B", "preparation_started")],
        stage_times[("B", "order_delivered")],
    ) == (5, 7, 10)
    assert {
        event.worker_id
        for event in trace.events
        if event.type in {"payment_started", "preparation_started"}
    } == {"integrated-1"}


def test_initial_payment_service_uses_arrival_then_input_sequence() -> None:
    demand = [
        OrderInput(
            order_id="B",
            person_ids=("P1",),
            arrival_s=1,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=1,
        ),
        OrderInput(
            order_id="A",
            person_ids=("P2",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=1,
        ),
        OrderInput(
            order_id="C",
            person_ids=("P3",),
            arrival_s=1,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    ]

    trace = simulate(EngineConfig(horizon_s=10), demand=demand, initial_state=[])

    payment_starts = [
        (event.order_id, event.time_s)
        for event in trace.events
        if event.type == "payment_started"
    ]
    assert payment_starts == [("A", 0), ("B", 2), ("C", 4)]


def test_tuesday_preparation_queue_uses_payment_completion_after_transfer() -> None:
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("P1",),
            arrival_s=0,
            payment_active_s=1,
            transfer_wait_s=10,
            preparation_s=1,
        ),
        OrderInput(
            order_id="B",
            person_ids=("P2",),
            arrival_s=1,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    ]

    trace = simulate(EngineConfig(horizon_s=20), demand=demand, initial_state=[])

    payment_completed = {
        event.order_id: event.time_s for event in trace.events if event.type == "payment_completed"
    }
    preparation_started = {
        event.order_id: event.time_s
        for event in trace.events
        if event.type == "preparation_started"
    }
    assert payment_completed == {"B": 2, "A": 11}
    assert preparation_started == {"B": 2, "A": 11}
    a_active_end = next(
        event
        for event in trace.events
        if event.order_id == "A" and event.type == "payment_active_ended"
    )
    b_payment_start = next(
        event
        for event in trace.events
        if event.order_id == "B" and event.type == "payment_started"
    )
    assert (
        a_active_end.time_s,
        a_active_end.data.worker_reserved,
        a_active_end.data.worker_active,
    ) == (1, False, False)
    assert b_payment_start.time_s == a_active_end.time_s


def test_simultaneous_orders_and_workers_use_stable_ids_and_input_order() -> None:
    demand = [
        OrderInput(
            order_id=order_id,
            person_ids=(person_id,),
            arrival_s=0,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        )
        for order_id, person_id in (("B", "P1"), ("A", "P2"))
    ]

    trace = simulate(
        EngineConfig(horizon_s=5, cashiers=2, preparers=2),
        demand=demand,
        initial_state=[],
    )

    starts = [
        (event.order_id, event.worker_id, event.time_s)
        for event in trace.events
        if event.type in {"payment_started", "preparation_started"}
    ]
    assert starts == [
        ("B", "cashier-1", 0),
        ("A", "cashier-2", 0),
        ("B", "preparer-1", 1),
        ("A", "preparer-2", 1),
    ]


def test_paid_completion_tie_uses_confirmation_scheduling_order() -> None:
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("P1",),
            arrival_s=0,
            payment_active_s=10,
            transfer_wait_s=1,
            preparation_s=1,
        ),
        OrderInput(
            order_id="B",
            person_ids=("P2",),
            arrival_s=0,
            payment_active_s=1,
            transfer_wait_s=10,
            preparation_s=1,
        ),
    ]

    trace = simulate(
        EngineConfig(horizon_s=20, cashiers=2, preparers=2),
        demand=demand,
        initial_state=[],
    )

    payment_completion_order = [
        event.order_id for event in trace.events if event.type == "payment_completed"
    ]
    preparation_start_order = [
        event.order_id for event in trace.events if event.type == "preparation_started"
    ]
    assert payment_completion_order == ["B", "A"]
    assert preparation_start_order == ["B", "A"]


def test_regular_transfer_reserves_integrated_worker_while_inactive() -> None:
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("P1",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=10,
            preparation_s=3,
        ),
        OrderInput(
            order_id="B",
            person_ids=("P2",),
            arrival_s=1,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
    ]

    trace = simulate(
        EngineConfig(mode="regular", horizon_s=30),
        demand=demand,
        initial_state=[],
    )

    a_active_end = next(
        event
        for event in trace.events
        if event.order_id == "A" and event.type == "payment_active_ended"
    )
    a_paid = next(
        event
        for event in trace.events
        if event.order_id == "A" and event.type == "payment_completed"
    )
    b_payment_start = next(
        event
        for event in trace.events
        if event.order_id == "B" and event.type == "payment_started"
    )
    a_active_payment_count = sum(
        event.order_id == "A" and event.type == "payment_started" for event in trace.events
    )
    assert (a_active_end.time_s, a_active_end.worker_id) == (2, "integrated-1")
    assert (a_active_end.data.worker_reserved, a_active_end.data.worker_active) == (True, False)
    assert a_paid.time_s == 12
    assert b_payment_start.time_s == 15
    assert a_active_payment_count == 1


def test_waiting_group_abandons_together_before_first_payment_service() -> None:
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("P1",),
            arrival_s=0,
            payment_active_s=5,
            transfer_wait_s=0,
            preparation_s=3,
            patience_s=1,
        ),
        OrderInput(
            order_id="B",
            person_ids=("P2", "P3"),
            arrival_s=1,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=2,
            patience_s=2,
        ),
    ]

    trace = simulate(
        EngineConfig(mode="regular", horizon_s=10),
        demand=demand,
        initial_state=[],
    )

    abandoned = next(
        event
        for event in trace.events
        if event.order_id == "B" and event.type == "order_abandoned"
    )
    assert (abandoned.time_s, abandoned.person_ids) == (3, ("P2", "P3"))
    assert not any(
        event.order_id == "B" and event.type in {"payment_started", "preparation_started"}
        for event in trace.events
    )
    assert [(person.person_id, person.state) for person in trace.final_people] == [
        ("P1", "completed"),
        ("P2", "abandoned"),
        ("P3", "abandoned"),
    ]
    assert not any(
        event.order_id == "A" and event.type == "order_abandoned" for event in trace.events
    )
    a_delivery = next(
        event for event in trace.events if event.order_id == "A" and event.type == "order_delivered"
    )
    assert a_delivery.time_s == 8


def test_service_start_wins_when_worker_release_matches_patience_deadline() -> None:
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("P1",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
        OrderInput(
            order_id="B",
            person_ids=("P2",),
            arrival_s=1,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
            patience_s=4,
        ),
    ]

    trace = simulate(
        EngineConfig(mode="regular", horizon_s=10),
        demand=demand,
        initial_state=[],
    )

    a_delivery = next(
        event for event in trace.events if event.order_id == "A" and event.type == "order_delivered"
    )
    b_payment_start = next(
        event
        for event in trace.events
        if event.order_id == "B" and event.type == "payment_started"
    )
    assert (a_delivery.time_s, b_payment_start.time_s) == (5, 5)
    assert a_delivery.seq < b_payment_start.seq
    assert not any(
        event.order_id == "B" and event.type == "order_abandoned" for event in trace.events
    )


def test_closing_stops_admissions_but_drains_last_accepted_order() -> None:
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("P1",),
            arrival_s=9,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
        OrderInput(
            order_id="B",
            person_ids=("P2",),
            arrival_s=10,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
    ]

    trace = simulate(EngineConfig(horizon_s=10), demand=demand, initial_state=[])

    delivered = next(event for event in trace.events if event.type == "order_delivered")
    admissions_closed = next(event for event in trace.events if event.type == "admissions_closed")
    assert (trace.window_end_s, trace.drain_end_s) == (10, 14)
    assert (admissions_closed.time_s, delivered.time_s) == (10, 14)
    assert trace.new_order_ids == ("A",)
    assert [order.order_id for order in trace.final_orders] == ["A"]


def test_cancelled_patience_deadline_does_not_extend_drain() -> None:
    order = OrderInput(
        order_id="A",
        person_ids=("P1",),
        arrival_s=0,
        payment_active_s=1,
        transfer_wait_s=0,
        preparation_s=1,
        patience_s=100,
    )

    trace = simulate(
        EngineConfig(mode="regular", horizon_s=10),
        demand=[order],
        initial_state=[],
    )

    assert trace.drain_end_s == 10
    assert max(event.time_s for event in trace.events) == 10
    assert not any(event.type == "order_abandoned" for event in trace.events)


def test_initial_waiting_payment_precedes_new_time_zero_arrivals_without_rearrival() -> None:
    initial = InitialOrder(
        order_id="A",
        person_ids=("P1",),
        arrival_s=None,
        stage="waiting_payment",
        queue_rank=0,
        payment_active_s=2,
        transfer_wait_s=0,
        preparation_s=1,
    )
    demand = [
        OrderInput(
            order_id="B",
            person_ids=("P2",),
            arrival_s=0,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        )
    ]

    trace = simulate(EngineConfig(horizon_s=10), demand=demand, initial_state=[initial])

    initial_event = next(event for event in trace.events if event.type == "order_initialized")
    a_service = next(
        event
        for event in trace.events
        if event.order_id == "A" and event.type == "payment_started"
    )
    b_service = next(
        event
        for event in trace.events
        if event.order_id == "B" and event.type == "payment_started"
    )
    assert initial_event.order_id == "A" and initial_event.time_s == 0
    assert a_service.time_s == 0 and b_service.time_s == 2
    assert trace.initialized_order_ids == ("A",)
    assert trace.new_order_ids == ("B",)
    assert not any(
        event.order_id == "A" and event.type == "order_arrived" for event in trace.events
    )
    assert trace.final_orders[0].arrival_s is None


def test_initial_active_payment_uses_remaining_time_without_past_events() -> None:
    initial = InitialOrder(
        order_id="A",
        person_ids=("P1",),
        arrival_s=None,
        stage="payment_active",
        worker_id="cashier-1",
        remaining_s=2,
        transfer_wait_s=10,
        preparation_s=3,
    )

    trace = simulate(
        EngineConfig(horizon_s=10),
        demand=[],
        initial_state=[initial],
    )

    initialized = next(event for event in trace.events if event.type == "order_initialized")
    active_end = next(event for event in trace.events if event.type == "payment_active_ended")
    paid = next(event for event in trace.events if event.type == "payment_completed")
    prepared = next(event for event in trace.events if event.type == "preparation_started")
    delivered = next(event for event in trace.events if event.type == "order_delivered")
    assert (initialized.time_s, initialized.worker_id, initialized.data.remaining_s) == (
        0,
        "cashier-1",
        2,
    )
    assert (active_end.time_s, paid.time_s, prepared.time_s, delivered.time_s) == (2, 12, 12, 15)
    assert not any(
        event.order_id == "A" and event.type in {"payment_started", "order_arrived"}
        for event in trace.events
    )
    assert trace.final_orders[0].arrival_s is None
    assert (trace.window_end_s, trace.drain_end_s) == (10, 15)


def test_initial_pending_payment_has_no_fabricated_active_end() -> None:
    initial = InitialOrder(
        order_id="A",
        person_ids=("P1",),
        arrival_s=None,
        stage="payment_pending",
        remaining_s=2,
        preparation_s=3,
    )

    trace = simulate(
        EngineConfig(horizon_s=5),
        demand=[],
        initial_state=[initial],
    )

    initialized = next(event for event in trace.events if event.type == "order_initialized")
    paid = next(event for event in trace.events if event.type == "payment_completed")
    prepared = next(event for event in trace.events if event.type == "preparation_started")
    delivered = next(event for event in trace.events if event.type == "order_delivered")
    assert (initialized.time_s, initialized.data.remaining_s) == (0, 2)
    assert (paid.time_s, prepared.time_s, delivered.time_s) == (2, 2, 5)
    assert not any(
        event.type in {"payment_started", "payment_active_ended", "order_arrived"}
        for event in trace.events
    )
    assert trace.final_orders[0].arrival_s is None


def test_initial_preparation_releases_worker_to_initial_paid_queue() -> None:
    initial_preparing = InitialOrder(
        order_id="A",
        person_ids=("P1",),
        arrival_s=None,
        stage="preparing",
        worker_id="preparer-1",
        remaining_s=3,
    )
    initial_waiting = InitialOrder(
        order_id="B",
        person_ids=("P2",),
        arrival_s=None,
        stage="waiting_preparation",
        queue_rank=0,
        preparation_s=2,
    )

    trace = simulate(
        EngineConfig(horizon_s=10, preparers=1),
        demand=[],
        initial_state=[initial_preparing, initial_waiting],
    )

    a_initialized = next(
        event
        for event in trace.events
        if event.order_id == "A" and event.type == "order_initialized"
    )
    a_delivery = next(
        event
        for event in trace.events
        if event.order_id == "A" and event.type == "order_delivered"
    )
    b_prep = next(
        event
        for event in trace.events
        if event.order_id == "B" and event.type == "preparation_started"
    )
    assert (a_initialized.data.worker_reserved, a_initialized.data.worker_active) == (True, True)
    assert (a_delivery.time_s, b_prep.time_s, b_prep.worker_id) == (3, 3, "preparer-1")
    assert not any(
        event.order_id == "A" and event.type == "preparation_started" for event in trace.events
    )


def test_initial_paid_queue_ranks_precede_new_time_zero_paid_orders() -> None:
    initial = [
        InitialOrder(
            order_id="A",
            person_ids=("P1",),
            arrival_s=None,
            stage="waiting_preparation",
            queue_rank=2,
            preparation_s=1,
        ),
        InitialOrder(
            order_id="B",
            person_ids=("P2",),
            arrival_s=None,
            stage="waiting_preparation",
            queue_rank=1,
            preparation_s=1,
        ),
    ]
    demand = [
        OrderInput(
            order_id="C",
            person_ids=("P3",),
            arrival_s=0,
            payment_active_s=0,
            transfer_wait_s=0,
            preparation_s=1,
        )
    ]

    trace = simulate(
        EngineConfig(horizon_s=10, preparers=1),
        demand=demand,
        initial_state=initial,
    )

    preparation_starts = [
        (event.order_id, event.time_s)
        for event in trace.events
        if event.type == "preparation_started"
    ]
    assert preparation_starts == [("B", 0), ("A", 1), ("C", 2)]
    assert trace.final_orders[0].arrival_s is None


def test_zero_time_initial_and_new_work_settles_before_patience_expiry() -> None:
    initial = [
        InitialOrder(
            order_id="A",
            person_ids=("P1",),
            arrival_s=None,
            stage="preparing",
            worker_id="integrated-1",
            remaining_s=0,
        ),
        InitialOrder(
            order_id="B",
            person_ids=("P2",),
            arrival_s=None,
            stage="waiting_payment",
            queue_rank=0,
            patience_remaining_s=0,
            payment_active_s=0,
            transfer_wait_s=0,
            preparation_s=0,
        ),
    ]
    new_order = OrderInput(
        order_id="C",
        person_ids=("P3",),
        arrival_s=0,
        payment_active_s=0,
        transfer_wait_s=0,
        preparation_s=0,
        patience_s=0,
    )

    trace = simulate(
        EngineConfig(mode="regular", horizon_s=1),
        demand=[new_order],
        initial_state=initial,
    )

    deliveries = [
        (event.order_id, event.time_s) for event in trace.events if event.type == "order_delivered"
    ]
    assert deliveries == [("A", 0), ("B", 0), ("C", 0)]
    assert not any(event.type == "order_abandoned" for event in trace.events)


def test_initial_waiting_order_uses_remaining_patience_from_time_zero() -> None:
    initial = [
        InitialOrder(
            order_id="A",
            person_ids=("P1",),
            arrival_s=None,
            stage="payment_active",
            worker_id="cashier-1",
            remaining_s=3,
            transfer_wait_s=0,
            preparation_s=1,
        ),
        InitialOrder(
            order_id="B",
            person_ids=("P2",),
            arrival_s=None,
            stage="waiting_payment",
            queue_rank=0,
            patience_remaining_s=2,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    ]

    trace = simulate(
        EngineConfig(horizon_s=10),
        demand=[],
        initial_state=initial,
    )

    abandoned = next(
        event
        for event in trace.events
        if event.order_id == "B" and event.type == "order_abandoned"
    )
    assert (abandoned.type, abandoned.time_s) == ("order_abandoned", 2)
    assert not any(
        event.order_id == "B" and event.type == "payment_started" for event in trace.events
    )


def test_initial_queue_rejects_duplicate_ranks() -> None:
    initial = [
        InitialOrder(
            order_id=order_id,
            person_ids=(person_id,),
            arrival_s=None,
            stage="waiting_payment",
            queue_rank=0,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        )
        for order_id, person_id in (("A", "P1"), ("B", "P2"))
    ]

    with pytest.raises(InputValidationError) as captured:
        simulate(EngineConfig(horizon_s=5), demand=[], initial_state=initial)

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("initial_state[1].queue_rank", "duplicate_queue_rank")
    ]


def test_initial_state_rejects_two_orders_assigned_to_one_worker() -> None:
    initial = [
        InitialOrder(
            order_id=order_id,
            person_ids=(person_id,),
            arrival_s=None,
            stage="preparing",
            worker_id="preparer-1",
            remaining_s=1,
        )
        for order_id, person_id in (("A", "P1"), ("B", "P2"))
    ]

    with pytest.raises(InputValidationError) as captured:
        simulate(EngineConfig(horizon_s=5, preparers=1), demand=[], initial_state=initial)

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("initial_state[1].worker_id", "worker_overassigned")
    ]


def test_cross_list_person_identity_is_rejected_before_simulation() -> None:
    initial = InitialOrder(
        order_id="A",
        person_ids=("P1",),
        arrival_s=None,
        stage="waiting_payment",
        queue_rank=0,
        payment_active_s=1,
        transfer_wait_s=0,
        preparation_s=1,
    )
    demand = [
        OrderInput(
            order_id="B",
            person_ids=("P1",),
            arrival_s=10,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        )
    ]

    with pytest.raises(InputValidationError) as captured:
        simulate(EngineConfig(horizon_s=10), demand=demand, initial_state=[initial])

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("demand[0].person_ids[0]", "duplicate_person_id")
    ]


def test_cross_list_order_identity_is_rejected_even_for_arrival_at_horizon() -> None:
    initial = InitialOrder(
        order_id="A",
        person_ids=("P1",),
        arrival_s=None,
        stage="waiting_payment",
        queue_rank=0,
        payment_active_s=1,
        transfer_wait_s=0,
        preparation_s=1,
    )
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("P2",),
            arrival_s=10,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        )
    ]

    with pytest.raises(InputValidationError) as captured:
        simulate(EngineConfig(horizon_s=10), demand=demand, initial_state=[initial])

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("demand[0].order_id", "duplicate_order_id")
    ]


def test_regular_mode_rejects_an_initial_separate_preparation_queue() -> None:
    initial = InitialOrder(
        order_id="A",
        person_ids=("P1",),
        arrival_s=None,
        stage="waiting_preparation",
        queue_rank=0,
        preparation_s=1,
    )

    with pytest.raises(InputValidationError) as captured:
        simulate(
            EngineConfig(mode="regular", horizon_s=5),
            demand=[],
            initial_state=[initial],
        )

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("initial_state[0].stage", "stage_incompatible_with_mode")
    ]


def test_public_trace_exposes_stage_queue_and_resource_state_transitions() -> None:
    order = OrderInput(
        order_id="A",
        person_ids=("P1",),
        arrival_s=0,
        payment_active_s=1,
        transfer_wait_s=2,
        preparation_s=1,
    )

    trace = simulate(EngineConfig(horizon_s=5), demand=[order], initial_state=[])

    transitions = [
        (
            event.type,
            event.data.stage,
            event.data.queue,
            event.data.worker_reserved,
            event.data.worker_active,
        )
        for event in trace.events
        if event.order_id == "A"
    ]
    assert transitions == [
        ("order_arrived", "waiting_payment", "payment", False, False),
        ("payment_started", "payment_active", None, True, True),
        ("payment_active_ended", "payment_pending", None, False, False),
        ("payment_completed", "waiting_preparation", "preparation", False, False),
        ("preparation_started", "preparation", None, True, True),
        ("order_delivered", "completed", None, False, False),
    ]


def test_trace_round_trips_as_json_and_is_deeply_immutable() -> None:
    order = OrderInput(
        order_id="A",
        person_ids=("P1", "P2"),
        arrival_s=0,
        payment_active_s=1,
        transfer_wait_s=2,
        preparation_s=1,
    )
    trace = simulate(EngineConfig(horizon_s=5), demand=[order], initial_state=[])

    restored = SimulationTrace.model_validate_json(trace.model_dump_json())

    assert restored == trace
    assert isinstance(trace.events, tuple)
    assert isinstance(trace.events[0].person_ids, tuple)
    with pytest.raises(ValidationError):
        trace.events[0].data.worker_active = True
    with pytest.raises(ValidationError):
        trace.events[0].time_s = 100


def test_public_events_reconstruct_final_orders_people_queues_and_workers() -> None:
    order = OrderInput(
        order_id="A",
        person_ids=("P1", "P2"),
        arrival_s=0,
        payment_active_s=1,
        transfer_wait_s=1,
        preparation_s=2,
    )
    trace = simulate(EngineConfig(horizon_s=5), demand=[order], initial_state=[])
    order_states: dict[str, str] = {}
    queues: dict[str, str] = {}
    workers = {
        worker_id: {
            "pool": worker_id.split("-", maxsplit=1)[0],
            "assigned_order_id": None,
            "reserved": False,
            "active": False,
            "stage": None,
        }
        for worker_id in trace.declared_resource_ids
    }

    for event in trace.events:
        if event.order_id is not None:
            if event.data.stage is not None:
                order_states[event.order_id] = event.data.stage
            if event.data.queue is not None:
                queues[event.order_id] = event.data.queue
            if event.type in {"payment_started", "preparation_started"}:
                queues.pop(event.order_id, None)
            if event.type in {"order_delivered", "order_abandoned"}:
                queues.pop(event.order_id, None)
        if event.worker_id is not None and event.data.worker_reserved is not None:
            if event.data.worker_reserved:
                workers[event.worker_id] = {
                    "pool": event.worker_id.split("-", maxsplit=1)[0],
                    "assigned_order_id": event.order_id,
                    "reserved": True,
                    "active": bool(event.data.worker_active),
                    "stage": event.data.stage,
                }
            else:
                workers[event.worker_id] = {
                    "pool": event.worker_id.split("-", maxsplit=1)[0],
                    "assigned_order_id": None,
                    "reserved": False,
                    "active": False,
                    "stage": None,
                }

    assert queues == {}
    assert order_states == {state.order_id: state.state for state in trace.final_orders}
    assert all(
        order_states[person.order_id] == person.state for person in trace.final_people
    )
    assert workers == {
        worker.worker_id: {
            "pool": worker.pool,
            "assigned_order_id": worker.assigned_order_id,
            "reserved": worker.reserved,
            "active": worker.active,
            "stage": worker.stage,
        }
        for worker in trace.final_workers
    }


def test_same_explicit_workload_preserves_people_and_order_work_across_modes() -> None:
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("P1", "P2"),
            arrival_s=0,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=2,
        ),
        OrderInput(
            order_id="B",
            person_ids=("P3",),
            arrival_s=1,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    ]

    tuesday = simulate(EngineConfig(mode="tuesday", horizon_s=10), demand=demand, initial_state=[])
    regular = simulate(EngineConfig(mode="regular", horizon_s=10), demand=demand, initial_state=[])

    expected_entities = [("A", ("P1", "P2")), ("B", ("P3",))]
    for trace in (tuesday, regular):
        assert [
            (order.order_id, order.person_ids) for order in trace.final_orders
        ] == expected_entities
        for event_type in ("payment_started", "preparation_started", "order_delivered"):
            assert sum(event.type == event_type for event in trace.events) == 2
    assert {
        (person.person_id, person.order_id) for person in tuesday.final_people
    } == {(person.person_id, person.order_id) for person in regular.final_people}
    assert {
        event.order_id: event.time_s
        for event in tuesday.events
        if event.type == "order_delivered"
    } != {
        event.order_id: event.time_s
        for event in regular.events
        if event.type == "order_delivered"
    }
