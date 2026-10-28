from __future__ import annotations

import pytest

from boquitas import (
    CashierInterruption,
    EngineConfigV2,
    InitialOrder,
    InputValidationError,
    OrderInput,
    simulate,
)


def test_core_scripted_interruption_conserves_work_and_resumes_before_paid_order() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(
                at_s=5,
                suspended_order_id="A",
                cashier_order_id="B",
            ),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=10,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=5,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
    )

    trace = simulate(config, demand=demand, initial_state=())

    deliveries = {
        event.order_id: event.time_s
        for event in trace.events
        if event.type == "order_delivered"
    }
    assert trace.contract_version == 2
    assert deliveries == {"A": 14, "B": 17}
    assert not any(
        event.type == "order_delivered" and event.order_id == "A" and event.time_s == 12
        for event in trace.events
    )
    assert [
        (event.type, event.order_id, event.time_s)
        for event in trace.events
        if event.type in {"preparation_started", "preparation_paused", "preparation_resumed"}
    ] == [
        ("preparation_started", "A", 2),
        ("preparation_paused", "A", 5),
        ("preparation_resumed", "A", 7),
        ("preparation_started", "B", 14),
    ]
    pause = next(event for event in trace.events if event.type == "preparation_paused")
    resume = next(event for event in trace.events if event.type == "preparation_resumed")
    assert pause.worker_id == resume.worker_id == "integrated-1"
    assert pause.data.stage == "preparation_paused"
    assert pause.data.remaining_s == 7
    assert pause.data.related_cashier_order_id == "B"
    assert pause.data.assigned_order_id is None
    assert pause.data.worker_reserved is False
    assert pause.data.worker_active is False
    assert resume.data.stage == "preparing"
    assert resume.data.remaining_s == 7
    assert resume.data.related_cashier_order_id == "B"
    assert resume.data.assigned_order_id == "A"
    assert resume.data.worker_reserved is True
    assert resume.data.worker_active is True
    cashier_start = next(
        event
        for event in trace.events
        if event.type == "payment_started" and event.order_id == "B"
    )
    assert cashier_start.data.assigned_order_id == "B"
    assert cashier_start.data.worker_reserved is True
    assert cashier_start.data.worker_active is True
    assert (
        sum(event.type == "payment_started" and event.order_id == "A" for event in trace.events)
        == 1
    )
    assert (
        sum(event.type == "payment_started" and event.order_id == "B" for event in trace.events)
        == 1
    )


def test_empty_version_2_script_does_not_interrupt_on_arrival() -> None:
    trace = simulate(
        EngineConfigV2(horizon_s=20),
        demand=(
            OrderInput(
                order_id="A",
                person_ids=("person-A",),
                arrival_s=0,
                payment_active_s=2,
                transfer_wait_s=0,
                preparation_s=10,
            ),
            OrderInput(
                order_id="B",
                person_ids=("person-B",),
                arrival_s=5,
                payment_active_s=2,
                transfer_wait_s=0,
                preparation_s=3,
            ),
        ),
        initial_state=(),
    )

    assert {
        event.order_id: event.time_s
        for event in trace.events
        if event.type == "order_delivered"
    } == {"A": 12, "B": 17}
    assert next(
        event.time_s
        for event in trace.events
        if event.type == "payment_started" and event.order_id == "B"
    ) == 12
    assert not any(
        event.type in {"preparation_paused", "preparation_resumed"}
        for event in trace.events
    )


@pytest.mark.parametrize(
    ("cashier_order", "expected_code"),
    [
        (None, "unknown_order_id"),
        (20, "order_excluded_at_h"),
    ],
)
def test_script_references_must_resolve_to_an_admitted_or_initial_order(
    cashier_order: int | None,
    expected_code: str,
) -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    demand = [
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=10,
        )
    ]
    if cashier_order is not None:
        demand.append(
            OrderInput(
                order_id="B",
                person_ids=("person-B",),
                arrival_s=cashier_order,
                payment_active_s=2,
                transfer_wait_s=0,
                preparation_s=3,
            )
        )

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=demand, initial_state=())

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("config.cashier_interruptions[0].cashier_order_id", expected_code)
    ]


def test_unknown_suspended_order_id_has_an_indexed_field_path() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="missing", cashier_order_id="B"),
        ),
    )
    demand = (
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=1,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=demand, initial_state=())

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("config.cashier_interruptions[0].suspended_order_id", "unknown_order_id")
    ]


def test_simulate_revalidates_a_version_2_config_copied_without_validation() -> None:
    config = EngineConfigV2(horizon_s=20).model_copy(update={"integrated_workers": 2})

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=(), initial_state=())

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("integrated_workers", "literal_error")
    ]


