import json
from pathlib import Path

from fastapi.testclient import TestClient

from boquitas import api
from boquitas.api import MAX_SAVED_RESULT_BYTES, MAX_UPLOAD_BYTES, create_app
from boquitas.experiments import run_scenario
from boquitas.exports import (
    dump_run_json,
    dump_scenario_json,
    load_experiment_json,
    load_run_json,
    load_scenario_json,
)
from boquitas.observation_import import import_observations
from boquitas.scenarios import Scenario, demo_scenario


def test_health_uses_versioned_public_contract() -> None:
    client = TestClient(create_app())
    fixture = Path(__file__).parents[1] / "web" / "contracts" / "fixtures" / "health-response.json"

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == json.loads(fixture.read_text(encoding="utf-8"))


def test_demo_endpoint_returns_labeled_teaching_defaults() -> None:
    client = TestClient(create_app())

    response = client.get("/api/v1/demo")

    assert response.status_code == 200
    body = response.json()
    assert body["scenario"]["provenance"] == "synthetic_demo"
    assert body["root_seed"] == 20261020
    assert body["replications"] == 30


def test_zero_tuesday_preparers_returns_field_issue_without_result() -> None:
    scenario = demo_scenario().model_dump(mode="json")
    scenario["engine_config"]["preparers"] = 0
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/runs",
        json={"scenario": scenario, "root_seed": 7, "replication_index": 0},
    )

    assert response.status_code == 422
    body = response.json()
    fixture = (
        Path(__file__).parents[1]
        / "web"
        / "contracts"
        / "fixtures"
        / "invalid-staffing-422.json"
    )
    assert body == json.loads(fixture.read_text(encoding="utf-8"))
    assert body["code"] == "invalid_request"
    assert any("preparers" in issue["path"] for issue in body["issues"])
    assert "result" not in body
    assert "input" not in body


