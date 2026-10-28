## Context

Depends on implemented/accepted 01 through 05, the [shared baseline](../../README.md) and their public contracts. This change packages local operation and supplies real integration evidence. It cannot replace missing empirical observations with software tests.

## Goals / Non-Goals

**Goals:** repeatable Windows startup, offline runtime, understandable guides, actual browser/3D acceptance and traceable limitations.

**Non-Goals:** remote deployment, public access, binary installer, new field collection or claiming calibrated model validity.

## Decisions

### Installation and operation

Document Python 3.13, `uv`, Node compatible with the pinned Vite release, and `pnpm`. Install Python dependencies with `uv sync --frozen`; install the frontend with its frozen pnpm lockfile; build `web/dist`. State that this initial setup can require internet. No dependency installation or asset fetch is hidden in the runtime launcher.

Provide `start-boquitas.ps1` at the project root during implementation. It checks the local environment, built frontend and port 8000, reports actionable setup errors and starts the existing local Python environment with `python -m boquitas` in the current foreground console. Open the default browser at `http://127.0.0.1:8000` only after the health check succeeds. An occupied port is reported rather than killing an unrelated process or connecting blindly. Ctrl+C is the documented shutdown; verify restart releases the port. Do not weaken Windows execution policy; document an explicit command for running the script within the user's existing policy and keep the direct Python command available.

`python -m boquitas` is a minimal local entry point delegating to the API of 04, not a second model. Reproducible outputs exclude wall-clock metadata from scientific equality. Record OS, Python, Node/browser and lockfile revisions when checking reproducibility. Raw and corrected observation evidence hashes must remain unchanged.

### Acceptance workflow

Run the actual Python tests, Ruff and mypy; frontend tests, TypeScript checks and production build; then browser workflows. Read browser-automation skill instructions before controlling it. Check the supplied original and corrected observation files with explicit policies, diagnose the known overlap, execute the labeled demo in both modes, run 30 matched replications, inspect one indexed replication, save/reopen JSON, export relevant CSV tables, seek/play/pause/restart the 3D and repeat startup/shutdown. Include the empty/invalid inputs, group and transfer fixtures from upstream acceptance criteria.

Test offline by preventing external network access for the browser test and confirming all application requests stay on the local origin; do not disable the user's machine networking globally. Verify the installed backend does not attempt dependency downloads. Inspect the 3D in an actual graphical browser at active payment, preparation, pending transfer, abandonment and drain-to-completion. Capture local QA screenshots and actual observations. Unit tests and static screenshots do not alone demonstrate animation timing. If the environment cannot support browser or GPU inspection, mark those required checks pending rather than accepting them from static structure.

### Guides and acceptance report

Produce `docs/technical-guide.md`, `docs/guia-de-uso.md` and `docs/acceptance-report.md` during implementation. The guides cover setup/stop/restart, source format and correction policy, all configurable assumptions, person/order distinctions, active versus reserved utilization, window/cohort denominators, seeds/replicas, interval interpretation, exports, 3D controls and common errors. The user guide is Spanish; technical artifacts remain English. Include the no-automatic-calibration limitation near the data workflow and in result interpretation.

The acceptance report maps all ENG/OBS/EXP/WEB/VIS/REL requirements/scenarios to a check, actual result and evidence locator. Record commands, counts, failures, skipped/pending checks, environment and observed visual findings. Do not create a prefilled passing report during planning. Main agent reviews the final diff and independently runs applicable checks before accepting delegated tasks. Do not mark OpenSpec tasks complete simply because artifacts exist.

### Future empirical validation protocol

Document a prospective measurement sheet with anonymous person IDs, linked group/order IDs, arrival definition, initial shop state, worker identity, payment medium, active cashier segments, external confirmation, preparation start and final delivery. If partial receipts are later studied, record receiver/product/time rather than dividing one duration across people. Record observation start/end and censored/incomplete outcomes explicitly. Resolve the six-versus-four delivery conflict with evidence rather than tuning resource counts.

Collect representative Tuesday and other-day observations, checking their units and chronology before estimation. Define a calibration subset and separate validation observations by whole visit/day to avoid reusing the same records as independent validation. Decide adequate sample sizes, validation tolerances and replication precision only when evidence exists; do not invent acceptance thresholds for actual Boquitas now. Compare matching units and periods, review with an operator, test extreme scenarios and document deviations. Without station links, end-to-end person validation remains unavailable. Operational recommendations require that later validation gate, beyond successful synthetic software experiments.

## Risks / Trade-offs

- Offline runtime can hide first-install dependencies -> test installed assets with network requests monitored and document setup separately.
- Browser/GPU access may be unavailable -> retain an explicit pending visual gate, not a false pass.
- Preliminary data can appear persuasive -> distinguish measured, assumed and simulated values throughout manuals and acceptance evidence.

## Migration Plan

Package the already-accepted components locally and provide repeatable installation. There is no deployment or source-data migration. Stop the local process to deactivate the app; do not delete user result files or source evidence.

## Open Questions

No release-software decisions are deferred. Future field sample sizes, actual fitted distributions and empirical validation tolerances belong to a separate evidence-backed study.
