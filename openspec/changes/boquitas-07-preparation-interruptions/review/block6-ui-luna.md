# Block 6 UI editing and result inspection evidence

Date: 2026-10-24. Scope: tasks 6.1 and 6.2, INT-11/13/15/16. This report records the Luna implementation checks; the main agent still owns independent review and browser acceptance.

## Implementation

- The scenario editor stores an editable `ScenarioDraft` with incomplete values and string version selection. It serializes to the numeric V1/V2 wire contract only when saving or running. Loading a supported scenario, run, or experiment keeps its version and script. Completed results remain the submitted artifact; draft edits are signaled as not run.
- V1 keeps interruption scheduling off. V2 activation is explicit. Script rows survive mode and capacity changes; the form shows the incompatibility and an explicit resolution action that selects regular mode with one integrated worker. Clearing a schedule and disabling the policy are separate explicit actions. Entry times and order IDs are user supplied and are not inferred, replaced, or retimed.
- The non-3D result view displays saved per-order active, paused, pause-count, and elapsed preparation measures, preserving unavailable states. Timeline details label pause/resume events and show the related cashier order and V2 assignment/reservation/activity fields. Events sharing a timestamp remain visible together in the slider-based inspector.
- `types.ts` adds numeric wire aliases for the V1/V2 discriminants and nested scenarios/metrics while leaving `schema.d.ts` and `openapi.json` unchanged. `services/api.ts`, raw response JSON retention, replay projection, and file-size policy were not edited in this block.

## Verification

- `pnpm --dir web typecheck`: passed.
- `pnpm --dir web exec tsc --noEmit -p tsconfig.release.json`: passed.
- `pnpm --dir web contracts:check`: passed; generated declarations match the checked-in schema.
- `pnpm --dir web test --run tests/interruption-form.test.ts tests/interruption-results.test.ts`: 2 files, 6 tests passed.
- `pnpm --dir web test --run`: 14 files, 36 tests passed.
- `pnpm --dir web build`: passed. Vite reports the existing minified JavaScript chunk exceeds 500 kB. The sandbox initially returned `spawn EPERM`; the authorized elevated rerun passed.

## Pending independent checks and limits

- Real browser workflows, reopening V1/V2 saved artifacts, keyboard/focus behavior, and visual inspection remain pending the main agent's acceptance run.
- `replay/host.ts` has two existing single-event inspector calls. The main agent should pass each selected event together with the events at the same timestamp to `updateReplayLatestEvent(event, sameInstantEvents)` so 3D playback also exposes tied pause/payment or payment/resume events.
- Focused UI checks are acceptance/regression coverage; no artificial test-first RED is claimed for ordinary form/result wiring.
