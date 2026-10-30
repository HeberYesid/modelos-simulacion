# Measured visit replay — 2026-10-30

The user authorized adding 3D playback of the measured visits. The new player is in **Datos observados → Reproducir días medidos en 3D**, with a button for each visit. Both datasets are bundled locally; uploading a file is unnecessary for these two visits.

## Data and behavior

- Tuesday 2026-10-20: 119 station rows (61 cashier, 58 delivery), 354 recorded timestamp fields, clip 16:45:35–18:41:30, duration 6,955 seconds.
- Friday 2026-10-23: 16 station rows, 48 recorded timestamp fields, clip 17:20:23–18:21:09, duration 3,646 seconds.
- `scripts/export_observed_visits.py --check` verifies all three original source hashes, row counts and raw fields against the archived evidence before comparing the sanitized browser bundle. Original sources and the existing evidence archive are not modified. The bundle omits absolute source paths and retrospective chat statements.
- Events settle at their recorded times, including the final observed delivery. There are no random arrivals, fitted distributions or calls to run/experiment endpoints. Seeking outside the observation clip is rejected by the projection; the playback clock stays inside it.
- Each cube represents one station record. Tuesday station identities remain independent. Friday's eight confirmed cross-station links are shown in the inspector; the two station records remain separately inspectable. No movement between stations is inferred.
- Group sizes, payment methods, products, worker assignments, unknown initial work, active work segments and exact pause boundaries are not invented. Recorded windows are not claimed as resource occupation or active preparation. Tuesday's six overlapping preparation windows remain visible at 17:00:10, without adding staff.
- The scene reuses the shop geometry and resource disposal, using a narrow drawing interface rather than fabricating a simulation trace or a `RunResult`. Existing simulation replay and its metrics retain their own host.
- The player supports play/pause, 1/5/20/60× speed, restart, timeline seeking, source-row selection, timestamp buttons, camera controls, context-loss fallback/retry and a textual event list. Switching views preserves the selected visit, record and instant, and returns paused. Unmounting stops its clock and disposes scene/listener resources.

## Observed verification

| Check | Actual result |
| --- | --- |
| `uv --cache-dir .uv-cache run --frozen python scripts/export_observed_visits.py --check` | 135 source records verified against all three sources and the browser bundle. |
| `uv --cache-dir .uv-cache run --frozen ruff check scripts/export_observed_visits.py` | Passed. |
| `pnpm.cmd --dir web test --run` | 95 tests in 22 files passed on the final source. Five focused data tests cover counts/withdrawals, confirmed links, seeking, ties, clip limits and the final endpoint. |
| `pnpm.cmd --dir web typecheck` | Passed on the final source and browser tests. |
| `pnpm.cmd --dir web contracts:check` | Existing OpenAPI types match. No API contract was changed. |
| `pnpm.cmd --dir web build` | Passed; compiled local application updated. Existing large-chunk warning remains (main JavaScript about 882 kB). |
| Full existing frontend browser directory plus initial new tests | 40/42 passed in the initial broad run. One cancellation case encountered a page reload during live source edits; a CSV flow timed out while scrolling to its export button. No assertions or timeouts were weakened. |
| Final targeted browser run | 5/5 passed: both initially failed existing cases and all three measured-player cases. This is a targeted repeat, not a second clean full-suite run. |
| `openspec validate --changes --strict --no-interactive` | All seven existing change packages passed. No new SDD package, synchronization or archive was created. |
| `git -c core.whitespace=cr-at-eol diff --check` | Passed. Existing CRLF and other user edits were preserved. |

The initial browser RED failed because the two measured-visit buttons did not exist. The initial data test collection failed on the absent module, which is not presented as an assertion-level RED. A later clip-boundary slice observed an actual failing assertion: projecting Friday at 3,647 seconds failed to throw. Adding the clip guard produced 5/5 passing data tests, retaining the exact 3,646-second endpoint.

Playwright required sandbox escalation because process spawning initially failed with Windows `EPERM`. Its fallback tests deliberately disable WebGL and therefore produce the expected Three.js context-creation error. The real context-loss test also verified recovery to exactly one canvas and retention of the selected instant.

## Runtime and visual review

Screenshots were inspected for Tuesday's six overlapping preparation intervals, Friday's first preparation event and a 390-pixel mobile fallback. This review found and corrected missing panel padding and a simulation-specific admissions badge; measured playback now labels it **VENTANA OBSERVADA**. The inspector identifies unavailable fields and source lines; the layout fits the mobile viewport without horizontal overflow. The textual clock readout avoids continuous screen-reader announcements during playback.

The built application was also opened at `http://127.0.0.1:8000/` using an isolated agent-browser session. At 875 seconds it reported **17:00:10**, 59/354 timestamp fields, an available WebGL scene and six preparation intervals. A scoped axe 4.12.1 check reported zero violations, 27 passes and one incomplete contrast rule affecting the zoom glyph and text over the canvas. This automated check is not a complete accessibility certification.

Browser evidence is isolated under `.tmp/observed-replay/` (`red`, `green`, `regression`, and `final-targeted`). The guide is updated at `docs/user/guia-de-uso.md` with its existing line endings preserved. The main agent reviewed the bounded data implementation, integration and drawing changes and independently ran the final verification above. Existing unrelated dirty files were not reverted.

## Limits

This feature reconstructs recorded station events; it does not establish a complete person-by-person history, calibrated model, active utilization or empirical business validation. Undocumented initial work and inter-station gaps remain unknown. The scene has no measured worker animations or measured products. The Python simulation suite was not rerun because no engine/API code was changed; the new export script was executed and linted. Portable EXE/ZIP packages were not rebuilt or tested, and target-hardware performance was not measured. No commit, push, remote publication or deployment occurred.
