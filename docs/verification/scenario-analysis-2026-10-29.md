# Scenario analysis — 2026-10-29

Authorized scope: explain congestion, compare scenarios by an operational objective, and explain suggestions in plain Spanish. Suggestions are explicitly conditional on simulation assumptions.

## Delivered behavior

- Results identify where the saved run accumulated more waiting orders, using the existing time-weighted queue summaries. Integrated staff are explicitly described as handling both payment and preparation; the queue location is not presented as proof of its cause.
- The comparison offers three goals: receive the order sooner, reduce withdrawals caused by waiting, and reduce time after closing. Each candidate is compared with the first saved scenario; the panel does not declare a winner between candidates.
- Explanations show differences as ordinary phrases such as “45 segundos menos”. Known disadvantages and uncertain adverse changes remain visible with a favorable result. Further evidence and suggested next steps use native disclosures.
- Advice uses the experiment's saved comparisons. Changing the objective preserves keyboard focus and selection across views without requesting another experiment or changing saved JSON. An inspected run's congestion diagnosis is scoped to that individual run.
- Missing or inconsistent data, incomplete experiments, incompatible conditions, unavailable measurements and comparisons without a clear advantage withhold a recommendation. Withdrawals cannot be evaluated when that behavior was not configured. Legitimate zero counts remain distinct from unavailable durations.
- Existing engine, Python tests, API contracts, observations, exports, replay implementation and historical evidence were preserved. The Spanish quick guide was extended while retaining its CRLF line endings.

## Observed verification

The parent independently reviewed the integration and observed these final gates:

| Command or check | Result |
| --- | --- |
| `pnpm.cmd --dir web test --run` | 74 tests passed in 18 files, including 30 domain-analysis and 5 analysis-view tests. |
| `pnpm.cmd --dir web typecheck` | Passed. |
| `pnpm.cmd --dir web exec tsc --noEmit -p tsconfig.release.json` | Passed. |
| `pnpm.cmd --dir web contracts:check` | Generated contract types match. |
| `openspec.cmd validate --changes --strict --no-interactive --json` | All 7 existing changes passed. No new specification package was created. |
| `pnpm.cmd --dir web build` | Passed; the local bundle was regenerated. The existing large-bundle warning remains. |
| `pnpm.cmd --dir web exec playwright test --workers=1 --output=../.tmp/scenario-analysis-20261029/all-browser` | All 28 workflows passed. |
| `pnpm.cmd --dir web exec playwright test --config ../.tmp/scenario-analysis-20261029/production.config.ts` | All 14 selected workflows passed against the compiled application on port 8000. |
| `git -c core.whitespace=cr-at-eol diff --check` | Passed, recognizing the guide's existing CRLF convention without changing repository settings. |

Actual desktop/mobile screenshots were inspected at 1440 × 900 and 390 × 844. A separate compiled-app browser session reopened a small synthetic experiment: one versus two integrated workers, seven new orders, three repetitions, identical demand. It displayed 45 seconds less until receipt and 90 seconds less after closing, matching the stored engine comparisons. These are software checks on invented inputs, not measured business benefits. Screenshots and disposable browser output are currently under `.tmp/scenario-analysis-20261029/`.

## Test chronology and limits

Implementation blocks recorded meaningful failing assertions before adding the analysis heading, congestion explanations, stored-comparison integrity checks and preservation of an uncertain disadvantage beside a confirmed disadvantage. Additional cases that already passed were recorded as confirmations, not historical RED evidence. The parent independently observed the final complete gates above.

An intermediate browser test compared visible text with text including closed disclosures. The assertion was corrected using Playwright's documented `useInnerText` option, retaining the full visible-text comparison. A subsequent unit run had 53 passes and one outdated copy assertion; its wording was aligned while retaining the check that the downside is visible outside disclosures. Final complete runs passed. Sandboxed browser/test runners initially returned `spawn EPERM`; the same local commands ran with approved process execution.

Python tests were not rerun because this block changes frontend analysis and presentation only. The historical release suite was type-checked but not executed because it writes into the preserved Spec06 evidence; the isolated compiled-app workflows above were used instead. No fresh automated accessibility audit, performance benchmark, user study, calibration or empirical validation is claimed. Portable executables/ZIPs were not rebuilt. No commit, push, synchronization, archive or deployment was performed.
