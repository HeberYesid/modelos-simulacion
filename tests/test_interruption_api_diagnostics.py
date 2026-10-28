"""Public API diagnostics for invalid scripted version-2 scenarios."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from boquitas import CashierInterruption, EngineConfigV2, demo_scenario
from boquitas.api import create_app

_CASES = {
    "negative_time": "cashier_interruptions[0].at_s",
    "duplicate_time": "cashier_interruptions[1].at_s",
    "blank_cashier_id": "cashier_interruptions[0].cashier_order_id",
    "same_id": "cashier_interruptions[0]",
    "mode": "mode",
    "capacity": "integrated_workers",
}
_ENDPOINTS = {
    "run": "scenario.",
    "experiment": "scenarios[1].",
    "saved_scenario": "",
}


def _valid_v2_scenario() -> dict[str, object]:
    scenario = demo_scenario().model_dump(mode="json")
    scenario["contract_version"] = 2
    scenario["engine_config"] = EngineConfigV2(
        horizon_s=20,
        cashier_interruptions=(
            CashierInterruption(
                at_s=5,
                suspended_order_id="A",
                cashier_order_id="B",
            ),
        ),
    ).model_dump(mode="json")
    return scenario


def _invalid_scenario(case: str) -> dict[str, object]:
    scenario = _valid_v2_scenario()
    config = scenario["engine_config"]
    assert isinstance(config, dict)
    interruptions = config["cashier_interruptions"]
    assert isinstance(interruptions, list)

    if case == "negative_time":
        interruptions[0]["at_s"] = -987654321.0
    elif case == "duplicate_time":
        interruptions.append(dict(interruptions[0]))
    elif case == "blank_cashier_id":
        interruptions[0]["cashier_order_id"] = "   "
    elif case == "same_id":
        interruptions[0]["suspended_order_id"] = "UNSAFE-ORDER-ID"
        interruptions[0]["cashier_order_id"] = "UNSAFE-ORDER-ID"
    elif case == "mode":
        config["mode"] = "tuesday"
    else:
        config["integrated_workers"] = 2

    return scenario


@pytest.mark.parametrize("endpoint", _ENDPOINTS)
@pytest.mark.parametrize("case", _CASES)
def test_static_v2_validation_reports_field_paths_at_each_api_boundary(
    endpoint: str,
    case: str,
) -> None:
    scenario = _invalid_scenario(case)
    prefix = _ENDPOINTS[endpoint]
    expected_path = f"{prefix}engine_config.{_CASES[case]}"
    client = TestClient(create_app())

    if endpoint == "run":
        response = client.post(
            "/api/v1/runs",
            json={
                "scenario": scenario,
                "root_seed": 20261020,
                "replication_index": 0,
            },
        )
    elif endpoint == "experiment":
        response = client.post(
            "/api/v1/experiments",
            json={
                "scenarios": [demo_scenario().model_dump(mode="json"), scenario],
                "root_seed": 20261020,
                "replications": 2,
            },
        )
    else:
        response = client.post(
            "/api/v1/files/validate",
            files={
                "file": (
                    "invalid-scenario.json",
                    json.dumps(scenario).encode("utf-8"),
                    "application/json",
                )
            },
        )

    assert response.status_code == 422
    assert any(issue["path"] == expected_path for issue in response.json()["issues"]), response.text
    if case == "negative_time":
        assert "-987654321.0" not in response.text
    elif case == "same_id":
        assert "UNSAFE-ORDER-ID" not in response.text
    elif case == "capacity":
        assert any(
            issue["message"]
            == "La configuración V2 requiere exactamente 1 trabajador integrado "
            "y 0 cajeros y preparadores separados."
            for issue in response.json()["issues"]
        )


@pytest.mark.parametrize(
    ("artifact", "scenario_path", "expected_path"),
    (
        (
            "sample-run-v2.json",
            ("scenario",),
            "scenario.engine_config.cashier_interruptions[0].cashier_order_id",
        ),
        (
            "sample-experiment-v2.json",
            ("scenarios", 1),
            "scenarios[1].engine_config.cashier_interruptions[0].cashier_order_id",
        ),
    ),
)
def test_saved_v2_results_report_nested_indexed_script_field_paths(
    artifact: str,
    scenario_path: tuple[str | int, ...],
    expected_path: str,
) -> None:
    fixture_dir = Path(__file__).parents[1] / "web" / "contracts" / "fixtures"
    payload = json.loads((fixture_dir / artifact).read_text(encoding="utf-8"))
    scenario: object = payload
    for part in scenario_path:
        assert isinstance(scenario, (dict, list))
        scenario = scenario[part]
    assert isinstance(scenario, dict)
    engine_config = scenario["engine_config"]
    assert isinstance(engine_config, dict)
    interruptions = engine_config["cashier_interruptions"]
    assert isinstance(interruptions, list)
    interruptions[0]["cashier_order_id"] = "   "

    response = TestClient(create_app()).post(
        "/api/v1/files/validate",
        files={
            "file": (
                artifact,
                json.dumps(payload).encode("utf-8"),
                "application/json",
            )
        },
    )

    assert response.status_code == 422
    assert any(
        issue["path"] == expected_path for issue in response.json()["issues"]
    ), response.text


def test_saved_mixed_v2_experiment_keeps_legacy_member_diagnostic() -> None:
    fixture_dir = Path(__file__).parents[1] / "web" / "contracts" / "fixtures"
    payload = json.loads(
        (fixture_dir / "sample-experiment-v2.json").read_text(encoding="utf-8")
    )
    legacy_scenario = payload["scenarios"][0]
    assert legacy_scenario["contract_version"] == 1
    legacy_scenario["engine_config"]["mode"] = "unsupported-mode"

    response = TestClient(create_app()).post(
        "/api/v1/files/validate",
        files={
            "file": (
                "invalid-mixed-experiment.json",
                json.dumps(payload).encode("utf-8"),
                "application/json",
            )
        },
    )

    assert response.status_code == 422
    assert response.json()["issues"] == [
        {
            "path": "scenarios[0].engine_config.mode",
            "code": "literal_error",
            "message": "El valor no pertenece a las opciones permitidas.",
        }
    ]


def test_saved_v2_run_rejects_inconsistent_trace_version() -> None:
    fixture_dir = Path(__file__).parents[1] / "web" / "contracts" / "fixtures"
    payload = json.loads(
        (fixture_dir / "sample-run-v2.json").read_text(encoding="utf-8")
    )
    payload["trace"]["contract_version"] = 1

    response = TestClient(create_app()).post(
        "/api/v1/files/validate",
        files={
            "file": (
                "inconsistent-run.json",
                json.dumps(payload).encode("utf-8"),
                "application/json",
            )
        },
    )

    assert response.status_code == 422
    assert any(
        issue["path"] == "trace.contract_version"
        for issue in response.json()["issues"]
    )


def test_saved_file_rejects_an_unsupported_contract_version() -> None:
    client = TestClient(create_app())
    response = client.post(
        "/api/v1/files/validate",
        files={
            "file": (
                "unsupported-version.json",
                json.dumps({"contract_version": 3}).encode("utf-8"),
                "application/json",
            )
        },
    )

    assert response.status_code == 422
    assert response.json()["issues"] == [
        {
            "path": "contract_version",
            "code": "unsupported_version",
            "message": "Abra un archivo con contract_version 1 o 2.",
        }
    ]


def test_run_endpoint_rejects_infeasible_script_with_indexed_diagnostic() -> None:
    scenario = _valid_v2_scenario()
    config = scenario["engine_config"]
    assert isinstance(config, dict)
    interruptions = config["cashier_interruptions"]
    assert isinstance(interruptions, list)
    interruptions[0]["cashier_order_id"] = "not-in-demand"

    response = TestClient(create_app()).post(
        "/api/v1/runs",
        json={"scenario": scenario, "root_seed": 20261020, "replication_index": 0},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_request"
    assert any(
        issue["code"] == "unknown_order_id"
        and issue["path"] == "config.cashier_interruptions[0].cashier_order_id"
        for issue in response.json()["issues"]
    )
    assert "partial_result" not in response.json()["details"]
