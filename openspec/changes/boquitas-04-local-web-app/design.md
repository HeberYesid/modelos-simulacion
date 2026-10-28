## Context

Depends on implemented 01 through 03 and their canonical domain/result contracts. Read the [shared baseline](../../README.md), [import contract](../boquitas-02-observation-import/design.md) and [experiment contract](../boquitas-03-scenario-experiments/design.md). This adapter must not calculate a second version of metrics or infer parameters from observations.

## Goals / Non-Goals

**Goals:** understandable Spanish workflows, typed local HTTP, configuration/result fidelity, portable files and a reusable replay host.

**Non-Goals:** deployment, accounts, databases, uploads to outside services, live interventions or a separate desktop executable.

## Decisions

### Local API

Use FastAPI/Pydantic with the domain types and explicit response models. The released app binds to `127.0.0.1:8000`. Use standard synchronous route handlers for CPU work, with no remote workers, job broker or server result database. Disable duplicate submission in the UI; v1 does not offer computational cancellation. Browser Abort/close is not represented as proof the server stopped computing.

| Endpoint | Request | Success |
| --- | --- | --- |
| `POST /api/v1/observations/import` | Multipart `file` CSV/TXT bytes and `correction_policy` (`none` by default) | 200 `ImportReport` |
| `POST /api/v1/runs` | JSON `{scenario,root_seed,replication_index}` | 200 `RunResult` |
| `POST /api/v1/experiments` | JSON `{scenarios,root_seed,replications}` | 200 complete `ExperimentResult` |
| `GET /api/v1/health` | None | 200 `{status:'ok',contract_version:1}` |

Domain validation errors return 422 `{code,message,issues:[{path,code,message}],details}`. Failed experiments return 422 with partial diagnostics and any partial `ExperimentResult` labeled failed inside details; they never return complete success. Oversized uploads return 413. Unexpected exceptions return 500 with an actionable generic message and a local diagnostic reference, not private source content or a stack trace in the UI. Cap uploaded observation/result files at 10 MiB with explicit errors. Scenario/workload limits are owned by 03. Accept bytes, not client-supplied local paths. Pasted text is packaged as a text upload. JSON configuration/result reopening validates the same versioned schemas through the existing operations or shared schema validators; it does not execute arbitrary content.

Serve `web/dist` locally after API routes using FastAPI's supported static-serving approach for the pinned release. Development Vite proxies `/api` to the local backend, avoiding production cross-origin complexity. No network exposure, permissive public CORS or runtime external fonts/CDNs is required.

### Browser application and data flow

Use vanilla TypeScript and Vite with small domain-based modules: configuration form, import/audit view, run/experiment results, charts, file adapters and replay host. Generate or validate frontend contract types from the backend schema during implementation; maintain one exported API schema and contract fixture to catch drift. Avoid duplicating validation rules by hand where the API is authoritative.

Flow: edit scenario -> validate -> take immutable submitted snapshot -> call service -> display completed result with its assumptions -> optionally obtain chosen replication -> host replay -> export files. A failed request retains the previous valid result labeled as previous, never as the newly edited scenario. Changing settings sets a dirty indicator. No scenario edits mutate the stored result or event history. Browser refresh loses unsaved in-memory work; offer JSON download explicitly rather than silently storing scientific results in localStorage.

### Screens and presentation

Provide three main views: `Datos observados`, `Escenarios` and `Resultados`. The first exposes source/policy, counts, excluded rows, audit changes and expandable diagnostics. The second supports save/open scenario, mode-specific capacity controls, time distributions, group probabilities, initial-order rows, patience and seed. The third contains summary/units, charts, comparison table, chosen-run inspection and the 3D area added by 05. Initial-state editor only offers compatible stages for the selected mode and requires remaining times/worker IDs where relevant. Opening/closing controls translate to H; version 1 requires a same-day closing later than opening, while draining can pass midnight and is displayed with `+1 dia` when needed.

Results distinguish `Datos observados`, `Demostracion sintetica` and `Supuestos del usuario`; keep the important missing measurements and simplifications near relevant values, not only in a footer. Show separate people/order units and `No disponible` with reason. Display queue time series as step charts using local SVG and comparison intervals as local SVG error bars; use exported metric values instead of recomputing business statistics in JavaScript.

Visual direction: the shop/replay is the focal area; controls and scientific results are quiet and readable. Use white `#FFFFFF`, cool background `#F1F7FA`, strawberry `#D94373`, teal `#13877A` and ink `#203442`; verify final text contrast. Use local Segoe UI/system sans-serif. Align forms/tables left, keep a clear parameter/result hierarchy, and avoid decorative chart effects. Before frontend implementation read frontend-design and execute modern-web-guidance. Respect reduced motion and keep forms/results usable on narrow screens even though full 3D is primarily for desktop presentations.

### Files and tests

Downloads use the export contracts of 03; observation tables retain 02 provenance. File names use scenario IDs and content type, not untrusted filesystem paths. JSON is the exact scientific round-trip format. No uploads leave the loopback application.

Use FastAPI TestClient for actual HTTP behavior; use Vitest for public form/result and file adapter behavior, TypeScript type checks and Playwright browser workflows. Lock dependencies and define the planned `test`, `typecheck`, `build` and `test:e2e` scripts. Follow the shared selective TDD policy: uncovered critical contracts/data integrity and bug regressions use focused test-first cycles; ordinary UI/API integration is implemented and verified in coherent blocks. Do not require an artificial RED for styling or every acceptance example. Browser QA must inspect the visible result independently of unit tests.

## Risks / Trade-offs

- Long local comparisons -> bound requests via 03 and show a pending state without a fabricated percentage.
- Stale results after edits -> immutable submitted snapshots and explicit dirty state.
- CPU work and requests are synchronous -> adequate for bounded single-user v1; do not invent infrastructure before evidence requires it.
- Unavailable graphics -> tables/charts and trace state inspection remain available.

## Migration Plan

Introduce the browser adapter after domain acceptance. Keep domain-only commands usable without frontend dependencies. Build and serve locally; no deployment. On an incompatible saved JSON version, reject with guidance rather than silently migrate.

## Open Questions

None blocking this implementation. Exact real-shop geometry and future public access are outside the agreed release.
