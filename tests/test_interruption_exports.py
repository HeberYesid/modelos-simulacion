import csv
import io
import json
from pathlib import Path

import pytest

from boquitas.experiments import ExperimentResultV2, run_experiment, run_scenario
from boquitas.exports import (
    dump_experiment_json,
    dump_run_json,
    dump_scenario_json,
    export_csv_tables,
    load_experiment_json,
    load_run_json,
    load_scenario_json,
)
from boquitas.scenarios import Scenario, ScenarioV2


def _review_dir() -> Path:
    return (
        Path(__file__).parents[1]
        / "openspec"
        / "changes"
        / "boquitas-07-preparation-interruptions"
        / "review"
    )


def _legacy_scenario() -> Scenario:
    payload = json.loads((_review_dir() / "scripted-demo-legacy-reference.json").read_text())
    return Scenario(**payload)


def _scripted_scenario() -> ScenarioV2:
    payload = json.loads((_review_dir() / "scripted-demo-input.json").read_text())
    return ScenarioV2(**payload)


def _dict_rows(table: str) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(table)))


def test_versioned_json_loaders_round_trip_v2_and_keep_legacy_missing_version_default() -> None:
    legacy = _legacy_scenario()
    scripted = _scripted_scenario()
    legacy_run = run_scenario(legacy, root_seed=41, replication_index=0)
    scripted_run = run_scenario(scripted, root_seed=41, replication_index=0)
    legacy_experiment = run_experiment([legacy], root_seed=41, replications=2)
    experiment = run_experiment([legacy, scripted], root_seed=41, replications=2)

    legacy_without_version = json.loads(dump_scenario_json(legacy))
    legacy_without_version.pop("contract_version")
    legacy_run_without_version = json.loads(dump_run_json(legacy_run))
    legacy_run_without_version.pop("contract_version")
    legacy_experiment_without_version = json.loads(
        dump_experiment_json(legacy_experiment)
    )
    legacy_experiment_without_version.pop("contract_version")

    assert load_scenario_json(json.dumps(legacy_without_version)) == legacy
    assert load_run_json(json.dumps(legacy_run_without_version)) == legacy_run
    assert load_experiment_json(json.dumps(legacy_experiment_without_version)) == (
        legacy_experiment
    )
    assert load_scenario_json(dump_scenario_json(scripted)) == scripted
    assert load_run_json(dump_run_json(scripted_run)) == scripted_run
    assert isinstance(experiment, ExperimentResultV2)
    assert load_experiment_json(dump_experiment_json(experiment)) == experiment
    assert scripted_run.trace.events == load_run_json(dump_run_json(scripted_run)).trace.events
    assert scripted_run.demand_tape == load_run_json(dump_run_json(scripted_run)).demand_tape
    assert legacy_run.contract_version == 1

    scripted_run_without_version = json.loads(dump_run_json(scripted_run))
    scripted_run_without_version.pop("contract_version")
    with pytest.raises(ValueError):
        load_run_json(json.dumps(scripted_run_without_version))


def test_v2_run_csv_exports_pause_metrics_events_and_script_provenance() -> None:
    scripted = _scripted_scenario()
    run = run_scenario(scripted, root_seed=42, replication_index=0)

    tables = export_csv_tables(run)
    order_headers = set(next(csv.reader(io.StringIO(tables["orders.csv"]))))
    assert {
        "preparation_active_s",
        "preparation_paused_s",
        "preparation_pause_count",
    } <= order_headers
    orders = _dict_rows(tables["orders.csv"])
    order_a = next(row for row in orders if row["order_id"] == "A")
    assert order_a["preparation_active_s"] == "10.0"
    assert order_a["preparation_paused_s"] == "2.0"
    assert order_a["preparation_pause_count"] == "1"

    events = _dict_rows(tables["events.csv"])
    pause = next(row for row in events if row["event_type"] == "preparation_paused")
    pause_data = json.loads(pause["event_data_json"])
    assert pause_data["related_cashier_order_id"] == "B"
    assert pause_data["remaining_s"] == 7
    assert {row["event_type"] for row in events} >= {
        "preparation_paused",
        "preparation_resumed",
    }

    replication = _dict_rows(tables["replications.csv"])[0]
    assert replication["contract_version"] == "2"
    assert replication["preparation_interruption_policy"] == "scripted_cashier"
    assert json.loads(replication["cashier_interruptions_json"]) == [
        {"at_s": 5.0, "suspended_order_id": "A", "cashier_order_id": "B"}
    ]


def test_mixed_experiment_csv_keeps_member_versions_and_failed_indices() -> None:
    legacy = _legacy_scenario()
    payload = json.loads((_review_dir() / "scripted-demo-input.json").read_text())
    payload["initial_state"] = payload["initial_state"][:1]
    payload["interarrival"] = {"kind": "constant", "value_s": 1}
    payload["engine_config"]["cashier_interruptions"][0]["cashier_order_id"] = (
        "r000000-o00000"
    )
    scripted = ScenarioV2(**payload)

    result = run_experiment([legacy, scripted], root_seed=43, replications=2)

    assert isinstance(result, ExperimentResultV2)
    tables = export_csv_tables(result)
    rows = _dict_rows(tables["replications.csv"])
    candidate = [row for row in rows if row["scenario_id"] == scripted.scenario_id]
    assert [(row["replication_index"], row["status"]) for row in candidate] == [
        ("0", "complete"),
        ("1", "failed"),
    ]
    legacy_versions = [
        row["contract_version"] for row in rows if row["scenario_id"] == legacy.scenario_id
    ]
    assert legacy_versions == ["1", "1"]
    assert all(
        row["preparation_interruption_policy"] == "scripted_cashier"
        for row in candidate
    )
    assert json.loads(candidate[1]["issues_json"])[0]["replication_index"] == 1
