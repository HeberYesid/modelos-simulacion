# Presentation safety verification

Completed on 2026-10-30 for the three high-priority findings authorized by the user. Existing interface, analysis, theme and 3D work was preserved. Medium/low-priority saved-file consistency, overlap-report expansion and parser findings were not included in this correction.

## Applied safeguards

- Bound staffing to 32 workers per pool, groups to 50 people, initialized orders to 1,000, and total initialized/generated people to 10,000 per run. Retain the 10,000-new-order cap. Recheck copied public inputs and bounded iterables before allocating entities. Invalid editor values remain available for correction and cannot create oversized worker-option arrays.
- Charge actual experiment sizes before each simulation: at most 30,000 orders, 50,000 people, and 10,000,000 cumulative squared-order work units. These are computational limits, not observed shop capacities. A failed demand-generation attempt does not consume the successful-run budget; API deadlines and cooperative cancellation still apply to that path.
- Add request-scoped cancellation, a 60-second monotonic deadline, one active calculation per app, bounded execution-ID history, and structured cancellation/timeout/busy responses. Run, comparison and selected-replication requests use fresh UUIDs. The cancel action remains available across views; the original request must end before another calculation starts. Previous completed results and scenario drafts are retained.
- Generate the browser limit manifest from the Python constants and check it alongside the API contract. Preserve deterministic scientific results for supported inputs and reopen historical V1/V2 results without rerunning them.

## Observed verification

| Check | Result |
| --- | --- |
| Python suite excluding the three fixed-port launcher tests | 283 passed; one stale OpenAPI artifact assertion failed. The regenerated contract test subsequently passed. This verifies all 284 non-launcher tests. |
| Regenerated contract assertion and missing-interface launcher diagnostic | 2 passed; 285 distinct Python tests verified across the suite and focused rerun. |
| Frontend unit tests | 81 passed in 19 files. |
| App/release TypeScript, Ruff on src/tests/scripts, strict mypy | Passed; mypy checked 17 source files. |
| API schema, limit manifest and domain fixtures | All 8 generated files match; generated TypeScript contract check passed. |
| Current compiled application in an immutable frontend snapshot | All 38 browser workflows passed, including the editor regression, real run/batch cancellation, draft/result preservation, themes, saved files, replay and WebGL fallback. |
| New portable executable, critical UI workflows | All 3 execution-safety browser tests passed directly against the executable. |
| Existing OpenSpec packages | All 7 passed strict validation; no new specification or synchronization was created. |
| Production build and diff whitespace check | Passed; the existing large JavaScript chunk advisory remains. |

The initial browser run against the shared build directory had two navigation failures while other chats rebuilt that directory. A hash-verified, immutable frontend copy removed this interference; the complete 38-test run passed without weakening assertions. The portable contains exactly that browser-verified frontend snapshot. The test helper now uses the configured API origin rather than a hardcoded port 8000.

The worker-allocation, cancellation endpoint and copied-V2-configuration regressions have observed failing-then-passing evidence. Aggregate-budget coverage was added after implementation; no historical RED is claimed for those tests.

## Portable deliverable

- ZIP: `dist/presentacion-segura-20261030/Boquitas-Windows-x64.zip`.
- Size: 61,459,418 bytes.
- SHA-256: `223f133308bdec60e96513e59728ed72ab86351a589290b0303bce0dedf60349`.
- Previous portable packages remain in their original folders.
- [Executable/API acceptance report](presentation-safety-20261030/portable-check.json): 310 manifest files verified, developer tools removed from the child PATH, input guards, cancellation/recovery, 60 comparison replications, V1/V2 save/reopen, CSV, observation import, two start/stop cycles and occupied-port preservation all passed.
- Browser evidence: `.tmp/presentation-safety-20261030/browser-results/` and `portable-browser-results/`. A direct visual check confirmed the oversized staffing value is marked invalid while the editor stays usable.

## Limits and remaining work

Two development-launcher tests requiring exclusive port 8000 were not rerun because an existing service owned that port. It was not terminated. The portable's equivalent restart and occupied-port checks passed on isolated ports. The historical release suite, which writes into preserved Spec06 evidence, was not used for this acceptance.

The destination computer, its browser/GPU, offline operating conditions and projector still require an actual rehearsal. Executable checks were performed on the build computer; they do not establish empirical calibration or validation of the business model. No commit, push, PR, deployment or history rewrite was performed.
