# UI and TypeScript closure review

Date: 2026-10-24. Scope: Spec07 tasks 5.4, 6.1 and 6.2; implementation source review only. The main agent retains independent final acceptance and browser checks.

## Source review

No implementation edits were needed. SHA-256 values for the reviewed files match `baseline-hashes.json` in this closure folder: `web/src/api/types.ts`, `web/src/components/scenario-editor.ts`, `web/src/components/results.ts`, `web/src/replay/host.ts`, `web/tests/interruption-form.test.ts` and `web/tests/interruption-results.test.ts`.

- `types.ts` maps generated string discriminator declarations to numeric literal 1/2 for scenario, metrics, run and experiment wire contracts. V1/V2 nested scenarios and metrics are also specialized; generated engine config tags are already numeric. `schema.d.ts` and `openapi.json` remain generator-owned.
- The form converts draft string selection to numeric root/config tags, preserves schedule rows when mode/capacity or individual row values are incompatible/incomplete, rejects incompatible submission, and separates clearing the schedule from disabling the policy. V2 activation is explicit; unchanged demo defaults stay V1.
- Saved result inspection renders V2 active/paused/count/elapsed measures and pause/resume event details. V1-only measures stay explicitly unavailable. Main-app state compares the editable draft with the completed submitted artifact and labels edits as not run without replacing the completed result.
- `replay/host.ts` supplies all events at the latest V2 timestamp to both playback and initial/seek inspector updates. The non-3D inspector groups same-time events too.
- Reviewed the local forms guidance: controls have visible labels and descriptions, schedule messages are announced as status/alert, and incomplete draft entries remain preserved.

## Verification observed

- `pnpm --dir web typecheck`: passed.
- `pnpm --dir web exec tsc --noEmit -p tsconfig.release.json`: passed.
- `pnpm --dir web contracts:check`: passed; generated declarations match checked-in schema.
- Focused interruption form/results tests: sandboxed run failed at Vitest startup with `spawn EPERM`; bounded elevated rerun passed 2 files / 7 tests.

No RED/GREEN claim is made for ordinary UI wiring. Full browser/reopen/keyboard/visual acceptance remains with the main agent; this note does not accept task 6.4 or full change closure.
