# Spec07 Block 1 — versioned contracts

Date: 2026-10-24  
Scope: additive V2 public contracts only. No OpenSpec task checkboxes were changed.

## Files

- `src/boquitas/models.py`: `CashierInterruption`, `EngineConfigV2`, `EngineConfigVersion`, `EventDataV2`, `SimulationEventV2`, `SimulationTraceV2`, and `SimulationTraceVersion`.
- `src/boquitas/scenarios.py`: `ScenarioV2` and `ScenarioVersion`.
- `src/boquitas/metrics_models.py`: `OrderMetricV2`, `PersonMetricV2`, `RunMetricsV2`, and `RunMetricsVersion`.
- `src/boquitas/experiments.py`: `RunResultV2`, `ReplicationResultV2`, `ExperimentResultV2`, `RunResultVersion`, and `ExperimentResultVersion`.
- `src/boquitas/__init__.py`: public exports for the V2 classes and aliases.
- `tests/test_interruption_contracts.py`: new public-contract tests; existing test files were not edited.

## Contract behavior covered

- V2 configuration is limited to regular mode, one integrated worker, no cashier/preparer pools, and the explicit `scripted_cashier` policy. The immutable script defaults to empty. Times reject booleans, negative and nonfinite values; entries require distinct nonempty IDs and strictly increasing times.
- Pause/resume V2 events require a suspended order, worker, related cashier order, positive finite remaining work, and an explicit resulting assignment/reservation/activity state. V1 events remain unable to accept pause/resume types.
- `ScenarioV2` validates only legacy-compatible initial state through a V1 preflight configuration. It does not run future script IDs against an empty demand tape. Generated-tape reference validation remains for the engine block.
- V2 metrics expose active preparation, paused preparation, pause count, and existing elapsed time without widening `OrderMetric` or `PersonMetric`. Shared V1 `QueueInterval` and terminal `WorkerState` contracts are reused.
- V2 run payloads require V2 scenarios, traces, and metrics. The V2 experiment envelope accepts V1 and V2 scenario/metric members and rejects a member metric whose version disagrees with its scenario.
- New tests verify the full V1 `EngineConfig` default dump, field lists for `EventData`, `SimulationEvent`, and `SimulationTrace`, and absence of interruption fields from V1 `OrderMetric`. V1 events remain unable to accept pause/resume types.

## TDD evidence

Observed focused RED/GREEN cycles during implementation:

- The public configuration name was initially absent; the focused contract test failed. The V2 configuration and export were added, then the focused test passed. The test was strengthened afterward to exercise V2 defaults and policy.
- `CashierInterruption` initially accepted the same ID for both roles (`DID NOT RAISE`). A distinct-ID validator was added; the focused suite then passed.
- The pause-event test initially failed because `EventDataV2` did not exist. The V2 event/data/trace models were added; the focused test passed.
- The future-tape scenario test initially failed because `ScenarioV2` did not exist. The V2 scenario and empty-tape-safe initial-state preflight were added; the focused test passed.
- The metric test initially failed because `OrderMetricV2` did not exist. V2 order/person/run metric contracts were added; the focused test passed.
- The selected-run test initially failed because `RunResultV2` did not exist. Versioned run and experiment contracts were added; the focused run test passed.
- An incomplete pause event initially passed construction. Event state validation was added; the focused test passed.
- Nonfinite pause remainder and negative active preparation initially passed construction (two failures). Finite/nonnegative V2 field constraints were added; both focused tests passed.

The mixed-experiment and nested-version mismatch cases are covered by final acceptance tests. Their validator was present before those tests were executed; no separate RED result is claimed for those cases.

### Independent review correction

The main agent added `tests/test_interruption_review.py` and observed **4 RED failures**: three boolean capacities (`integrated_workers=True`, `cashiers=False`, `preparers=False`) and `OrderMetricV2.preparation_pause_count=True` were accepted. The V2 capacity fields now reject booleans in a `mode="before"` validator; V2 order and person pause counts now use strict integer validation. V1 classes and the main-owned regression file were not edited.

Post-fix GREEN evidence:

- `uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_interruption_review.py -q` — **4 passed**.
- `uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_interruption_contracts.py -q` — **28 passed**.
- `uv --cache-dir .uv-cache run --frozen --offline ruff check src/boquitas/models.py src/boquitas/metrics_models.py tests/test_interruption_review.py tests/test_interruption_contracts.py` — **passed**.
- `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas` — **passed**, 14 source files.

## Verification

- `uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_interruption_contracts.py -q` — **28 passed**.
- `uv --cache-dir .uv-cache run --frozen --offline ruff check src/boquitas/__init__.py src/boquitas/models.py src/boquitas/scenarios.py src/boquitas/metrics_models.py src/boquitas/experiments.py tests/test_interruption_contracts.py` — **passed**.
- `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas` — **passed**, 14 source files.
- A full `ruff check .` returned exit code 0 and “All checks passed”, with an environment warning that traversal of a temporary path was denied. The changed-file Ruff check above completed without that warning.

## Not implemented or independently checked in this block

No engine execution, remaining-work/resume-obligation state, generated-tape identity or admission-at-H validation, metrics calculation, experiment runner, JSON/CSV dispatch, API schema, frontend, or replay behavior was added. Those boundaries remain for later blocks. This report does not claim Spec07 tasks 1.2–1.4 are fully complete. The pre-change scientific fixture hash and baseline were supplied by the main agent; no post-change reference-byte hash was run here and remains for independent review.
