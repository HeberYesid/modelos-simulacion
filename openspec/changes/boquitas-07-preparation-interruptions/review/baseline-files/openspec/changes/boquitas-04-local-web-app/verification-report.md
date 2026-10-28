# Spec04 independent verification

Date: 2026-10-22. Engineering scope: the local web application only. Specs01–03 were approved by the user; spec04 implementation was delegated to GPT-6 Luna at max effort and independently reviewed by the main agent. User approval to advance to spec05 remains pending.

## Delivered behavior

FastAPI exposes typed local operations backed by the existing importer, simulation, experiments and export contracts. The vanilla TypeScript/Vite application provides Spanish observation audit, complete scenario editing, immutable completed results, replicated comparisons, indexed-run inspection, local JSON/CSV downloads and an event timeline. The production launcher serves the bundled application and API on `127.0.0.1:8000`.

No domain engine, import, statistics or export implementation from specs01–03 was changed. No parameter fitting, inferred station links, empirical validation, three-dimensional renderer or external deployment was introduced.

## Independent automated results

The main agent executed these checks and inspected their actual outputs:

| Check | Observed result |
| --- | --- |
| `uv --cache-dir .uv-cache run --frozen pytest` | 128 passed; includes all 109 baseline tests and 19 API tests |
| `uv --cache-dir .uv-cache run --frozen ruff check .` | Passed |
| `uv --cache-dir .uv-cache run --frozen mypy src/boquitas` | Passed; 13 source files |
| `uv --cache-dir .uv-cache lock --check --offline` | Passed |
| `uv --cache-dir .uv-cache run --frozen --offline python scripts/export_web_contracts.py --check` | Passed; OpenAPI and three deterministic domain fixtures match |
| `pnpm --dir web contracts:check` | Passed; generated TypeScript matches OpenAPI, allowing only line-ending differences |
| `pnpm --dir web test --run` | 7 files, 10 tests passed |
| `pnpm --dir web typecheck` | Passed |
| `pnpm --dir web build` | Passed; Vite emitted local JS/CSS assets |
| `pnpm --dir web test:e2e` | 8 passed against the real local API through the Vite proxy |
| `openspec validate --changes --strict --no-interactive --json` | All six changes valid; zero issues |
| Protected-file SHA-256 comparison | All 32 baseline source/test/fixture and spec05/06 artifact files unchanged |

The earlier sandbox-only Python run could not set up an existing temporary-directory test. The complete elevated run passed without skipping or modifying that test. Node/browser process permissions and the initially missing Playwright Chromium revision were resolved before the final checks; no runner failure was treated as passing evidence.

One upstream Starlette TestClient deprecation warning remains: its legacy `httpx` integration recommends `httpx2`. Playwright also emits a non-failing `NO_COLOR`/`FORCE_COLOR` environment warning. Neither warning disabled a check. There are no outstanding failed acceptance checks.

## Requirement evidence

| Requirement | Runtime evidence and main-agent review |
| --- | --- |
| WEB-01 | Real HTTP tests cover strict payloads, field-specific 422 staffing errors, measured 10 MiB file limits, failed-experiment partial diagnostics, safe 500 diagnostic references and rejection of server-path input. The main agent independently inspected the route/model adapters and observed the staffing and corrected-import responses. |
| WEB-02 | Browser import of the corrected reference with its approved policy showed 119 normalized rows, three withdrawals, `already_reflected`, unknown group/person counts and the six-versus-four delivery conflict. The main agent expanded the diagnostic and read all six source keys, delivery IDs6–11. Importing retained the synthetic scenario inputs. Audit regressions preserve different physical source lines sharing a key and avoid fixed reference-specific counts in generic warnings. |
| WEB-03 | Real-browser tests edit mode, distributions, groups and explicit initial work. Regular mode supplies one integrated worker while preserving demand. Contradictory initial assignments receive 422; a corrected in-progress order drains past midnight with an explicit next-day clock. Numeric form readback retains the seed and unrounded parameter values. |
| WEB-04 | A successful run retains its submitted preparation parameters after draft edits. A rejected request and an incompatible JSON file preserve that completed result and the dirty notice. Single-candidate runs correctly become clean after acceptance. The main agent reviewed separate draft/completed state and immutable request snapshots. |
| WEB-05 | A real five-replication comparison selects candidate index4 using the stored root seed. The E2E check compares its returned metric summary with the stored batch member. The main agent also selected index4 in the production app and inspected the paired interval chart, units/cohorts, requested/valid counts and selected-run identity. |
| WEB-06 | Browser tests download scenario/result JSON and CSV, reopen supported artifacts through backend validation without another run request, reject unsupported versions and distinguish batch from selected-run exports. Original opened JSON bytes are retained for supported exact re-export. Generated contract drift checks pass at both boundaries. |
| WEB-07 | With WebGL contexts forced unavailable, a real browser executes and reopens a result, shows the unavailable-renderer message, retains metric tables/SVG charts/exports and changes the event timeline readout. Empty runs show unavailable sample reasons. The main agent independently moved the production timeline with Home/ArrowRight and inspected its event detail. |
| WEB-08 | The actual server binds to loopback; production HTML, JS, CSS and API requests were observed on the same local origin, with zero external resource requests. An E2E workflow blocks non-local requests and completes execution, reopening, charts, export and timeline inspection. Keyboard tab switching, visible focus, primary-button contrast and reduced motion pass browser checks. Imported reports have page widths1440/390 at the respective viewport widths; wide tables scroll inside their containers. |

