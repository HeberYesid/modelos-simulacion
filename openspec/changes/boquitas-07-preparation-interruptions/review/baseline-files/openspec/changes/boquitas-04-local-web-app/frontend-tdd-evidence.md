# Frontend selective TDD evidence

Final main-agent acceptance: 7 files/10 unit tests, eight real-API browser workflows, typecheck, generated-contract drift check and production build passed independently after the final clock correction. Desktop/mobile import, comparison and timeline screenshots were inspected directly; see the [independent verification report](verification-report.md).

This note records focused regressions that justified test-first work. Routine controls and presentation were implemented in coherent blocks and checked through public UI workflows.

## Regressions exercised test-first

- Numeric form values survive readback without locale grouping or rounding. The regression covers the demo root seed (`20261020`), an integer greater than 999, and a high-precision finite decimal; input serialization uses canonical numeric strings while display formatting remains localized.
- `ServiceError` preserves the API's `details.diagnostic_ref`. The public test first failed with `null` for `diag-20261022-abc123`; the adapter now retains that reference so the UI can show the backend's safe diagnostic identifier.
- A generic `capacity_exceeded` issue no longer carries the reference file's fixed six/four counts. The test supplied different counts (seven intervals and five reported workers), failed against the fixed label, then passed with a generic Spanish issue message; the separate conflict summary renders the actual peak values.
- Duplicate-key audit details preserve distinct physical source lines. With the same qualified key on lines 5 and 7 in raw and normalized views, the public renderer test first returned only line 7; deduplication by source line plus key now renders lines 5 and 7 once each.
- Importing the corrected reference exposed horizontal document overflow at 1440 px. Before the CSS fix, `.import-layout` measured `scrollWidth=1560` against a 1360 px content width; the station-summary grid child retained the table's 765 px min-content width. Adding `min-width: 0` to that grid child keeps page width at 1360 px and leaves horizontal scrolling inside the table wrapper. The E2E assertion passes at 1440 px and 390 px.
- Switching from Tuesday/integrated mode to Regular must preserve demand and render the correct worker control. A browser regression exposed the stale mode's DOM values being collected before the change handler; the mode control now commits through its change path. The same workflow verifies incompatible initial-state rejection and overnight trace inspection.
- Editing a scenario after a successful request retains the completed result with its submitted parameters and marks the draft dirty. The browser test checks successful and rejected HTTP requests without replacing the previous snapshot.
- Opening malformed UTF-8 JSON shows an actionable Spanish message and preserves the last valid result rather than exposing the browser's English decoder error.
- An experiment with five replications selects index 4 exactly. The browser test compares the selected run's metrics to the stored member and checks that CSV export scopes match the selected run or full experiment.
- With WebGL APIs forced unavailable and cross-origin requests blocked, a browser flow executes and reopens a local run, confirms metrics/chart/export remain usable, and moves the event timeline. Only requests to `localhost`/`127.0.0.1` are allowed, including the real local API.
- Millisecond time formatting rounds before splitting clock fields. The test first reproduced `formatSeconds(59.9999) === "00:00:59."`; the fix now carries to `00:01:00`, carries `86,399.9999` seconds to `24:00:00 (+1 día)`, and formats opening at `23:59:00` plus `59.9999` seconds as `00:00:00 (+1 día)`.

The completed trace stage label is displayed as “Completada”.

## Visual evidence

The corrected-reference import was captured after the min-width fix at desktop and mobile widths:

- `review/import-desktop-after-fix.png` — 1440 px viewport.
- `review/import-mobile-after-fix.png` — 390 px viewport.

Both captures show the table contained within the audit panel; the browser test also asserts the document has no horizontal overflow while the table wrapper retains its own horizontal scrolling.

## Final frontend verification

Executed in `web/` on 2026-10-22:

- `pnpm typecheck` — passed.
- `pnpm test --run` — 7 files, 10 tests passed, including the millisecond carry regression.
- `pnpm contracts:check` — generated declaration matches `contracts/openapi.json`.
- `pnpm test:e2e` — 8 browser tests passed against the running local API; API responses were not mocked.
- `pnpm build` — passed after the time-format fix; Vite generated the production bundle in `web/dist/`.

The final test invocations required the authorized elevated process permission on this Windows environment; sandbox-only Vitest startup had returned `spawn EPERM` before loading tests. The main agent performs the separate production-browser acceptance recorded in task 4.1.
