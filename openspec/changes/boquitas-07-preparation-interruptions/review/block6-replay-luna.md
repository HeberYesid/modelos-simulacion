# Block 6 replay implementation evidence

Date: 2026-10-24. Scope: version-aware replay projection, 3D pause/resume state, and non-3D inspection for INT-10/INT-16. No engine, API, editor, result, schema, or task-status changes were made in this block.

## Implementation

- `project.ts` accepts V1 and V2 trace/config pairs, keeps V1 event validation strict, validates V2 regular/one-integrated-worker configuration and pause/resume relationships, and projects the interrupting cashier order as paid waiting while the suspended order resumes. V2 regular paid-preparation orders appear in the replay queue; V1 regular replay remains unchanged.
- `scene.ts` keeps the paused order visible at its preparation station, labels its paused state with the existing scene-label style, and projects the same worker at the cashier and back at preparation from trace events.
- `host.ts` labels paused people/orders, keeps them in the in-shop count, reports the V2 paused-order count, and shows the related cashier order and remaining work recorded by the latest pause/resume event.
- `web/tests/fixtures/replay/interruption-core-v2.json` contains the trace extracted from the generated public V2 run fixture. The existing replay test and fixture files remain byte-identical to the saved baseline.

## Verification

- Test-first RED: the new projector test initially failed on the V2 trace with `trace.contract_version must be 1`.
- GREEN: `pnpm --dir web test --run tests/interruption-replay.test.ts tests/replay.test.ts` passed **11 tests**. Vite first failed to spawn in the sandbox (`spawn EPERM`); the same test command passed outside the sandbox, without changing the runner configuration.
- The saved pre-edit copies of `project.ts`, `scene.ts`, and `host.ts` matched the current files before editing. SHA-256 checks confirm the existing `replay.test.ts` and its four replay fixtures still match the baseline copies.
- `pnpm --dir web typecheck` currently exits 2 due V2 draft integration errors in concurrent `main.ts` and `components/scenario-editor.ts` work. A filtered rerun reported no diagnostics in `src/replay/project.ts`, `scene.ts`, or `host.ts`; the affected files remain outside this block's ownership.
- Real-browser/E2E and visual inspection remain pending for the coordinated UI acceptance block.
