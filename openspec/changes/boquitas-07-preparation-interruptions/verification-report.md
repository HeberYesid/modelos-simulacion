# Spec07 engineering acceptance

Date: 2026-10-24. Status: 28/28 implementation tasks accepted after independent main-agent checks. This closes the nine tasks that were still unchecked when the user requested their implementation. It does not calibrate or empirically validate the model.

Most of the remaining product code was already present. Review confirmed the numeric V1/V2 transport types, script-preserving editor, immutable results, tied-event inspection and replay. The remaining functional defect was a collapsed error location when reopening an invalid saved V2 run or experiment: the API returned `2` instead of the scenario/script field. The correction preserves nested indices and keeps V1-member diagnostics appropriate in mixed experiments. Six public API regressions were added. User and technical guides now describe the implemented controls and limits.

## Closure of the nine tasks

| Task | Independent acceptance evidence |
| --- | --- |
| 5.3 | Public run/experiment/file validation, unsupported/inconsistent versions, infeasible runs and nested saved-result diagnostics pass. A new two-case regression failed before the saved-result fix; the final full Python run passes. The restarted production browser also verifies the precise nested path and preservation of the previous valid result. |
| 5.4 | Python schema/fixture export matches seven contract files; generated TypeScript drift and normal/release/audit type checks pass. Existing numeric wire aliases preserve actual JSON number discriminants without hand-editing generated declarations. |
| 6.1 | Real editor load/edit/save, incomplete rows, incompatible mode/capacity, explicit resolution and retained scripts pass. Current demo remains V1. |
| 6.2 | Saved active/paused/count/elapsed metrics, pause/resume and same-time event details, unavailable V1 values and unchanged completed-result downloads pass. |
| 6.4 | Production browser verifies core and external-confirmation timelines, repeated seeks, speeds, playback, actual JSON/CSV downloads, reopening without simulation, real WebGL loss, mobile layout and mixed V1/V2 member selection. |
| 7.1 | Spanish manual/quick guide, English technical guide and implementation roadmap updated and read back. Fifty existing local guide links/anchors resolved in the delegated documentation check; final status/report links were separately checked by the main agent. |
| 7.2 | Final Python suite: 259 passed, no failed/skipped tests. Ruff, mypy, API export and source/reference integrity checks pass. |
| 7.3 | Frontend: 37 unit tests in 14 files; normal/release/audit TypeScript checks, contract drift and production build pass. Existing browser suites: 14 development and six production tests pass. Final V2 acceptance has nine checked behaviors; final H01 large-file browser test passes. |
| 7.4 | Main agent inspected requirements, implementation and test changes, numeric transport aliases, editor/result handling, replay inspector calls and new API normalization. Earlier accepted domain/replay diff reviews were retained and their suites rerun as part of the final full checks. Six protected source hashes match and both V1 scientific runs regenerate byte for byte. |

## Observed commands and results

All commands ran from the project root against the frozen installed environment. No dependency was installed or upgraded.

