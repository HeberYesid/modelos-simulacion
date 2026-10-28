# Spec07 task 7.1: user and technical guidance closure

Date: 2026-10-24  
Scope: task 7.1, INT-17 and INT-18. Edited only the four assigned guides/roadmap and this evidence note. No implementation code, tests, OpenSpec task checkboxes, observation files or academic documents were changed.

## Changes

- `docs/MANUAL_USUARIO.md`: replaced stale V2-pending language with the current controls and flow. Documented the one-worker regular-mode restriction, explicit script fields and order IDs, compatibility/error behavior, the synthetic A/B example and its stable-fixture variant, result metrics, replay inspection, and V2 save/reopen without simulation. Retained the observed 183-second elapsed interval and the unknown pause/active-time limits.
- `docs/technical-guide.md`: updated the implementation state and V2 API/file/replay descriptions; added observed UI labels, validation and runtime diagnostics, a solved synthetic core timeline and an explicit final-acceptance boundary.
- `docs/guia-de-uso.md`: added the quick V2 editor path, exact fixture opening steps, expected metrics, reopen behavior, and a common invalid-script diagnostic.
- `openspec/README.md`: made the initial planning-only approval historical, recorded later bounded implementation authorization, removed stale claims that V2 was unimplemented, and stated that full gates/main review are still in progress.

## Source and evidence review

- Read `AGENTS.md`, `openspec/config.yaml`, `openspec/README.md`, and Spec07 proposal/design/spec/tasks, plus the prior `review/block7-docs-luna.md`.
- Inspected the current editor fields/buttons and preservation behavior in `web/src/components/scenario-editor.ts`, saved-file validation/reopen flow in `web/src/main.ts`, result metrics/event labels in `web/src/components/results.ts`, and replay labels. Visually reviewed `ui-core-t6.png`, `ui-core-t8.png`, and `browser-mobile-editor.png`.
- Read the existing `review/browser-acceptance.json`; it reports `passed: true`, eight focused checks, no errors, and no external requests. This prior evidence was read, not rerun here; it does not replace the main agent's current full gates or final review.
- Kept the synthetic timeline (B arrives at t=5) distinct from `scripted-demo-input.json`, where A and B are both initial waiting orders at t=0 and B's payment starts at t=5. Both produce the same core timing, while the latter keeps literal IDs stable across replications.

## Readback and limits

- Checked 50 local Markdown links and heading anchors across the four documents; all targets resolved.
- Compared the three user/technical guide SHA-256 values against `baseline-hashes.json`; all three changed within the assigned scope. `openspec/README.md` has no entry in that baseline snapshot, so its comparison is against the readback taken before editing.
- No executable tests were run for these prose-only changes. The full Spec07 acceptance is still in progress; no claim of final engineering acceptance, model calibration or empirical validation is made.
- The 2026-10-23 normal visit confirms same-worker interruption for that visit only. It does not reveal exact pause/resume boundaries or active preparation time; 173 seconds is not a measured active time. Scripts remain explicit user assumptions.
