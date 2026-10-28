# Block 1 independent acceptance: additive versioned contracts

Date: 2026-10-24. Implementer: GPT-6 Luna (max). Reviewer: main agent. Accepted scope: distinct V2 contract types and aliases; no interruption execution is claimed by this block.

## Direct review and observed checks

- Read the added config/script, event/data/trace, scenario, metric, run and mixed-experiment models directly and reviewed their validation and compatibility boundaries. `ScenarioV2` deliberately validates legacy-compatible initial state without executing future tape-bound script IDs.
- Independently ran `pytest tests/test_interruption_contracts.py tests/test_interruption_review.py -q`: **32 passed**. Focused Ruff and mypy passed; mypy checked 14 source files.
- Independent probing found that new V2 capacity Literals accepted boolean values and new pause counters coerced booleans. Added four public-boundary regressions; observed **4 failures, DID NOT RAISE** before correction. Luna added V2-only pre-validation and strict counter fields; the same four tests passed, and the combined 32-test run passed. V1 validators/configuration were not changed for this correction.
- Compared 10 V1 OpenAPI schema components against the preserved existing contract: EngineConfig, Scenario, SimulationTrace, EventData, SimulationEvent, RunMetrics, OrderMetric, PersonMetric, RunResult and ExperimentResult are identical.
- Reproduced the existing Tuesday scientific run and the newly captured regular-mode reference byte for byte. SHA-256 values remain `8bbe6b117f59dde367816d8ed63bb013b0ad624d916a57159c084fcff4051dd7` and `d0093084b4e99e59000725ae99c8cab2603bb3f7a666c986f731b06b5c157e69`.
- Verified 152 protected existing test/fixture/source/lock/evidence files against the implementation baseline. No original test file/assertion, observation importer, correction profile, scientific fixture or lockfile changed in this block.

Luna's [implementation report](block1-luna.md) distinguishes its actual observed RED/GREEN cycles from cases added as acceptance coverage after validators existed; no retroactive RED is claimed. The review's four numeric-type regressions have independently observed failure and success evidence.

## Whole-suite result and concurrent work

The independent whole-suite run collected 169 tests and returned **168 passed, 1 failed**. The failure is the concurrently introduced `test_full_day_demo_comparison_above_observation_limit_reopens_exactly` in `tests/test_large_result_reopen.py`: its 22959355-byte V1 result is rejected by the existing 10 MiB saved-file limit. This test was absent from our 131-test baseline and belongs to the user-authorized H01 repair in the chat “Analiza pendientes del proyecto”; its other five empirical-kit tests passed. All 131 original tests and our 32 contract/review tests passed. The failing test was preserved, not skipped or weakened.

The user explicitly authorized coordination between the chats. The H01 owner confirmed isolated staging and ownership of the saved-result size/transport fix in `api.py`, `services/api.ts`, `domain/format.ts` and relevant `main.ts` download functions. Spec07 API/frontend integration waits for that owner to apply its reviewed fix, then will preserve it. Engine and metrics work can continue on disjoint files. No whole-suite success is claimed while H01 remains unfinished.

## Task status and next blocks

Task1.3 is accepted for the typed V2 payloads and mixed-member version validation. Task1.1 was accepted separately. Task1.2's concrete tape references/admission-at-H checks and task1.4's internal remaining-work/resume state remain pending until the engine block. Engine execution, metric calculation, exports/API, editor/replay and feature visual acceptance are not completed by these contract tests.

Original unmodified files were additionally copied under `review/baseline-files/` before later engine/metric/API/frontend edits to support direct no-index diff review. The implementation-baseline hash manifest remains the preservation authority; do not treat newly created unrelated work as our implementation or overwrite it.