## Visual acceptance

The main agent directly operated the production bundle in an isolated browser session and inspected screenshots. This is separate from schema validation and automated assertions.

- [Imported report, desktop](review/main-import-desktop-final.png): readable source/policy, counts, caveats and contained station table at 1440px.
- [Imported report, mobile](review/main-import-mobile-final.png): stacked panels and readable counts at 390px; document width390px, internal table scroll338px/763px.
- [Scenario form](review/scenario-desktop.png): labeled parameters, mode controls and adjacent model assumptions.
- [Comparison overview](review/comparison-desktop.png) and [paired interval chart](review/paired-chart-desktop.png): stored confidence level, paired differences and demand disclosures.
- [Indexed-run event timeline](review/timeline-desktop.png): scenario/replication identity, original configuration and non-3D trace controls. A later presentation-only correction translates the completed stage into Spanish.

The earlier [import screenshot](review/import-desktop.png) records the defect before repair: a min-content grid child expanded the desktop page to1600px. The fix constrains the grid child and keeps the table's horizontal scrolling local. The main agent rechecked the repaired desktop/mobile widths and the expanded six-row diagnostic.

The screenshots contain synthetic simulation outputs and descriptive imported observations. They are not measured shop performance or empirical model validation. Accessibility verification covered the stated browser interactions and contrast checks; it is not a comprehensive assistive-technology certification.

## Selective TDD and review corrections

See [API evidence](API-tdd-evidence.md) and [frontend evidence](frontend-tdd-evidence.md) for the actual recorded cycles. Critical integrity/regression coverage includes numeric precision, immutable snapshots, mode-change ordering, UTF-8 errors, diagnostic-reference propagation, source-line retention and accurate clock carry across minute/day boundaries. Routine API/UI wiring and styling were verified in coherent blocks.

Main-agent review found and required correction of the regular-mode event ordering, false dirty state, diagnostic-reference key mismatch, imported-report overflow, reference-specific warning text, duplicate-key source-line collapse and millisecond carry. Focused regressions now pass. Existing behavior was not removed to manufacture failures, and baseline assertions were not weakened.

Tracked differences were inspected along with the new API/frontend/tests/contracts files, because much of this project is still untracked from earlier approved work. Temporary generated-contract cleanup deletes its own file and then the empty directory without recursive deletion. Build artifacts, dependency caches and test output are ignored.

## Source integrity and practical limits

Both original source SHA-256 values match the start-of-work evidence:

- Original `Pasted text.txt`: `845f8c6e56a7af120754ab0a5a789f318b65214e11f91737fd25032b7e51573d`.
- Corrected reference: `480ade881fd14bc88d8c94f037cea9ef4c2869b7ba400cbffda772f6f470caea`.

Browser data stays in memory until downloaded; refresh loses unsaved work. The web adapter explicitly rejects integer tokens beyond JavaScript's safe integer range instead of silently rounding them; this does not narrow the underlying Python contract. Displayed clocks round to milliseconds, while JSON preserves supported stored source bytes. Computation is synchronous and offers no cancellation claim. The network-isolation check is browser-level; the operating system's internet connection was not disabled.

The non-3D timeline and renderer host complete spec04. Spec05's three-dimensional scene and spec06's validation/delivery work remain unimplemented. No commit, push, PR, synchronization, archive or deployment was performed. The local application is ready for user review; advancing requires explicit user approval.

Developer startup and verification commands are in [web/README.md](../../../web/README.md).
