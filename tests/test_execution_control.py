from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Event
from time import monotonic
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from boquitas.api import create_app
from boquitas.execution import (
    ExecutionCancelled,
    ExecutionControl,
    ExecutionTimedOut,
    check_execution,
    execution_scope,
)
from boquitas.experiments import run_scenario
from boquitas.metrics import summarize
from boquitas.scenarios import demo_scenario


def _run_request(*, horizon_s: float = 5) -> dict[str, object]:
    scenario = demo_scenario().model_dump(mode="json")
    scenario["engine_config"]["horizon_s"] = horizon_s  # type: ignore[index]
    return {"scenario": scenario, "root_seed": 7, "replication_index": 0}


def test_execution_check_is_noop_without_a_scope() -> None:
    check_execution()


def test_execution_scope_reports_cancellation_and_expired_deadline() -> None:
    cancelled = Event()
    cancelled.set()
    with execution_scope(ExecutionControl(cancel=cancelled)):
        with pytest.raises(ExecutionCancelled):
            check_execution()

    with execution_scope(ExecutionControl(deadline=monotonic() - 1)):
        with pytest.raises(ExecutionTimedOut):
            check_execution()


def test_cancelled_or_expired_scope_stops_public_run_and_summary() -> None:
    scenario = demo_scenario()
    result = run_scenario(scenario, root_seed=7, replication_index=0)
    controls = (
        (ExecutionControl(cancel=Event()), ExecutionCancelled),
        (ExecutionControl(deadline=monotonic() - 1), ExecutionTimedOut),
    )
    controls[0][0].cancel.set()

    for control, exception in controls:
        with execution_scope(control), pytest.raises(exception):
            run_scenario(scenario, root_seed=7, replication_index=0)
        with execution_scope(control), pytest.raises(exception):
            summarize(result.trace)


def test_cancel_before_run_registration_returns_actionable_conflict() -> None:
    client = TestClient(create_app())
    execution_id = uuid4()

    cancel = client.post(f"/api/v1/executions/{execution_id}/cancel")
    run = client.post(
        "/api/v1/runs",
        json=_run_request(),
        headers={"X-Boquitas-Execution-Id": str(execution_id)},
    )

    assert cancel.status_code == 202
    assert cancel.json() == {"status": "cancel_requested"}
    assert run.status_code == 409
    assert run.json()["code"] == "execution_cancelled"
    assert "anterior" in run.json()["message"].lower()
    assert "result" not in run.json()


def test_expired_request_returns_timeout_without_starting_a_run() -> None:
    client = TestClient(create_app(execution_timeout_s=0))

    response = client.post("/api/v1/runs", json=_run_request())

    assert response.status_code == 408
    assert response.json()["code"] == "execution_timed_out"
    assert "horizonte" in response.json()["message"].lower()


def test_invalid_execution_id_header_uses_the_structured_validation_error() -> None:
    response = TestClient(create_app()).post(
        "/api/v1/runs",
        json=_run_request(),
        headers={"X-Boquitas-Execution-Id": "not-a-uuid"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"
    assert any(
        issue["path"] == "X-Boquitas-Execution-Id" for issue in response.json()["issues"]
    )


def test_successful_run_releases_slot_and_execution_ids_cannot_be_reused() -> None:
    client = TestClient(create_app())
    execution_id = uuid4()

    completed = client.post(
        "/api/v1/runs",
        json=_run_request(),
        headers={"X-Boquitas-Execution-Id": str(execution_id)},
    )
    reused = client.post(
        "/api/v1/runs",
        json=_run_request(),
        headers={"X-Boquitas-Execution-Id": str(execution_id)},
    )
    next_run = client.post("/api/v1/runs", json=_run_request())

    assert completed.status_code == 200
    assert reused.status_code == 409
    assert reused.json()["code"] == "execution_id_reused"
    assert next_run.status_code == 200


def test_experiment_budget_limit_has_an_actionable_422_response() -> None:
    scenario = demo_scenario().model_dump(mode="json")
    scenario["engine_config"]["horizon_s"] = 4000
    scenario["interarrival"] = {"kind": "constant", "value_s": 1}
    response = TestClient(create_app()).post(
        "/api/v1/experiments",
        json={"scenarios": [scenario], "root_seed": 7, "replications": 1},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "experiment_workload_limit_exceeded"
    message = response.json()["message"].lower()
    assert "horizonte" in message
    assert "demanda" in message
    assert "réplicas" in message


def test_cancel_endpoint_stops_an_inflight_public_run() -> None:
    app = create_app()
    run_client = TestClient(app)
    cancel_client = TestClient(app)
    execution_id: UUID = uuid4()
    scenario = demo_scenario().model_dump(mode="json")
    scenario["engine_config"]["horizon_s"] = 6000
    scenario["interarrival"] = {"kind": "constant", "value_s": 1}
    payload = {"scenario": scenario, "root_seed": 7, "replication_index": 0}

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(
            run_client.post,
            "/api/v1/runs",
            json=payload,
            headers={"X-Boquitas-Execution-Id": str(execution_id)},
        )
        assert app.state.execution_registry.wait_until_active(execution_id, timeout_s=2)
        duplicate = cancel_client.post(
            "/api/v1/runs",
            json=_run_request(),
            headers={"X-Boquitas-Execution-Id": str(execution_id)},
        )
        busy = cancel_client.post("/api/v1/runs", json=_run_request())
        assert not future.done()
        cancelled = cancel_client.post(f"/api/v1/executions/{execution_id}/cancel")
        result = future.result(timeout=5)

    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "execution_id_reused"
    assert busy.status_code == 409
    assert busy.json()["code"] == "execution_busy"
    assert cancelled.status_code == 202
    assert result.status_code == 409
    assert result.json()["code"] == "execution_cancelled"
    assert not app.state.execution_registry.active_execution_ids
