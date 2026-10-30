
## 2026-10-28 — Completed: photo-based Boquitas 3D facade

- Status: IMPLEMENTED after the user explicitly said “hazlo” on 2026-10-28.
- Request: improve the ice cream shop's existing 3D model inside the software so it resembles the original shop, using the two supplied photographs.
- Reference details: Boquitas sign, beige awning, green frame and yellow posts, light rolling shutters, brick/beige facade, red brick sidewalk, and rows of terracotta plant pots. Photographs show the exterior; interior details and exact dimensions are not established.
- Preserved references: [Front view](references/boquitas-3d-2026-10-28/facade-front.png) and [Angled view](references/boquitas-3d-2026-10-28/facade-angle.png).
- Changed only web/src/replay/scene.ts for the facade, materials, pots and responsive camera. Engine/replay history unchanged by this task. Local web build updated; existing portable ZIP packages were not rebuilt by this task. Verification and screenshots: docs/review/boquitas-facade-2026-10-28/verification.md.
## 2026-10-28 — Payment simplification completed

- User approved removing transfer-confirmation waits and displaying only cash/transfer. New app runs/experiments normalize confirmation to zero; historical saved runs and the deterministic engine preserve legacy timing.
- Methods are recorded on demand/initial inputs independently of duration. Unknown legacy methods remain unknown. Evidence: `docs/verification/payment-simplification-2026-10-28.md` and `payment-simplification-portable.json`.
- Verified: 266 Python tests, 39 frontend tests, two focused browser flows, types/build/contracts and actual portable execution. Updated ZIP: `dist/pagos-simplificados-20261028/Boquitas-Windows-x64.zip`; previous package retained.

## 2026-10-29 — Guided first run and scenario editing

- Preserved the prior concise-interface changes and added a first-use simulation route, essential-first editor, advanced/comparison disclosures, persistent disclosure state, visible active scenario and sticky execute action. Hidden invalid fields are revealed before validation; the main landmark was corrected.
- Independent checks: 39 frontend unit tests, 26 browser workflows and 12 compiled-app browser checks passed, with both TypeScript checks/build/contracts and all seven existing OpenSpec packages passing. Desktop/mobile visual inspection and scenario axe audits passed. See docs/verification/usability-2026-10-29.md and docs/user/guia-de-uso.md.
- Local bundle rebuilt; portable executables/ZIPs were not rebuilt. Backend, saved scientific history and original observations were preserved. Empirical calibration/validation remain pending.

## 2026-10-29 — Plain-language congestion and objective analysis

- User authorized congestion diagnosis, objective comparisons and explained suggestions in everyday Spanish. Implemented in `web/src/domain/scenario-analysis.ts` and `web/src/components/scenario-analysis.ts`, integrated with saved results. Suggestions remain conditional on assumptions; each candidate is compared only with the first scenario, with adverse/uncertain effects visible.
- Independent final checks: 74 frontend tests, 28 browser workflows, 14 compiled-app workflows, app/release TypeScript, contracts, build and all seven existing OpenSpec validations passed. See `docs/verification/scenario-analysis-2026-10-29.md` and the quick guide. Prior interface edits were preserved.
- The local bundle was rebuilt; portable ZIP/executables were not. Calibration/empirical validation remain pending. No commit, remote publication or specification synchronization occurred.

## 2026-10-30 — Dark theme implemented and browser-verified

- Added the `Modo oscuro` top-bar toggle, system default, persistent overrides/reset, cross-tab synchronization, blocked-storage handling, and dark-aware UI colors in `web/src/theme.ts`, `web/src/styles.css`, the shell and document head. Theme changes preserve draft/result state.
- Independent checks passed 81 unit tests, 32 selected compiled-app browser workflows (including four theme tests), application/release TypeScript, contracts and build; desktop/mobile visual inspection and observations/scenario axe checks passed. Evidence: `docs/verification/dark-mode-2026-10-29/verification.md`. This task rebuilt the local bundle only; portable packages were not rebuilt.

## 2026-10-30 — Optional arrival schedules and menu products

- Implemented the user's authorized arrival-rate periods and product/quantity combinations, with distinct fruit-salad, ice-cream and slush replay models. Both options remain disabled in the existing demo. Scheduled arrivals use integrated piecewise Poisson intensity; menu preparation sums units times assumed per-unit durations. Example product times are editable, not calibrated.
- Product metadata survives saved results, initial-order editing and repeated replay seeks. Blank/negative quantities remain invalid editable drafts. Legacy Tuesday/regular complete JSON matched the preimplementation source snapshot exactly. Existing safety/theme/payment/3D work was preserved.
- Independent final verification: 295 Python tests plus one launcher test, 90 frontend tests, 40 compiled-app browser tests, both TypeScript configurations, Ruff/mypy, contracts/build and seven existing OpenSpec validations passed. Two port-8000 launcher checks remain pending because another local instance occupied that port. Evidence and synthetic visual fixture: `docs/verification/scheduled-menu-2026-10-30/verification.md`.
- Updated the local web bundle and user/technical guides. Existing portable ZIPs/executables were not rebuilt; no commit, remote operation, observation calibration or empirical validation occurred.

## 2026-10-30 — Queue references and stage performance

- Results now shows Tuesday payment/preparation M/M/1 or M/M/s references by capacity, and the one-worker Friday integrated M/M/1 reference. Friday's summed service is normally non-exponential and explicitly marked as an approximation. L/Lq use window occupancy; W/Wq use completed new orders through drain. No new CSV columns.
- Fixed each pool's total resource seconds using its own pool key; reopened legacy results use component seconds for correct occupancy. Final checks: 296 Python tests excluding launcher, 117 frontend tests, 13 sequential browser workflows, types/build/static checks/contracts and seven existing OpenSpec validations passed. Launcher checks require free port 8000. Evidence: `docs/verification/queue-models-2026-10-30/verification.md`.
- Local web bundle rebuilt; running API needs restart. Portable packages were not rebuilt; no commit or remote operation.
