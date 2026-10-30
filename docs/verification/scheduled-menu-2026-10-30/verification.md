# Scheduled arrivals and menu orders — 2026-10-30

## Authorized scope and outcome

The user authorized implementation after checking compatibility. Added optional time-of-day arrival rates, weighted product combinations with quantities and per-unit preparation assumptions, and procedural fruit-salad, ice-cream and slush models in the existing replay. Existing uncommitted safety, theme, analysis, payment and shop-personalization work was preserved. No historical specification package was rewritten; no commit, remote publication or portable-package build occurred.

Both options are disabled in the existing demonstration. The original generator branch is retained when no schedule is supplied. Saved legacy traces remain readable and use their generic product representation.

## Modeling decisions

- `arrival_schedule` contains up to 48 contiguous ordered periods covering the entire simulation window, with rates in shared orders/groups per hour. Zero rates are allowed. It requires exponential base interarrivals. Indexed unit-exponential draws are transformed through integrated piecewise-constant intensity, including waits crossing rate changes and zero-rate periods. There is no single exponential interarrival mean over the complete variable-rate day. See the [Poisson time-change construction](https://www.randomservices.org/random/poisson/Nonhomogeneous.html).
- `menu.products` defines product IDs, names, one of the three supported visual kinds and fixed preparation seconds per unit. `menu.baskets` defines weighted complete orders. Preparation is `sum(quantity * preparation_s)` with one payment and one complete-order worker assignment; quantities do not multiply by group size. Up to 24 products, 32 combinations and 50 total units per order are accepted. Existing initial-state remaining times stay explicit.
- The editor seeds only the three products named by the user. Initial 180/60/90-second values are editable examples, not measured business times or a confirmed complete menu. No observation calibration or empirical validation occurred.
- Immutable resolved product items are retained on order inputs and trace final orders. Replay uses these saved items without random regeneration. At most six product models are drawn per tray, retaining representation of every present visual kind; inspectors show exact quantities. Shared geometries/materials use the existing disposal lifecycle.

## Independent verification

| Check | Observed result |
| --- | --- |
| `uv run --frozen --offline pytest -q --ignore=tests/test_launcher.py --basetemp <isolated-temp> --tb=short` | **295 passed** |
| `uv run --frozen --offline pytest -q tests/test_launcher.py::test_launcher_reports_missing_frontend_build_with_setup_path --tb=short` | **1 passed** |
| `uv run --frozen --offline ruff check .` | Passed |
| `uv run --frozen --offline mypy src/boquitas` | Passed, 17 files |
| `pnpm --dir web exec vitest run` | **90 passed**, 21 files |
| Application and release TypeScript configurations | Both passed |
| `uv run --frozen --offline python scripts/export_web_contracts.py --check` | Passed, 8 generated documents |
| `pnpm --dir web contracts:check` | Passed |
| `pnpm --dir web build` | Passed; existing large-chunk warning remains (818.35 kB JavaScript before gzip) |
| Browser acceptance against the final compiled app | **40 passed**, including both new schedule/menu workflows |
| `openspec validate --changes --strict --no-interactive --json` | All 7 existing packages passed |
| `git -c core.whitespace=cr-at-eol diff --check` | Passed, accepting the existing Windows Markdown line endings |

The browser run used a temporary configuration on `http://127.0.0.1:8022`, one worker, and the compiled app. The existing `shop-personalization.spec.ts` ran from a temporary identical copy with its hardcoded API port changed from 8000 to 8022; the original file was preserved. Temporary configuration/copy files were removed afterward. Standard repeat runs can use `pnpm --dir web exec playwright test` when its normal 8000/5173 ports are available.

The two remaining launcher tests (busy-port ownership and start/stop lifecycle) were not rerun successfully because another local process already occupied port 8000; it was left running. Initial restricted-runner attempts also encountered Windows temporary-directory permissions and Node `spawn EPERM`; authorized isolated/elevated runners produced the successful results above. Python retains the pre-existing Starlette/httpx deprecation warning.

### Legacy equality and test-first regressions

Complete Tuesday and regular run JSON was compared with a source snapshot taken before implementation, using root seed 71 and replication index 2. Both payloads remain exactly equal. SHA-256 values of the serialized payloads:

- Tuesday: `cb1c13a4ee4896eedc638a686baba2763ee50e3218394fc1c0ca77407983a612`
- Regular: `896ca5349883676ae35cba0b6ce4c16ab6864a05c3a0eb77f7dc46914ff9a962`

Observed RED/GREEN cycles cover piecewise arrival hazards, menu preparation and metadata, optional-collection schema compatibility, initial-order product preservation, blank/negative quantity drafts, and the actual add-window button. The latter initially retained two rows after an add action; final acceptance verifies adding a third row, removing a row and preserving complete horizon coverage. Empty/negative quantities remain editable invalid drafts; zero intentionally removes a product.

The manually solved arrival oracle includes a zero-rate first second and a rate change at second 5, producing arrivals approximately 2.790652508, 2.910685573 and 9.620959692. The menu oracle verifies `2 * 180 + 1 * 60 = 420` preparation seconds for one shared order. Tests also cover invalid references/weights/limits, independent streams, V2 preservation and changed-generation disclosures.

## Actual visual review

Inspected the compiled application in an isolated browser at 1440×1000 and 390×844. Both widths fit without horizontal page overflow. The three product silhouettes render during active preparation; camera zoom makes their bowl/fruit pieces, cone/scoops and cup/straw details visible. Product quantities remain available in the order inspector at preparation and delivery and after seeking.

- [Final three-product scene](products-final.png)
- [Desktop editor](editor-desktop.png)
- [Mobile editor](editor-mobile-menu.png)
- [Mobile order inspector](products-inspector-mobile.png)
- [Synthetic visual scenario](menu-visual-scenario.json) and [saved run](menu-visual-run.json)

The visual fixture has one two-person order arriving at second 6, paying for 2 seconds, and preparing all three example products for 330 seconds. Delivery is at second 338, after the second-10 admissions closure. It is an engineering example, not a business observation.

The final browser acceptance also exercised scenario/result save and reopen, a zero-rate arrival period, invalid horizon/distribution/probability messages, preservation of the previous result, cancellation, dark mode, legacy transfers, unavailable/lost WebGL, camera controls and existing V2 interrupted replay. Automated checks and these visual observations are engineering verification; target-hardware performance and real product times remain unmeasured.

## Delivery state

The local `web/dist` bundle includes the feature. Existing portable ZIPs/executables do not include it. A separate compiled-app preview was started on loopback port 8022 for review; the occupied port-8000 instance was not stopped. The [Spanish quick guide](../../user/guia-de-uso.md) and [technical guide](../../technical/technical-guide.md) document the new options and their assumptions.