def test_simulate_revalidates_script_entries_copied_without_validation() -> None:
    entry = CashierInterruption(
        at_s=5,
        suspended_order_id="A",
        cashier_order_id="B",
    ).model_copy(update={"at_s": True})
    config = EngineConfigV2(horizon_s=20).model_copy(update={"cashier_interruptions": (entry,)})

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=(), initial_state=())

    assert any(
        issue.path == "cashier_interruptions.0" and "at_s" in issue.message
        for issue in captured.value.issues
    )


def test_script_fails_instead_of_skipping_a_fifo_ineligible_cashier_order() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=10,
        ),
        OrderInput(
            order_id="C",
            person_ids=("person-C",),
            arrival_s=3,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=1,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=4,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=demand, initial_state=())

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("config.cashier_interruptions[0].cashier_order_id", "cashier_order_not_fifo_eligible")
    ]


def test_script_fails_if_the_suspended_preparation_finished_at_its_time() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=5,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=demand, initial_state=())

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("config.cashier_interruptions[0].suspended_order_id", "suspended_order_not_preparing")
    ]


def test_repeated_interruption_preserves_work_and_paid_queue_fifo() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
            CashierInterruption(at_s=9, suspended_order_id="A", cashier_order_id="C"),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=10,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=5,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
        OrderInput(
            order_id="C",
            person_ids=("person-C",),
            arrival_s=8,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )

    trace = simulate(config, demand=demand, initial_state=())

    deliveries = {
        event.order_id: event.time_s
        for event in trace.events
        if event.type == "order_delivered"
    }
    assert deliveries == {"A": 15, "B": 18, "C": 19}
    assert (
        sum(
            event.type == "preparation_started" and event.order_id == "A"
            for event in trace.events
        )
        == 1
    )
    assert [
        event.time_s
        for event in trace.events
        if event.type == "preparation_paused" and event.order_id == "A"
    ] == [5, 9]
    assert [
        event.time_s
        for event in trace.events
        if event.type == "preparation_resumed" and event.order_id == "A"
    ] == [7, 10]


def test_interrupted_cashier_confirmation_reserves_worker_before_resumption() -> None:
    config = EngineConfigV2(
        horizon_s=25,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=10,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=5,
            payment_active_s=2,
            transfer_wait_s=3,
            preparation_s=3,
        ),
    )

    trace = simulate(config, demand=demand, initial_state=())

    deliveries = {
        event.order_id: event.time_s
        for event in trace.events
        if event.type == "order_delivered"
    }
    assert deliveries == {"A": 17, "B": 20}
    payment_ended = next(
        event
        for event in trace.events
        if event.type == "payment_active_ended" and event.order_id == "B"
    )
    assert payment_ended.time_s == 7
    assert payment_ended.data.assigned_order_id == "B"
    assert payment_ended.data.worker_reserved is True
    assert payment_ended.data.worker_active is False
    assert next(
        event.time_s
        for event in trace.events
        if event.type == "payment_completed" and event.order_id == "B"
    ) == 10
    resume = next(event for event in trace.events if event.type == "preparation_resumed")
    assert resume.time_s == 10
    assert resume.data.assigned_order_id == "A"


def test_zero_duration_cashier_transaction_pauses_and_resumes_once() -> None:
    config = EngineConfigV2(
        horizon_s=10,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=10,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=5,
            payment_active_s=0,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )

    trace = simulate(config, demand=demand, initial_state=())

    at_pause_time = [event for event in trace.events if event.time_s == 5]
    assert [event.type for event in at_pause_time] == [
        "order_arrived",
        "preparation_paused",
        "payment_started",
        "payment_active_ended",
        "payment_completed",
        "preparation_resumed",
    ]
    assert (
        sum(event.type == "payment_started" and event.order_id == "B" for event in trace.events)
        == 1
    )
    assert (
        sum(
            event.type == "preparation_resumed" and event.order_id == "A"
            for event in trace.events
        )
        == 1
    )
    assert {
        event.order_id: event.time_s
        for event in trace.events
        if event.type == "order_delivered"
    } == {"A": 12, "B": 13}


def test_scripted_payment_at_patience_deadline_wins_before_expiry() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=10,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=5,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=1,
            patience_s=0,
        ),
    )

    trace = simulate(config, demand=demand, initial_state=())

    assert (
        sum(event.type == "payment_started" and event.order_id == "B" for event in trace.events)
        == 1
    )
    assert not any(
        event.type == "order_abandoned" and event.order_id == "B" for event in trace.events
    )


def test_script_cannot_charge_an_order_abandoned_before_its_time() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=10,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=3,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=1,
            patience_s=1,
        ),
    )

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=demand, initial_state=())

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("config.cashier_interruptions[0].cashier_order_id", "cashier_order_not_waiting")
    ]


