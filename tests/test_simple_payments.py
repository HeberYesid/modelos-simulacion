"""App payment simplification preserves explicit methods and old artifacts."""

import pytest
from fastapi.testclient import TestClient

from boquitas.api import create_app
from boquitas.scenarios import demo_scenario, method_only_scenario


@pytest.mark.parametrize("mode", ["tuesday", "regular"])
def test_opening_confirmation_settles_immediately_without_losing_preparation(mode: str) -> None:
    payload = demo_scenario().model_dump(mode="json")
    payload["engine_config"].update(
        mode=mode, horizon_s=2, cashiers=1 if mode == "tuesday" else 0,
        preparers=1 if mode == "tuesday" else 0,
        integrated_workers=1 if mode == "regular" else 0,
    )
    payload["interarrival"] = {"kind": "constant", "value_s": 10}
    payload["initial_state"] = [{
        "order_id": "opening", "person_ids": ["person"], "stage": "payment_pending",
        "remaining_s": 17, "preparation_s": 3,
        "worker_id": "integrated-1" if mode == "regular" else None,
    }]
    response = TestClient(create_app()).post(
        "/api/v1/runs", json={"scenario": payload, "root_seed": 1, "replication_index": 0},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["initial_state"][0]["payment_method"] == "transfer"
    assert result["initial_state"][0]["remaining_s"] == 0
    assert result["metrics"]["orders"][0]["preparation_started_s"] == 0
    assert result["metrics"]["orders"][0]["delivery_s"] == 3
    assert payload["initial_state"][0]["remaining_s"] == 17


def test_payment_simplification_is_idempotent_and_keeps_original_scenario() -> None:
    original = demo_scenario()
    simplified = method_only_scenario(original)
    assert method_only_scenario(simplified) == simplified
    assert original.transfer_confirmation != simplified.transfer_confirmation
