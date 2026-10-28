import csv
import io
import json
from pathlib import Path

import pytest

from boquitas.experiments import run_experiment, run_scenario
from boquitas.exports import (
    dump_experiment_json,
    dump_run_json,
    dump_scenario_json,
    export_csv_tables,
    load_experiment_json,
    load_run_json,
    load_scenario_json,
    write_csv_tables,
)
from boquitas.models import EngineConfig
from boquitas.observation_import import import_observations
from boquitas.scenarios import ConstantTime, GroupWeight, Scenario, demo_scenario


def deterministic_scenario(
    *,
    scenario_id: str = "reference",
    cashiers: int = 1,
) -> Scenario:
    base = demo_scenario().model_dump()
    base.update(
        {
            "scenario_id": scenario_id,
            "display_name": scenario_id,
            "engine_config": EngineConfig(
                mode="tuesday",
                horizon_s=12,
                cashiers=cashiers,
                preparers=1,
            ),
            "interarrival": ConstantTime(value_s=1),
            "group_sizes": (GroupWeight(size=1, probability=1),),
            "payment_active": ConstantTime(value_s=2),
            "preparation": ConstantTime(value_s=1),
            "transfer_probability": 0,
            "transfer_confirmation": ConstantTime(value_s=0),
            "default_root_seed": 123,
        }
    )
    return Scenario(**base)


def test_scenario_run_and_experiment_json_round_trip_without_regeneration() -> None:
    scenario = deterministic_scenario()
    run = run_scenario(scenario, replication_index=2)
    experiment = run_experiment([scenario], root_seed=123, replications=2)

    assert load_scenario_json(dump_scenario_json(scenario)) == scenario
    assert load_run_json(dump_run_json(run)) == run
    assert load_experiment_json(dump_experiment_json(experiment)) == experiment


def test_unknown_contract_version_is_rejected_on_json_load() -> None:
    scenario = deterministic_scenario()
    payload = json.loads(dump_scenario_json(scenario))
    payload["contract_version"] = 2

    with pytest.raises(ValueError):
        load_scenario_json(json.dumps(payload))

    run = run_scenario(scenario, replication_index=0)
    run_payload = json.loads(dump_run_json(run))
    run_payload["scenario"]["contract_version"] = 2
    with pytest.raises(ValueError):
        load_run_json(json.dumps(run_payload))


def test_csv_tables_are_rectangular_escape_text_and_keep_negative_numbers() -> None:
    base = deterministic_scenario()
    scenario = Scenario(
        **{
            **base.model_dump(),
            "display_name": "=Cúcuta + demo",
            "engine_config": EngineConfig(horizon_s=12, cashiers=1, preparers=1),
        }
    )
    run = run_scenario(scenario, root_seed=123)
    candidate_base = deterministic_scenario(scenario_id="candidate", cashiers=2)
    candidate = Scenario(
        **{
            **candidate_base.model_dump(),
            "engine_config": EngineConfig(horizon_s=12, cashiers=2, preparers=1),
        }
    )
    experiment = run_experiment([scenario, candidate], root_seed=123, replications=2)

    run_tables = export_csv_tables(run)
    for table in run_tables.values():
        rows = list(csv.reader(io.StringIO(table)))
        assert rows
        assert all(len(row) == len(rows[0]) for row in rows)
    assert "person_id" in next(csv.reader(io.StringIO(run_tables["people.csv"])))
    for table_name in ("orders.csv", "people.csv", "events.csv"):
        header = next(csv.reader(io.StringIO(run_tables[table_name])))
        assert {"scenario_id", "root_seed", "replication_index"} <= set(header)
    replication_row = next(
        csv.DictReader(io.StringIO(run_tables["replications.csv"]))
    )
    assert replication_row["scenario_display_name"] == "'=Cúcuta + demo"
    assert replication_row["scenario_provenance"] == "synthetic_demo"
    for table_name in ("orders.csv", "people.csv", "events.csv", "metrics.csv"):
        row = next(csv.DictReader(io.StringIO(run_tables[table_name])))
        assert row["scenario_provenance"] == "synthetic_demo"
    assert scenario.display_name == "=Cúcuta + demo"
    assert load_scenario_json(dump_scenario_json(scenario)).display_name == "=Cúcuta + demo"

    experiment_tables = export_csv_tables(experiment)
    comparison_row = next(
        row
        for row in csv.DictReader(io.StringIO(experiment_tables["comparisons.csv"]))
        if row["metric_id"] == "queue.payment.mean.orders"
    )
    assert float(comparison_row["difference_mean"]) < 0
    assert not comparison_row["difference_mean"].startswith("'")
    assert comparison_row["root_seed"] == "123"
    assert comparison_row["interpretation"] == (
        "Student-t intervals describe Monte Carlo variability conditional on the chosen inputs; "
        "they exclude uncertainty about actual Boquitas parameters."
    )
    metrics = list(csv.DictReader(io.StringIO(experiment_tables["metrics.csv"])))
    resource_total = next(
        row
        for row in metrics
        if row["record_type"] == "aggregate"
        and row["metric_id"] == "resource.cashier.total.active_fraction"
    )
    assert resource_total["root_seed"] == "123"
    assert resource_total["n_requested"] == "2"
    assert resource_total["denominator"] == "12.0"
    assert resource_total["interpretation"] == comparison_row["interpretation"]


def test_csv_blanks_unavailable_values_and_exports_observations() -> None:
    scenario = deterministic_scenario()
    no_arrival = Scenario(
        **{
            **scenario.model_dump(),
            "engine_config": EngineConfig(horizon_s=0.5, cashiers=1, preparers=1),
        }
    )
    run = run_scenario(no_arrival)
    fixture = Path(__file__).parent / "fixtures" / "observation-import" / "original.txt"
    report = import_observations(fixture.read_bytes(), source_name="observations.txt")

    tables = export_csv_tables(run, observations=report)
    rows = list(csv.DictReader(io.StringIO(tables["metrics.csv"])))
    unavailable = next(row for row in rows if row["value"] == "" and row["reason"])
    assert unavailable["reason"]
    assert {
        "observation_rows.csv",
        "observation_issues.csv",
        "observation_summaries.csv",
        "observation_corrections.csv",
    } <= set(tables)
    observation_row = next(csv.DictReader(io.StringIO(tables["observation_rows.csv"])))
    assert observation_row["source_sha256"] == report.source_sha256


def test_csv_writer_creates_utf8_individual_tables(tmp_path: Path) -> None:
    scenario = deterministic_scenario()
    paths = write_csv_tables(tmp_path, run_scenario(scenario))

    assert set(paths) == {
        "orders.csv",
        "people.csv",
        "events.csv",
        "metrics.csv",
        "replications.csv",
        "comparisons.csv",
    }
    assert all(path.is_file() for path in paths.values())
    assert "scenario_display_name" in paths["replications.csv"].read_text(encoding="utf-8")


