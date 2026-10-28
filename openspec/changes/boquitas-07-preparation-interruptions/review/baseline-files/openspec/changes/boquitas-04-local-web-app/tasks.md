Implementation authorized after user approval of specs01–03. Owner: GPT-6 Luna; reviewer: main agent. All 14 engineering tasks are complete with [independent acceptance evidence](verification-report.md); user approval is required before spec05. API and replay/UI boundaries are already confirmed. Apply the [selective TDD policy](../../README.md#selective-tdd-policy): critical uncovered contracts/integrity and bug regressions are test-first; implement ordinary API/UI wiring in coherent blocks, then verify public workflows, types, build and visible behavior. No RED is required for every control or styling edit.

## 1. Local API and frontend setup

- [x] 1.1 Refresh FastAPI/Vite APIs via Context7, execute modern-web-guidance and read frontend-design before frontend work; establish locked dependencies, TypeScript, Vitest and Playwright commands with usable runners.
- [x] 1.2 Implement WEB-01 typed run operation and error mapping; verify the HTTP 422 staffing example and exact upstream response schema.
- [x] 1.3 Implement WEB-01 observation upload and experiment operations plus health; verify policy propagation, bounded uploads, failed-replication errors and no server-path input.
- [x] 1.4 Implement WEB-08 local static serving and development API proxy; verify local-origin API/asset routes without production CDN dependencies.

## 2. Configuration and evidence workflows

- [x] 2.1 Implement WEB-02 upload/paste and policy selection; verify known counts, correction audit, affected-row conflicts and absence of automatic calibration.
- [x] 2.2 Implement WEB-03 mode/staffing/time/distribution/group/transfer/patience controls and labeled demo; verify regular-mode changes do not alter demand assumptions.
- [x] 2.3 Implement WEB-03 compatible initial-state editor and explicit known/remaining-time validation; verify contradictory assignments cannot be submitted as accepted inputs.
- [x] 2.4 Implement WEB-04 submitted snapshot, pending/error states and dirty edits; verify old results retain their original settings.

## 3. Results, comparisons and portability

- [x] 3.1 Implement WEB-05 metrics, step charts, confidence intervals and paired comparison table; verify units, cohorts and valid-replication counts.
- [x] 3.2 Implement WEB-05 indexed replication selection and the replay host; verify selected-run metrics match the stored batch summary.
- [x] 3.3 Implement WEB-06 scenario/result JSON save/open and CSV downloads; verify unsupported version errors preserve the last valid result.
- [x] 3.4 Implement WEB-07 non-3D trace inspection and unavailable/empty/error values; verify usable results with unavailable WebGL.
- [x] 3.5 Verify WEB-08 keyboard controls, focus, contrast, responsive forms and reduced-motion behavior through actual UI interactions.

## 4. Main-agent acceptance

- [x] 4.1 Run Python/API checks and `pnpm --dir web test --run`, `pnpm --dir web typecheck`, `pnpm --dir web build` and applicable `test:e2e`; inspect the diff and visible browser result, reporting structural/runtime/visual evidence separately for WEB-01 through WEB-08.
