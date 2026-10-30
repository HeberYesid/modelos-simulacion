# Usability pass — 2026-10-29

Scope: help a first-time user start the synthetic demonstration without importing observations, simplify the scenario screen, preserve advanced settings and error access, and keep the execute action easy to reach. Existing concise-interface edits were preserved.

## Changes

- Added a first-use card in **Datos observados** with a direct route to **Escenarios**. It states that the demonstration is synthetic and uncalibrated; the import form remains available.
- Kept mode/capacity, time window and system timing controls visible. Moved scenario identification, group sizes, initial orders, interruption policy, root seed and comparison replications into **Opciones avanzadas**.
- Moved the scenario roster and comparison action into **Comparar alternativas**. It starts closed for one scenario and opens when a candidate is added. The active scenario name remains visible while either disclosure is closed.
- Preserved native disclosure state across rerenders and view changes. Preloaded V2/initial-state scenarios and advanced validation or compatibility issues open the relevant disclosure. Form values remain part of the submitted form when their disclosure is closed.
- Added a compact sticky action bar at the start of the scenario form. The run button remains a single instance; focused controls scroll clear of the bar.
- Kept the tab panel inside one semantic `<main>` landmark while preserving its existing panel ID and tab relationship.
- Updated the Spanish quick guide for the first-use, advanced-options and comparison paths. Browser screenshot tests now use per-test output paths instead of overwriting historical Spec04 evidence.

## Observed browser evidence

The focused test-first RED observations were:

- The first-use heading was absent before adding the starter card.
- `details[data-advanced-options]` was absent before introducing the advanced section.
- An intermediate bottom-sticky layout overlapped `#preparers` at 390 × 844.
- `getByRole("main")` returned zero landmarks while the tab panel used `role="tabpanel"` on a `<main>` element.

After implementation, this command passed with **6/6 tests**:

```text
pnpm.cmd --dir web exec playwright test e2e/first-run-usability.spec.ts --output=../.tmp/usability-20261029/agent-results
```

The browser cases verified the first-use CTA through a successful 200 run and results view without an observation-import request; advanced-value and open/closed-state preservation through view changes; a single-scenario closed comparison disclosure; a visible execute button at 1440 × 900 and 390 × 844 without overlap; focus and disclosure reveal for a required hidden seed; and one main landmark around the selected tab panel.

An initial sandboxed Playwright attempt stopped before the test because worker creation returned `spawn EPERM`; subsequent focused browser runs used the approved elevated process launch and isolated output directory.

## Independent acceptance

The parent independently reviewed the complete source and test diff and observed:

- `pnpm.cmd --dir web test --run`: 39 tests passed in 16 files.
- `pnpm.cmd --dir web typecheck` and `pnpm.cmd --dir web exec tsc --noEmit -p tsconfig.release.json`: passed without diagnostics.
- `pnpm.cmd --dir web build`: passed; the local production bundle was rebuilt.
- `pnpm.cmd --dir web exec playwright test --workers=1 --output=../.tmp/usability-20261029/parent-results`: all 26 tests passed. This includes the existing import, comparison, saved-result integrity, JSON/CSV, legacy payment, replay, graphics fallback, facade/interior and keyboard workflows.
- `pnpm.cmd --dir web exec playwright test --config ../.tmp/usability-20261029/production.config.ts`: 12 tests passed against the compiled application on port 8000, with no Vite server. These cover the six usability cases, four concise-interface cases and two keyboard-navigation cases.
- `pnpm.cmd --dir web contracts:check`: generated OpenAPI types match. `openspec.cmd validate --changes --strict --no-interactive --json`: all seven existing changes validated.
- Actual screenshots inspected at 1440 × 900 and 390 × 844. At 390px, document width was also 390px. The native execute action remains visible and the advanced controls remain reachable.
- Actual axe-core 4.12.1 audit of the compiled scenario screen at both viewport sizes: 42 passes, zero violations and zero incomplete checks. This is automated accessibility evidence, not a user study.
- Manual compiled-app interaction retained a user-opened single-scenario comparison disclosure when switching to regular mode, with seed `20261020` unchanged.

An initial baseline browser run had three passes and one teardown failure caused by a missing shared Playwright trace file. Subsequent runs used isolated output directories; both final suites passed without that failure.

The guide retains its original CRLF line endings, consistent with its `-text` Git attribute and the preservation policy. `git -c core.whitespace=cr-at-eol diff --check` passed; the option recognizes existing CRLF without changing repository configuration. The final diff contains no changes to backend source, original fixtures, API contracts, replay implementation or historical OpenSpec evidence.

Workspace screenshots are under `.tmp/usability-20261029/`, including `start-desktop.png`, `scenario-desktop.png` and `scenario-mobile.png`. The full historical `e2e-release` suite was updated for the disclosures and type-checked, but was not executed because it writes Spec06 review evidence. Python tests were not rerun for this frontend-only change. Portable executables and ZIP packages were not rebuilt. No calibration, commit, push, synchronization, archive or deployment was performed.