def test_run_request_rejects_any_server_path_field() -> None:
    scenario = demo_scenario().model_dump(mode="json")
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/runs",
        json={
            "scenario": scenario,
            "root_seed": 7,
            "replication_index": 0,
            "server_path": "C:/private/observations.csv",
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert any(issue["path"] == "server_path" for issue in body["issues"])
    assert "private/observations.csv" not in response.text


def test_run_response_matches_the_requested_replay_coordinates() -> None:
    base = demo_scenario()
    scenario = Scenario(
        **{
            **base.model_dump(),
            "engine_config": base.engine_config.model_copy(update={"horizon_s": 5}),
        }
    )
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/runs",
        json={
            "scenario": scenario.model_dump(mode="json"),
            "root_seed": 25,
            "replication_index": 4,
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["scenario"]["scenario_id"] == scenario.scenario_id
    assert result["root_seed"] == 25
    assert result["replication_index"] == 4


def test_unexpected_service_error_returns_safe_diagnostic_reference(monkeypatch) -> None:
    def raise_private_error(*args, **kwargs):
        raise RuntimeError("private uploaded row contents")

    monkeypatch.setattr(api, "run_scenario", raise_private_error)
    scenario = demo_scenario().model_dump(mode="json")
    scenario["engine_config"]["horizon_s"] = 5
    client = TestClient(create_app(), raise_server_exceptions=False)

    response = client.post(
        "/api/v1/runs",
        json={"scenario": scenario, "root_seed": 7, "replication_index": 0},
    )

    assert response.status_code == 500
    body = response.json()
    assert body["code"] == "internal_error"
    assert body["details"]["diagnostic_ref"]
    assert "private uploaded row contents" not in response.text
    assert "Traceback" not in response.text


def test_invalid_observation_upload_returns_fatal_import_report() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/observations/import",
        files={"file": ("observations.csv", b"\xff", "text/csv")},
        data={"correction_policy": "none"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "invalid_observations"
    assert body["details"]["report"]["fatal_error"] is True
    assert body["details"]["report"]["policy_status"] == "invalid"


def test_observation_upload_limit_uses_measured_file_bytes() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/observations/import",
        files={"file": ("large.csv", b"x" * (MAX_UPLOAD_BYTES + 1), "text/csv")},
        data={"correction_policy": "none"},
    )

    assert response.status_code == 413
    assert response.json()["code"] == "upload_too_large"


def test_failed_experiment_returns_partial_result_as_error_details() -> None:
    scenario = demo_scenario().model_dump(mode="json")
    scenario["engine_config"]["horizon_s"] = 1
    scenario["interarrival"] = {"kind": "exponential", "mean_s": 0.00005}
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/experiments",
        json={"scenarios": [scenario], "root_seed": 3, "replications": 1},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "experiment_failed"
    assert body["details"]["partial_result"]["status"] == "failed"
    assert body["details"]["partial_result"]["issues"][0]["code"] == (
        "workload_limit_exceeded"
    )


def test_complete_experiment_returns_the_upstream_result_contract() -> None:
    base = demo_scenario()
    scenario = Scenario(
        **{
            **base.model_dump(),
            "engine_config": base.engine_config.model_copy(update={"horizon_s": 5}),
        }
    )
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/experiments",
        json={
            "scenarios": [scenario.model_dump(mode="json")],
            "root_seed": 25,
            "replications": 1,
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "complete"
    assert result["n_requested"] == 1
    assert result["replication_results"][0]["scenario_id"] == scenario.scenario_id


def test_run_result_over_saved_json_cap_returns_actionable_error(monkeypatch) -> None:
    monkeypatch.setattr(api, "MAX_SAVED_RESULT_BYTES", 1, raising=False)
    base = demo_scenario()
    scenario = Scenario(
        **{
            **base.model_dump(),
            "engine_config": base.engine_config.model_copy(update={"horizon_s": 5}),
        }
    )

    response = TestClient(create_app()).post(
        "/api/v1/runs",
        json={
            "scenario": scenario.model_dump(mode="json"),
            "root_seed": 25,
            "replication_index": 0,
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "result_too_large"
    assert "horizonte" in body["message"].lower()
    assert "demanda" in body["message"].lower()


def test_experiment_result_over_saved_json_cap_returns_actionable_error(monkeypatch) -> None:
    monkeypatch.setattr(api, "MAX_SAVED_RESULT_BYTES", 1, raising=False)
    base = demo_scenario()
    scenario = Scenario(
        **{
            **base.model_dump(),
            "engine_config": base.engine_config.model_copy(update={"horizon_s": 5}),
        }
    )

    response = TestClient(create_app()).post(
        "/api/v1/experiments",
        json={
            "scenarios": [scenario.model_dump(mode="json")],
            "root_seed": 25,
            "replications": 1,
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "result_too_large"
    assert "horizonte" in body["message"].lower()
    assert "réplicas" in body["message"].lower()


def test_run_response_limit_is_inclusive_and_counts_utf8_bytes(monkeypatch) -> None:
    base = demo_scenario()
    scenario = Scenario(
        **{
            **base.model_dump(),
            "display_name": "Demostración café 🧁",
            "engine_config": base.engine_config.model_copy(update={"horizon_s": 5}),
        }
    )
    expected = (
        run_scenario(scenario, root_seed=25, replication_index=4)
        .model_dump_json()
        .encode("utf-8")
    )
    assert "café 🧁".encode() in expected

    monkeypatch.setattr(api, "MAX_SAVED_RESULT_BYTES", len(expected), raising=False)
    client = TestClient(create_app())
    request = {
        "scenario": scenario.model_dump(mode="json"),
        "root_seed": 25,
        "replication_index": 4,
    }
    accepted = client.post("/api/v1/runs", json=request)

    assert accepted.status_code == 200
    assert accepted.content == expected

    monkeypatch.setattr(api, "MAX_SAVED_RESULT_BYTES", len(expected) - 1)
    rejected = client.post("/api/v1/runs", json=request)
    assert rejected.status_code == 422
    assert rejected.json()["code"] == "result_too_large"


def test_incompatible_saved_json_is_rejected_without_running_it() -> None:
    client = TestClient(create_app())
    payload = json.dumps({"contract_version": 2, "scenario_id": "future"})

    response = client.post(
        "/api/v1/files/validate",
        files={"file": ("future-scenario.json", payload, "application/json")},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "invalid_saved_file"
    assert any(issue["path"] == "contract_version" for issue in body["issues"])
    assert "scenario" not in body
    assert "run" not in body
    assert "experiment" not in body


def test_saved_result_upload_is_capped_at_sixty_four_mib() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/files/validate",
        files={
            "file": (
                "large.json",
                b"x" * (MAX_SAVED_RESULT_BYTES + 1),
                "application/json",
            )
        },
    )

    assert response.status_code == 413
    assert response.json()["code"] == "saved_file_too_large"
    assert "64 MiB" in response.json()["message"]


def test_saved_run_json_is_reopened_with_its_original_trace() -> None:
    base = demo_scenario()
    scenario = Scenario(
        **{
            **base.model_dump(),
            "engine_config": base.engine_config.model_copy(update={"horizon_s": 5}),
        }
    )
    run = run_scenario(scenario, root_seed=19, replication_index=4)
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/files/validate",
        files={"file": ("saved-run.json", dump_run_json(run), "application/json")},
    )

    assert response.status_code == 200
    reopened = response.json()
    assert reopened["kind"] == "run"
    assert reopened["value"] == json.loads(dump_run_json(run))


def test_saved_scenario_json_is_validated_as_a_scenario() -> None:
    scenario = demo_scenario()
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/files/validate",
        files={
            "file": (
                "scenario.json",
                dump_scenario_json(scenario),
                "application/json",
            )
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "kind": "scenario",
        "value": json.loads(dump_scenario_json(scenario)),
    }


def test_csv_export_wraps_the_existing_result_tables() -> None:
    base = demo_scenario()
    scenario = Scenario(
        **{
            **base.model_dump(),
            "engine_config": base.engine_config.model_copy(update={"horizon_s": 5}),
        }
    )
    run = run_scenario(scenario, root_seed=5, replication_index=0)
    fixture = Path(__file__).parent / "fixtures" / "observation-import" / "corrected-reference.txt"
    report = import_observations(
        fixture.read_bytes(),
        source_name=fixture.name,
        correction_policy="boquitas-2026-10-20-v1",
    )
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/exports/csv",
        json={
            "result": run.model_dump(mode="json"),
            "observations": report.model_dump(mode="json"),
        },
    )

    assert response.status_code == 200
    tables = response.json()["tables"]
    assert {
        "orders.csv",
        "people.csv",
        "events.csv",
        "metrics.csv",
        "replications.csv",
        "comparisons.csv",
    } <= set(tables)
    assert "person_id" in tables["people.csv"].splitlines()[0]
    assert {
        "observation_rows.csv",
        "observation_issues.csv",
        "observation_summaries.csv",
        "observation_corrections.csv",
    } <= set(tables)


def test_contract_export_is_deterministic_and_matches_openapi() -> None:
    contract = Path(__file__).parents[1] / "web" / "contracts" / "openapi.json"

    assert json.loads(contract.read_text(encoding="utf-8")) == create_app().openapi()


def test_domain_contract_fixtures_use_real_versioned_result_models() -> None:
    fixture_dir = Path(__file__).parents[1] / "web" / "contracts" / "fixtures"

    scenario = load_scenario_json((fixture_dir / "demo-scenario.json").read_bytes())
    run = load_run_json((fixture_dir / "sample-run.json").read_bytes())
    experiment = load_experiment_json((fixture_dir / "sample-experiment.json").read_bytes())

    assert scenario.provenance == "synthetic_demo"
    assert run.contract_version == 1
    assert run.replication_index == 1
    assert experiment.contract_version == 1
    assert experiment.status == "complete"
    assert experiment.n_requested == 1


def test_observation_import_passes_explicit_correction_policy() -> None:
    fixture = Path(__file__).parent / "fixtures" / "observation-import" / "corrected-reference.txt"
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/observations/import",
        files={"file": (fixture.name, fixture.read_bytes(), "text/plain")},
        data={"correction_policy": "boquitas-2026-10-20-v1"},
    )

    assert response.status_code == 200
    report = response.json()
    assert report["correction_policy"] == "boquitas-2026-10-20-v1"
    assert report["policy_status"] == "already_reflected"
    assert len(report["normalized_rows"]) == 119


def test_static_app_fallback_never_captures_unknown_api_paths() -> None:
    frontend_dist = Path(__file__).parent / "fixtures" / "api-static"
    client = TestClient(create_app(frontend_dist=frontend_dist))

    root = client.get("/")
    missing_api = client.get("/api/v1/not-a-route")

    assert root.status_code == 200
    assert "local app" in root.text
    assert missing_api.status_code == 404
    assert missing_api.headers["content-type"].startswith("application/json")
