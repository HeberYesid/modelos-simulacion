"""Independent public-boundary regressions found during Spec07 review."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from boquitas import (
    CashierInterruption,
    EngineConfigV2,
    InputValidationError,
    OrderInput,
    OrderMetricV2,
    demo_scenario,
    run_scenario,
    simulate,
)
from boquitas.api import create_app


@pytest.mark.parametrize(
    ("field", "value"),
    [("integrated_workers", True), ("cashiers", False), ("preparers", False)],
)
def test_version_2_capacity_rejects_booleans(field: str, value: bool) -> None:
    with pytest.raises(InputValidationError):
        EngineConfigV2(**{field: value})


def test_preparation_pause_count_rejects_a_boolean() -> None:
    with pytest.raises(ValidationError):
        OrderMetricV2(
            order_id="A",
            person_ids=("P1",),
            cohort="new",
            state="completed",
            arrival_s=0,
            payment_started_s=0,
            payment_active_ended_s=2,
            payment_completed_s=2,
            preparation_started_s=2,
            delivery_s=14,
            abandonment_s=None,
            payment_wait_s=0,
            transaction_elapsed_s=2,
            preparation_queue_wait_s=0,
            preparation_elapsed_s=12,
            preparation_active_s=10,
            preparation_paused_s=2,
            preparation_pause_count=True,
            permanence_s=14,
            withdrawal_wait_s=None,
        )


def test_interrupting_payment_completion_exposes_paid_waiting_without_worker_ownership() -> None:
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    trace = simulate(
        config,
        [
            OrderInput(
                order_id="A", person_ids=("P1",), arrival_s=0,
                payment_active_s=2, transfer_wait_s=0, preparation_s=10,
            ),
            OrderInput(
                order_id="B", person_ids=("P2",), arrival_s=5,
                payment_active_s=2, transfer_wait_s=0, preparation_s=3,
            ),
        ],
        [],
    )
    completed = next(
        event for event in trace.events
        if event.type == "payment_completed" and event.order_id == "B"
    )
    assert completed.data.queue == "preparation"
    assert completed.data.assigned_order_id is None
    assert completed.data.worker_reserved is False
    assert completed.data.worker_active is False


def test_legacy_csv_request_without_a_default_version_tag_remains_valid() -> None:
    scenario = demo_scenario()
    scenario = scenario.model_copy(
        update={"engine_config": scenario.engine_config.model_copy(update={"horizon_s": 1})}
    )
    result = run_scenario(scenario).model_dump(mode="json")
    result.pop("contract_version")

    response = TestClient(create_app()).post("/api/v1/exports/csv", json={"result": result})

    assert response.status_code == 200, response.text
    assert "orders.csv" in response.json()["tables"]


@pytest.mark.parametrize(
    ("invalid_case", "expected_path"),
    [
        ("duplicate_time", "cashier_interruptions[1].at_s"),
        ("boolean_time", "cashier_interruptions[0].at_s"),
        ("negative_time", "cashier_interruptions[0].at_s"),
        ("capacity", "engine_config.integrated_workers"),
    ],
)
def test_static_version_2_errors_identify_the_script_entry_or_capacity_field(
    invalid_case: str, expected_path: str,
) -> None:
    scenario = demo_scenario().model_dump(mode="json")
    scenario["contract_version"] = 2
    config = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    ).model_dump(mode="json")
    scenario["engine_config"] = config
    if invalid_case == "duplicate_time":
        config["cashier_interruptions"].append(dict(config["cashier_interruptions"][0]))
    elif invalid_case == "boolean_time":
        config["cashier_interruptions"][0]["at_s"] = True
    elif invalid_case == "negative_time":
        config["cashier_interruptions"][0]["at_s"] = -1
    else:
        config["integrated_workers"] = 2

    response = TestClient(create_app()).post(
        "/api/v1/runs",
        json={"scenario": scenario, "root_seed": 20261020, "replication_index": 0},
    )

    assert response.status_code == 422
    assert any(expected_path in issue["path"] for issue in response.json()["issues"]), response.text
