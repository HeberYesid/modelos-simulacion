# Dark theme verification

Implemented on 2026-10-29; independent browser verification completed on 2026-10-30.

## Scope

- Added the Spanish `Modo oscuro` toggle to the top bar, with native keyboard operation and `aria-pressed` state.
- Follow the system initially; persist explicit overrides, allow returning to the system theme, synchronize open tabs, and keep toggling usable when browser storage is blocked.
- Apply the saved preference in the document head before the application loads. Theme native controls and the existing surfaces, forms, tables, SVG charts, alerts, and replay controls. Include CSS fallbacks for browsers without `light-dark()`.
- Preserve scenario drafts and open results when switching themes. Keep the existing light palette and replay category meanings.

## Observed evidence

- The implementing agent observed the missing-toggle browser test fail before implementation, then pass; the focused suite passed 4/4.
- The final unit run passed 81/81 tests across 19 files with `pnpm --dir web test --run --maxWorkers 1`. A preceding parallel run timed out in one work-limit test during browser activity; the final run passed without changing that test or its timeout.
- Independent compiled-app verification passed 32/32 selected browser workflows: the existing 28 workflows plus all four theme tests. The temporary configuration used the compiled app on loopback port 8001 and one worker, avoiding development hot reloads during concurrent edits. Its last-run record is `.tmp/dark-mode-compiled-playwright/.last-run.json`.
- Application/release TypeScript checks and generated API-contract checks passed. The local production build succeeded, with the existing large-bundle advisory.
- Direct dark-theme visual inspection covered observations, scenarios, and results, including results at 390 px. The blocked-storage browser test verified 320 px without horizontal overflow. Axe reported zero violations for observations (41 passes) and scenarios (42 passes).
- Screenshots in this directory include the original light interface and the inspected dark screens.

## Limits

The initial broad development-browser run encountered page reloads while other work modified shared sources. Its failures are superseded for the selected workflows by the successful compiled-app run. Unrelated concurrent implementation and its additional test packages are outside this theme acceptance. Older browser fallback rendering and destination hardware were not tested. This task did not rebuild portable ZIPs, commit, publish, or alter the simulation model.