- `uv --cache-dir .uv-cache run --frozen --offline pytest -q --basetemp=.pytest-spec07-final-20261024 --junitxml=openspec/changes/boquitas-07-preparation-interruptions/review/remaining-closure-20261024/final-pytest.xml`: **259 passed** in 21.80 seconds.
- `uv --cache-dir .uv-cache run --frozen --offline ruff check src tests scripts`: passed.
- `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas`: passed, 15 source files.
- `uv --cache-dir .uv-cache run --frozen --offline python scripts/export_web_contracts.py --check`: seven files match.
- `pnpm --dir web test --run`: **37 passed**, 14 files.
- `pnpm --dir web typecheck`, and `tsc --noEmit` with `tsconfig.release.json` and `tsconfig.audit.json`: passed.
- `pnpm --dir web contracts:check` and `pnpm --dir web build`: passed.
- Existing `playwright.config.ts`: **14 passed** in 53.2 seconds. Existing `playwright.release.config.ts`: **six passed** in 31.8 seconds, with external HTTP requests blocked by its audit fixture.
- `node openspec/changes/boquitas-07-preparation-interruptions/review/remaining-closure-20261024/browser-acceptance.mjs`: **nine behaviors passed** against the restarted final production API. The context used reduced motion; no external requests or uncaught page errors occurred.
- Existing `playwright.audit.config.ts`, with `BOQUITAS_AUDIT_URL=http://127.0.0.1:8000` and a short output path in this chat's visualization directory: **one passed** in 9.4 seconds against the final API. The 14,240,829-byte two-scenario/30-replication comparison reopens with exact data and no additional run/experiment POST.
- `verify_integrity.py` in the closure evidence directory: six protected sources unchanged; Tuesday reference 895,752 bytes, SHA-256 `8bbe6b117f59dde367816d8ed63bb013b0ad624d916a57159c084fcff4051dd7`; regular reference 976,770 bytes, SHA-256 `d0093084b4e99e59000725ae99c8cab2603bb3f7a666c986f731b06b5c157e69`. Both were freshly regenerated and compared to the complete original bytes. The original engine test file is unchanged.
- Strict OpenSpec validation: all seven packages pass. Final documentation/task readback and `git diff --check` pass.

## Visual and behavioral review

The main agent inspected fresh screenshots at core times 6 and 8, confirmation time 8, mobile script editing and actual graphics fallback. At 6 A is paused while the sole worker charges B; at 8 A prepares while B waits paid. The confirmation example shows zero active and one reserved worker. The core delivers A/B at 14/17 and exposes 10 active, two paused, one pause and 12 elapsed seconds for A. The confirmation example delivers at 17/20. Repeated seeking, playback and downloads preserve saved history and metrics.

A separate isolated agent-browser session checked actual Tab/Shift+Tab focus through the time and order-ID fields; the visible focus ring was inspected. These are local synthetic engineering checks, not operator approval or a human usability study.

## Resolved execution failures and remaining limits

- The initial sandbox pytest attempt could not access its temporary directory. A fresh elevated baseline passed 253 tests, and the final elevated run passed 259 with port 8000 free for launcher checks. No permissions or assertions were weakened.
- The first audit browser attempt targeted unused port 8011. A subsequent attempt saved its download at a 269-character path; Chromium reported a file-read error before any upload request. The unchanged test passed with a shorter output path, and passed again against the final API. Use a short local download directory on Windows; arbitrary long-path compatibility is not claimed.
- The integrity helper initially counted regenerated Python bytecode as a changed test; it was corrected to compare source artifacts rather than `__pycache__` output and then passed.
- The API implementer did not save an exact pre-edit copy of the two newly changed files in this continuation. Its note explicitly identifies the reconstructed hunk-level delta. Main acceptance therefore includes direct review of those current functions/tests, initial source hashes, the retained earlier baseline/diff evidence and fresh independent checks; it does not claim a newly captured exact before/after API diff.
- One existing Starlette/httpx deprecation warning remains. The production bundle still has the existing chunk-size warning above 500 kB. Neither warning failed a gate; dependency and bundle optimization are outside this change.
- Field pause boundaries and real active preparation remain unknown. Scripts are explicit assumptions for exactly one regular integrated worker; they do not define automatic priority, multiple-worker interruptions, Tuesday interruptions or calibrated real parameters.

Evidence: [closure directory](review/remaining-closure-20261024/), [final browser record](review/remaining-closure-20261024/browser/browser-acceptance.json), [integrity record](review/remaining-closure-20261024/final-integrity.json), [API regression/delta](review/remaining-closure-20261024/api-luna.md), [UI review](review/remaining-closure-20261024/ui-luna.md), and [guide review](review/remaining-closure-20261024/docs-luna.md).

No commit, push, PR, deployment, main-spec synchronization or archival was performed. Approval for a later change remains separate.
