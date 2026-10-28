import json
from pathlib import Path

from boquitas.demand import generate_demand
from boquitas.experiments import ExperimentResultV2, RunResultV2, run_experiment, run_scenario
from boquitas.scenarios import Scenario, ScenarioV2


def scenario_with_generated_order_script() -> ScenarioV2:
    payload = _scripted_demo_payload()
    payload["engine_config"]["horizon_s"] = 3
    payload["engine_config"]["cashier_interruptions"][0]["cashier_order_id"] = (
        "r000000-o00000"
    )
    payload["interarrival"] = {"kind": "constant", "value_s": 1}
    return ScenarioV2(**payload)


def _scripted_demo_payload() -> dict[str, object]:
    fixture = (
        Path(__file__).parents[1]
        / "openspec"
        / "changes"
        / "boquitas-07-preparation-interruptions"
        / "review"
        / "scripted-demo-input.json"
    )
    return json.loads(fixture.read_text(encoding="utf-8"))


def test_v2_demand_preflight_does_not_validate_script_against_an_empty_tape() -> None:
    scenario = scenario_with_generated_order_script()

    demand = generate_demand(scenario, root_seed=12, replication_index=0)

    assert [order.order_id for order in demand] == [
        "r000000-o00000",
        "r000000-o00001",
    ]


def test_selected_v2_run_preserves_the_legacy_result_version_and_tape() -> None:
    base_dir = (
        Path(__file__).parents[1]
        / "openspec"
        / "changes"
        / "boquitas-07-preparation-interruptions"
        / "review"
    )
    legacy = Scenario(
        **json.loads((base_dir / "scripted-demo-legacy-reference.json").read_text(encoding="utf-8"))
    )
    scripted = ScenarioV2(
        **json.loads((base_dir / "scripted-demo-input.json").read_text(encoding="utf-8"))
    )

    legacy_run = run_scenario(legacy, root_seed=27, replication_index=0)
    scripted_run = run_scenario(scripted, root_seed=27, replication_index=0)

    assert not isinstance(legacy_run, RunResultV2)
    assert isinstance(scripted_run, RunResultV2)
    assert legacy_run.contract_version == 1
    assert scripted_run.contract_version == 2
    assert legacy_run.demand_tape == scripted_run.demand_tape == ()
    assert {
        order.order_id: order.delivery_s for order in scripted_run.metrics.orders
    } == {"A": 14, "B": 17}
    assert legacy_run.scenario.contract_version == 1
    assert scripted_run.scenario.contract_version == 2


def test_mixed_experiment_keeps_member_versions_and_matches_stable_script_tape() -> None:
    base_dir = (
        Path(__file__).parents[1]
        / "openspec"
        / "changes"
        / "boquitas-07-preparation-interruptions"
        / "review"
    )
    legacy = Scenario(
        **json.loads((base_dir / "scripted-demo-legacy-reference.json").read_text(encoding="utf-8"))
    )
    scripted = ScenarioV2(
        **json.loads((base_dir / "scripted-demo-input.json").read_text(encoding="utf-8"))
    )

    result = run_experiment([legacy, scripted], root_seed=31, replications=2)

    assert isinstance(result, ExperimentResultV2)
    assert result.contract_version == 2
    assert result.status == "complete"
    assert result.n_valid == result.n_requested == 2
    versioned_members = {
        item.scenario_id: item.metrics.contract_version
        for item in result.replication_results
        if item.metrics is not None
    }
    assert versioned_members == {legacy.scenario_id: 1, scripted.scenario_id: 2}
    comparison = next(
        item
        for item in result.comparisons
        if item.reference_scenario_id == legacy.scenario_id
        and item.candidate_scenario_id == scripted.scenario_id
        and item.metric_id == "duration.preparation_elapsed.order.initialized"
    )
    assert comparison.demand_tapes_identical is True
    assert comparison.demand_matched is True


def test_generated_order_id_bound_script_failure_is_retained_by_replication() -> None:
    payload = _scripted_demo_payload()
    payload["initial_state"] = payload["initial_state"][:1]
    payload["interarrival"] = {"kind": "constant", "value_s": 1}
    payload["engine_config"]["cashier_interruptions"][0]["cashier_order_id"] = (
        "r000000-o00000"
    )
    scripted = ScenarioV2(**payload)

    legacy_payload = {
        **payload,
        "contract_version": 1,
        "scenario_id": "scripted-pause-legacy",
    }
    legacy_payload["engine_config"] = {
        "contract_version": 1,
        "mode": "regular",
        "opening_time": "15:00:00",
        "horizon_s": 20,
        "cashiers": 0,
        "preparers": 0,
        "integrated_workers": 1,
    }
    legacy = Scenario(**legacy_payload)

    result = run_experiment([legacy, scripted], root_seed=33, replications=2)

    assert isinstance(result, ExperimentResultV2)
    assert result.status == "failed"
    assert result.n_requested == 2
    assert result.n_valid == 1
    candidate_records = [
        item for item in result.replication_results if item.scenario_id == scripted.scenario_id
    ]
    assert [item.status for item in candidate_records] == ["complete", "failed"]
    assert candidate_records[1].replication_index == 1
    assert candidate_records[1].issues[0].code == "unknown_order_id"
