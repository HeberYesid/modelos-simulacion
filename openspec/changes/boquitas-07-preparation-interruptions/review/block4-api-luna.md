# Spec07 Block 4: Experiments, exports, and API

Date: 2026-10-24

## Scope completed

- Added V2 demand preflight that revalidates the scenario and its V1-compatible initial state without running tape-bound scripts against an empty tape. V1 demand generation, category RNG streams, and generated order IDs are unchanged.
- Added version-dispatched selected runs and experiments. V1-only calls retain V1 models; a mixed experiment uses a V2 envelope and preserves each member's own metrics version. Failed script-bound replications keep their index, diagnostic, and existing denominator semantics.
- Added version-aware JSON loaders/exporters. Versionless legacy JSON still defaults to V1 where the public loaders previously allowed it; explicit V2 payloads are validated as V2.
- Added V2 CSV columns for active/paused preparation, pause count, event assignment details, version, policy, script, and assumptions. V1 CSV headers and serialization remain on the original path.
- Extended existing `/api/v1` run, experiment, saved-file, and CSV operations for V2. Preserved the 10 MiB observation and 64 MiB saved/result limits and compact UTF-8 result response guard. Health and observation-import contracts remain V1.
- Generated separate V2 scenario, run, and mixed-experiment fixtures, OpenAPI unions, and `web/src/api/schema.d.ts`. No frontend behavior source was changed.

## Evidence

- Selected TDD for tape-bound V2 preflight: the new test first failed because the empty-tape preflight rejected `r000000-o00000` as unknown; after the V2 static-only preflight change it passed with generated IDs unchanged.
- Focused legacy, H01, and Block 4 Python suite: **58 passed**, with one Starlette `httpx` deprecation warning. This included the large-result reopen test, exact legacy staffing-error fixture, legacy CSV writer, and new V2 integration tests.
- `ruff check src tests scripts`: passed. `mypy src/boquitas`: passed, 15 files. `scripts/export_web_contracts.py --check`: passed, 7 generated files. `pnpm --dir web contracts:check` and `pnpm --dir web typecheck`: passed.
- The H01 snapshot hashes still match for all ten files outside the intentionally extended `src/boquitas/api.py`; H01 tests and frontend sources are byte-identical to the snapshot.
- The legacy regular reference remains SHA-256 `d0093084b4e99e59000725ae99c8cab2603bb3f7a666c986f731b06b5c157e69`. Existing V1 fixture hashes also match their pre-generation values: demo scenario `982458d1686d3375d7975008ea092f77b13c840ff17997b7236955c355449e5e`, sample run `ce003906924ad220fd30c84ad5feb80aea637ad3041e1de65167757e3bbd162a`, and sample experiment `1ab28c97e5b9f1aab87e6c9b9761838368ad6d28eb4f177189e2a482d20df248`.
- A root-wide `ruff check .` exited successfully but printed access-denied warnings while traversing pytest temporary directories; the explicit source/test/script check above passed without warnings. The focused pytest suite needed the authorized outside-sandbox runner because the sandbox could not enumerate pytest's temporary directory.

## Limits

This block does not claim full Spec07 acceptance, replay/UI verification, or the full application suite. Main-agent diff review and the remaining owners' acceptance checks are pending. No task checkmarks, commits, or remote operations were made.

## Reviewer follow-up: versionless CSV request compatibility

After independent review, the main agent added `tests/test_interruption_review.py::test_legacy_csv_request_without_a_default_version_tag_remains_valid`. The test first failed with HTTP 422 and `union_tag_not_found` because a missing root result tag was sent to the discriminated union. `CSVExportRequest` now defaults only a missing top-level `result.contract_version` to V1; it does not infer V2 from nested content. A separate test confirms that a V2 run missing its root tag is rejected rather than inferred as V2. The saved-file endpoint still requires a declared version.

- The regression passed after the boundary normalization.
- Focused review plus legacy/V2 API, export, experiment, and demand tests: **65 passed**, with one Starlette `httpx` deprecation warning.
- `ruff check src tests scripts`, `mypy src/boquitas`, OpenAPI fixture drift, and generated TypeScript contract drift passed. No schema regeneration was needed because the request validator does not change the schema.
- A later `pnpm --dir web typecheck` now fails in files under active frontend/replay work: V1-only run types in `web/src/main.ts`, and V2 replay typing errors in `web/src/replay/host.ts` and `web/src/replay/project.ts`. No frontend source was changed in this block; those errors remain for the active owners to resolve.

## Reviewer follow-up: nested version-2 request diagnostics

The four static V2 request regressions initially failed: Pydantic reported only `scenario` because nested `PublicModel.__init__` validation was wrapped as `InputValidationError`/`ValueError` before the discriminated union surfaced its error location. The nested error message retained the script entry or capacity field, but the current API mapper discarded that detail.

- `src/boquitas/api.py` now recognizes only the nested V2 interruption-time and staffing error forms, reconstructs their field paths, and returns fixed Spanish messages without echoing input values. Other request errors and the dynamic experiment-failure diagnostics keep their existing paths.
- The focused four-case regression was RED before the change and GREEN after it. Direct responses identify duplicate time as `scenario.engine_config.cashier_interruptions[1].at_s`, boolean/negative times as `scenario.engine_config.cashier_interruptions[0].at_s`, and invalid capacity as `scenario.engine_config.integrated_workers`.
- `tests/test_api.py`, `tests/test_interruption_api.py`, and `tests/test_interruption_review.py`: **42 passed**, with one existing Starlette `httpx` deprecation warning. This includes the dynamic indexed experiment-failure regression.
- `uv --cache-dir .uv-cache run --frozen --offline ruff check src tests scripts`: passed. `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas`: passed, 15 files.

## Reviewer follow-up: cross-boundary version-2 field paths

The first API-only normalization still missed experiment and saved-scenario boundaries and did not identify blank IDs or mode. A new public regression matrix was added before the broader correction; its first run was **RED: 18 failed** across runs, mixed experiments with V2 at `scenarios[1]`, and saved scenarios.

- `src/boquitas/api.py` now walks the structured `ctx.error` and `InputValidationError.__cause__` chain to recover Pydantic model locations without exposing rejected values. Request prefixes retain `scenario` or `scenarios[1]`; saved scenario paths start at `engine_config`. The duplicate-time validator is the only case that needs text parsing, and its regex is anchored to its exact known field syntax. Same-ID validation reports the script row because the model validator does not identify one ID field.
- The new `tests/test_interruption_api_diagnostics.py` covers six invalid cases at all three public boundaries: negative and duplicate times, blank cashier ID, same IDs, unsupported mode, and invalid capacity. It also confirms raw sentinels are not returned and requires the V2 capacity message to say exactly one integrated worker and zero separated cashier/preparer workers.
- The matrix is now **18 passed**. The combined API, interruption API, reviewer regression, and new diagnostic suites are **60 passed**, with one existing Starlette `httpx` deprecation warning. This retains the V1 staffing fixture, the dynamic indexed experiment failure, and the result-size guard tests.
- `uv --cache-dir .uv-cache run --frozen --offline ruff check src tests scripts`: passed. `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas`: passed, 15 files.
