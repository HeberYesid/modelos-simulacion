"""Export or check the deterministic FastAPI OpenAPI contract for the web app."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from boquitas.api import create_app
from boquitas.experiments import run_experiment, run_scenario
from boquitas.exports import dump_experiment_json, dump_run_json, dump_scenario_json
from boquitas.scenarios import Scenario, demo_scenario

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = PROJECT_ROOT / "web" / "contracts" / "openapi.json"
FIXTURE_DIR = PROJECT_ROOT / "web" / "contracts" / "fixtures"


def render_contract() -> str:
    """Return the current OpenAPI document in stable UTF-8 JSON form."""

    return json.dumps(
        create_app().openapi(),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ) + "\n"


def render_fixtures() -> dict[Path, str]:
    """Return small valid examples produced by the canonical domain API."""

    demo = demo_scenario()
    short_demo = Scenario(
        **{
            **demo.model_dump(),
            "scenario_id": "synthetic-demo-api-fixture",
            "display_name": "Synthetic API contract fixture",
            "engine_config": demo.engine_config.model_copy(update={"horizon_s": 5}),
        }
    )
    run = run_scenario(short_demo, root_seed=20261020, replication_index=1)
    experiment = run_experiment([short_demo], root_seed=20261020, replications=1)
    return {
        FIXTURE_DIR / "demo-scenario.json": dump_scenario_json(demo) + "\n",
        FIXTURE_DIR / "sample-run.json": _compact_json(dump_run_json(run)),
        FIXTURE_DIR / "sample-experiment.json": _compact_json(dump_experiment_json(experiment)),
    }


def _compact_json(payload: str) -> str:
    return json.dumps(
        json.loads(payload),
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ) + "\n"


def documents_to_sync() -> dict[Path, str]:
    return {CONTRACT_PATH: render_contract(), **render_fixtures()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail when the committed contract differs from the current API schema.",
    )
    arguments = parser.parse_args()
    documents = documents_to_sync()
    if arguments.check:
        stale = [
            path
            for path, generated in documents.items()
            if not path.is_file() or path.read_text(encoding="utf-8") != generated
        ]
        if stale:
            for path in stale:
                print(f"Stale or missing API contract fixture: {path}")
            print("Run `uv run python scripts/export_web_contracts.py` to refresh them.")
            return 1
        print(f"API schema and domain fixtures match: {len(documents)} files")
        return 0

    for path, generated in documents.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(generated, encoding="utf-8", newline="\n")
        print(f"Wrote API contract fixture: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