def test_admitted_orders_can_drain_after_closing_before_a_post_horizon_script() -> None:
    config = EngineConfigV2(
        horizon_s=4,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=10,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=3,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
        OrderInput(
            order_id="excluded",
            person_ids=("person-excluded",),
            arrival_s=4,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )

    trace = simulate(config, demand=demand, initial_state=())

    assert trace.window_end_s == 4
    assert trace.drain_end_s == 17
    assert trace.new_order_ids == ("A", "B")
    assert {
        event.order_id: event.time_s
        for event in trace.events
        if event.type == "order_delivered"
    } == {"A": 14, "B": 17}


def test_unconsumed_script_fails_if_all_orders_are_terminal() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=100, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=2,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=demand, initial_state=())

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("config.cashier_interruptions[0]", "script_unconsumed")
    ]


def test_resumed_preparation_keeps_positive_subnanosecond_work() -> None:
    interruption_time = 1.0 - 5e-10
    config = EngineConfigV2(
        horizon_s=3,
        cashier_interruptions=(
            CashierInterruption(
                at_s=interruption_time,
                suspended_order_id="A",
                cashier_order_id="B",
            ),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=0,
            transfer_wait_s=0,
            preparation_s=1,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=0,
            payment_active_s=0,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )

    trace = simulate(config, demand=demand, initial_state=())

    resume = next(event for event in trace.events if event.type == "preparation_resumed")
    assert 0 < resume.data.remaining_s < 1e-9
    assert resume.data.remaining_s == pytest.approx(5e-10, abs=1e-16)
    assert next(
        event.time_s
        for event in trace.events
        if event.type == "order_delivered" and event.order_id == "A"
    ) == pytest.approx(1.0)


def test_initial_residual_preparation_and_shared_people_use_one_workload() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=2, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    initial = (
        InitialOrder(
            order_id="A",
            person_ids=("person-A1", "person-A2"),
            stage="preparing",
            worker_id="integrated-1",
            remaining_s=10,
        ),
    )
    demand = (
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=2,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )

    trace = simulate(config, demand=demand, initial_state=initial)

    assert trace.initialized_order_ids == ("A",)
    assert trace.new_order_ids == ("B",)
    assert {
        event.order_id: event.time_s
        for event in trace.events
        if event.type == "order_delivered"
    } == {"A": 11, "B": 12}
    pause = next(event for event in trace.events if event.type == "preparation_paused")
    resume = next(event for event in trace.events if event.type == "preparation_resumed")
    assert pause.data.remaining_s == 8
    assert resume.data.remaining_s == 8
    assert pause.person_ids == resume.person_ids == ("person-A1", "person-A2")
    assert len([person for person in trace.final_people if person.order_id == "A"]) == 2
    assert not any(
        event.type == "preparation_started" and event.order_id == "A" for event in trace.events
    )


def test_script_rejects_an_order_that_was_already_paid_by_an_earlier_entry() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
            CashierInterruption(at_s=8, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=10,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=5,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=3,
        ),
    )

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=demand, initial_state=())

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("config.cashier_interruptions[1].cashier_order_id", "cashier_order_not_waiting")
    ]


def test_script_rejects_nested_pause_while_first_cashier_is_still_active() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
            CashierInterruption(at_s=7, suspended_order_id="A", cashier_order_id="C"),
        ),
    )
    demand = (
        OrderInput(
            order_id="A",
            person_ids=("person-A",),
            arrival_s=0,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=10,
        ),
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=5,
            payment_active_s=10,
            transfer_wait_s=0,
            preparation_s=3,
        ),
        OrderInput(
            order_id="C",
            person_ids=("person-C",),
            arrival_s=6,
            payment_active_s=1,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=demand, initial_state=())

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("config.cashier_interruptions[1].suspended_order_id", "suspended_order_not_preparing")
    ]


def test_script_cannot_interrupt_a_worker_who_is_still_processing_payment() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    initial = (
        InitialOrder(
            order_id="A",
            person_ids=("person-A",),
            stage="payment_active",
            worker_id="integrated-1",
            remaining_s=10,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )
    demand = (
        OrderInput(
            order_id="B",
            person_ids=("person-B",),
            arrival_s=1,
            payment_active_s=2,
            transfer_wait_s=0,
            preparation_s=1,
        ),
    )

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=demand, initial_state=initial)

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("config.cashier_interruptions[0].suspended_order_id", "suspended_order_not_preparing")
    ]


def test_version_2_rejects_an_initial_independent_paid_preparation_queue() -> None:
    config = EngineConfigV2(horizon_s=20)
    initial = (
        InitialOrder(
            order_id="already-paid",
            person_ids=("person-B",),
            stage="waiting_preparation",
            queue_rank=0,
            preparation_s=3,
        ),
    )

    with pytest.raises(InputValidationError) as captured:
        simulate(config, demand=(), initial_state=initial)

    assert [(issue.path, issue.code) for issue in captured.value.issues] == [
        ("initial_state[0].stage", "stage_incompatible_with_mode")
    ]
