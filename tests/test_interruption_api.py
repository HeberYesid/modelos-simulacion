import json
from pathlib import Path

from fastapi.testclient import TestClient

from boquitas import api
from boquitas.api import create_app
from boquitas.experiments import RunResultV2, run_scenario
from boquitas.exports import (
    dump_run_json,
    load_experiment_json,
    load_run_json,
    load_scenario_json,
)
from boquitas.scenarios import ScenarioV2, method_only_scenario


def _review_dir() -> Path:
    return (
        Path(__file__).parents[1]
        / "openspec"
        / "changes"
        / "boquitas-07-preparation-interruptions"
        / "review"
    )


def _legacy_payload() -> dict[str, object]:
    path = _review_dir() / "scripted-demo-legacy-reference.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _scripted_payload() -> dict[str, object]:
    path = _review_dir() / "scripted-demo-input.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_api_run_route_accepts_v2_and_keeps_the_compact_result_bytes() -> None:
    payload = _scripted_payload()
    scenario = ScenarioV2(**payload)
    expected = run_scenario(method_only_scenario(scenario), root_seed=47, replication_index=0)
    assert isinstance(expected, RunResultV2)
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/runs",
        json={
            "scenario": payload,
            "root_seed": 47,
            "replication_index": 0,
        },
    )

    assert response.status_code == 200
    assert response.content == expected.model_dump_json().encode("utf-8")
    assert response.json()["contract_version"] == 2
    assert any(
        event["type"] == "preparation_paused"
        for event in response.json()["trace"]["events"]
    )


def test_api_run_route_defaults_a_versionless_legacy_scenario_to_v1() -> None:
    scenario = _legacy_payload()
    scenario.pop("contract_version")
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/runs",
        json={"scenario": scenario, "root_seed": 47, "replication_index": 0},
    )

    assert response.status_code == 200
    assert response.json()["contract_version"] == 1
    assert response.json()["scenario"]["contract_version"] == 1


def test_api_mixed_experiment_keeps_member_contract_versions() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/experiments",
        json={
            "scenarios": [_legacy_payload(), _scripted_payload()],
            "root_seed": 48,
            "replications": 2,
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["contract_version"] == 2
    assert result["status"] == "complete"
    member_versions = {
        item["scenario_id"]: item["metrics"]["contract_version"]
        for item in result["replication_results"]
    }
    assert member_versions == {
        "legacy-pause-reference": 1,
        "scripted-pause-demo": 2,
    }


def test_api_experiment_keeps_indexed_v2_script_failure_in_partial_result() -> None:
    legacy = _legacy_payload()
    legacy["scenario_id"] = "scripted-pause-legacy"
    legacy["initial_state"] = legacy["initial_state"][:1]
    legacy["interarrival"] = {"kind": "constant", "value_s": 1}
    scripted = _scripted_payload()
    scripted["initial_state"] = scripted["initial_state"][:1]
    scripted["interarrival"] = {"kind": "constant", "value_s": 1}
    scripted["engine_config"]["cashier_interruptions"][0]["cashier_order_id"] = (
        "r000000-o00000"
    )
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/experiments",
        json={"scenarios": [legacy, scripted], "root_seed": 51, "replications": 2},
    )

    assert response.status_code == 422
    error = response.json()
    partial = error["details"]["partial_result"]
    assert error["code"] == "experiment_failed"
    assert partial["contract_version"] == 2
    assert partial["n_requested"] == 2
    assert partial["n_valid"] == 1
    failed_candidate = next(
        item
        for item in partial["replication_results"]
        if item["scenario_id"] == scripted["scenario_id"] and item["status"] == "failed"
    )
    assert failed_candidate["replication_index"] == 1
    assert failed_candidate["issues"][0]["code"] == "unknown_order_id"


def test_saved_v2_run_reopens_and_exports_csv_on_existing_routes() -> None:
    scenario = ScenarioV2(**_scripted_payload())
    run = run_scenario(scenario, root_seed=49, replication_index=0)
    assert isinstance(run, RunResultV2)
    client = TestClient(create_app())

    reopened = client.post(
        "/api/v1/files/validate",
        files={"file": ("interruption-run.json", dump_run_json(run), "application/json")},
    )
    exported = client.post(
        "/api/v1/exports/csv",
        json={"result": run.model_dump(mode="json")},
    )

    assert reopened.status_code == 200
    assert reopened.json()["kind"] == "run"
    assert reopened.json()["value"] == json.loads(dump_run_json(run))
    assert exported.status_code == 200
    assert "preparation_active_s" in exported.json()["tables"]["orders.csv"].splitlines()[0]


def test_csv_request_does_not_infer_v2_from_nested_payloads() -> None:
    scenario = ScenarioV2(**_scripted_payload())
    run = run_scenario(scenario, root_seed=52, replication_index=0)
    payload = run.model_dump(mode="json")
    payload.pop("contract_version")
    client = TestClient(create_app())

    response = client.post("/api/v1/exports/csv", json={"result": payload})

    assert response.status_code == 422


def test_generated_v2_contract_fixtures_load_as_their_declared_versions() -> None:
    fixture_dir = Path(__file__).parents[1] / "web" / "contracts" / "fixtures"

    scenario = load_scenario_json((fixture_dir / "sample-scenario-v2.json").read_bytes())
    run = load_run_json((fixture_dir / "sample-run-v2.json").read_bytes())
    experiment = load_experiment_json(
        (fixture_dir / "sample-experiment-v2.json").read_bytes()
    )

    assert scenario.contract_version == 2
    assert isinstance(run, RunResultV2)
    assert experiment.contract_version == 2
    assert {member.contract_version for member in experiment.scenarios} == {1, 2}


def test_saved_v2_experiment_reopens_and_exports_csv() -> None:
    fixture_dir = Path(__file__).parents[1] / "web" / "contracts" / "fixtures"
    payload = (fixture_dir / "sample-experiment-v2.json").read_bytes()
    client = TestClient(create_app())

    reopened = client.post(
        "/api/v1/files/validate",
        files={"file": ("interruption-experiment.json", payload, "application/json")},
    )

    assert reopened.status_code == 200
    assert reopened.json()["kind"] == "experiment"
    assert reopened.json()["value"]["contract_version"] == 2
    exported = client.post(
        "/api/v1/exports/csv",
        json={"result": reopened.json()["value"]},
    )
    assert exported.status_code == 200
    assert "contract_version" in exported.json()["tables"]["replications.csv"].splitlines()[0]


def test_v2_run_response_still_uses_the_saved_result_size_guard(monkeypatch) -> None:
    monkeypatch.setattr(api, "MAX_SAVED_RESULT_BYTES", 1)
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/runs",
        json={
            "scenario": _scripted_payload(),
            "root_seed": 50,
            "replication_index": 0,
        },
    )

    assert response.status_code == 422
    assert response.json()["code"] == "result_too_large"
    assert response.json()["details"]["limit_bytes"] == 1


def test_malformed_supported_version_reports_a_contract_shape_issue() -> None:
    client = TestClient(create_app())
    response = client.post(
        "/api/v1/files/validate",
        files={
            "file": (
                "incomplete-v2.json",
                json.dumps({"contract_version": 2, "scenario_id": "future"}),
                "application/json",
            )
        },
    )

    assert response.status_code == 422
    assert any(
        issue["path"] == "contract_version"
        and issue["code"] == "contract_shape_mismatch"
        for issue in response.json()["issues"]
    )
    assert "contract_version 2" not in response.json()["issues"][0]["message"]
