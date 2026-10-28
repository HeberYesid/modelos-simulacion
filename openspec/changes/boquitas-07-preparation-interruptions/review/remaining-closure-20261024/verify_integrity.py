"""Repeat the preserved-source and legacy scientific-artifact checks."""

import json
from hashlib import sha256
from pathlib import Path

from boquitas import demo_scenario, run_scenario
from boquitas.exports import dump_run_json, load_run_json

ROOT = Path.cwd()
REVIEW = ROOT / "openspec/changes/boquitas-07-preparation-interruptions/review"
OUTPUT = REVIEW / "remaining-closure-20261024"

protected = json.loads(
    (ROOT / "docs/audit-remediation-2026-10-24/preserved-sources.json").read_text(
        encoding="utf-8-sig"
    )
)["protected_sources"]
source_matches = {
    name: sha256(Path(name).read_bytes()).hexdigest() == expected
    for name, expected in protected.items()
}
assert all(source_matches.values()), source_matches

baseline = json.loads((OUTPUT / "baseline-hashes.json").read_text(encoding="utf-8-sig"))
changed = [
    item["path"]
    for item in baseline
    if "__pycache__" not in item["path"]
    and sha256((ROOT / item["path"]).read_bytes()).hexdigest().lower()
    != item["sha256"].lower()
]
changed_tests = [name for name in changed if name.startswith(("tests\\", "web\\tests\\"))]
assert changed_tests == ["tests\\test_interruption_api_diagnostics.py"], changed_tests

original_baseline = json.loads(
    (REVIEW / "implementation-baseline.json").read_text(encoding="utf-8-sig")
)["existing_files"]
engine_test = "tests/test_simulation_engine.py"
assert sha256((ROOT / engine_test).read_bytes()).hexdigest() == original_baseline[engine_test]

references = {
    "tuesday": ROOT
    / "openspec/changes/boquitas-06-validation-and-delivery/reference-demo-run.json",
    "regular": REVIEW / "legacy-regular-before.json",
}
scientific = {}
for name, path in references.items():
    original = path.read_bytes()
    if name == "tuesday":
        generated = dump_run_json(
            run_scenario(demo_scenario(), root_seed=20261020, replication_index=0)
        ).encode("utf-8")
    else:
        saved = load_run_json(original.decode("utf-8"))
        generated = dump_run_json(
            run_scenario(
                saved.scenario,
                root_seed=saved.root_seed,
                replication_index=saved.replication_index,
            )
        ).encode("utf-8")
    assert generated == original, name
    scientific[name] = {"bytes": len(original), "sha256": sha256(original).hexdigest()}

result = {
    "protected_sources_unchanged": source_matches,
    "legacy_scientific_byte_identical": scientific,
    "original_engine_test_unchanged": True,
    "changed_since_turn_baseline": changed,
    "changed_test_files": changed_tests,
}
(OUTPUT / "final-integrity.json").write_text(
    json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
)
print(json.dumps(result, indent=2, ensure_ascii=False))
