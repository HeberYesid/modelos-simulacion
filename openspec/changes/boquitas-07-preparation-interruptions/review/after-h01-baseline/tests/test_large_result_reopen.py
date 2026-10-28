from fastapi.testclient import TestClient

from boquitas.api import MAX_UPLOAD_BYTES, create_app
from boquitas.experiments import run_experiment
from boquitas.exports import dump_experiment_json
from boquitas.scenarios import Scenario, demo_scenario


def test_full_day_demo_comparison_above_observation_limit_reopens_exactly() -> None:
    reference = demo_scenario()
    candidate = Scenario(
        **{
            **reference.model_dump(),
            "scenario_id": "synthetic-demo-tuesday-preparers-2",
            "display_name": "Synthetic demonstration with two preparers",
            "engine_config": reference.engine_config.model_copy(update={"preparers": 2}),
        }
    )
    experiment = run_experiment(
        (reference, candidate),
        root_seed=20261020,
        replications=30,
    )
    saved_json = dump_experiment_json(experiment).encode("utf-8")
    assert experiment.status == "complete"
    assert len(saved_json) > MAX_UPLOAD_BYTES

    response = TestClient(create_app()).post(
        "/api/v1/files/validate",
        files={
            "file": (
                "full-day-demo-comparison.json",
                saved_json,
                "application/json",
            )
        },
    )

    assert response.status_code == 200, (
        f"saved JSON size={len(saved_json)} bytes; "
        f"HTTP {response.status_code}: {response.text}"
    )
    reopened = response.json()
    assert reopened["kind"] == "experiment"
    assert reopened["value"] == experiment.model_dump(mode="json")
