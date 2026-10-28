## Why

The user confirmed that on the regular-day visit of 2026-10-23 one integrated worker paused preparation of order 6, charged order 7 and resumed preparation. The current version-1 model retains a worker through delivery and cannot represent this operation or distinguish its active and paused preparation time.

## What Changes

- Define an opt-in version-2 regular mode for exactly one integrated worker, driven by an explicit interruption schedule rather than an inferred automatic cashier-priority policy.
- Preserve preparation progress, perform one cashier transaction including any reserved external confirmation, resume the suspended order, and queue the newly paid order for later preparation.
- Add deterministic pause/resume events, remaining-work invariants, separate active/paused/elapsed metrics, and corresponding queue/resource projections.
- Extend typed API, scenario/run/experiment JSON, CSV and replay consumers to support version 2 while retaining the behavior and saved scientific artifacts of version 1. New payloads are deliberately incompatible with version-1-only consumers and must be labeled version 2; existing version-1 contracts are not silently changed.
- Expose explicit script editing and Spanish diagnostics/labels, preserve scripts across edits and saved files, and verify the same-worker pause/cashier/resume sequence through actual replay after implementation is authorized.
- Preserve the approved comparison and original observations as evidence; no fitting, active-time reconstruction or empirical-validation claim is introduced.

Approval record: on 2026-10-24 the user approved [plan 001](../../../plans/001-scripted-preparation-interruptions.md) and requested a new Spec **without implementation**. This change formalizes that approved proposal; creating its artifacts does not authorize applying its tasks.

Subsequent authorization: the user then approved Spec07 implementation on 2026-10-24 in bounded GPT-6 Luna blocks with independent main-agent review/validation, preserving version-1 tests and behavior. That implementation is in progress; only tasks with accepted observed evidence are marked complete. The original planning-only record remains historical.

## Capabilities

### New Capabilities

- `preparation-interruptions`: explicit, versioned preparation pause/cashier/resume behavior and its end-to-end contracts, metrics and inspection.

### Modified Capabilities

None of the version-1 requirements are rewritten. Existing capability packages remain the version-1 baseline; this new capability specifies the version-2 extension and the exact exceptions at its integration boundaries. `openspec/specs/` is currently empty because predecessors have not been synchronized or archived. Do not fabricate main requirements, create MODIFIED operations against nonexistent main specs, or synchronize predecessors under this planning request. The design maps the affected upstream requirements explicitly.

## Impact

Future changes affect engine/model state, metrics, scenario/experiment wrappers, typed API and exports, generated contracts, scenario editing and replay. The existing centralized event coordinator remains authoritative; no dependency upgrade, new service or deployment is proposed. Version-1 observation import and correction profiles remain unchanged.

Dependencies: the implemented contracts of specs01–06, the [observed comparison](../../../plans/comparacion-martes-vs-normal-2026-10.md), and explicit authorization before implementation. Spec06 engineering acceptance and any outstanding user review remain separate from this approval. Historical verification files and source data are preserved.

Non-goals: an automatic priority policy, interruption-rate estimation, calibration, multiple integrated workers under this option, nested interruptions, preparation migration, initially paused snapshots, recipes, partial delivery, changing Tuesday operation, station-ID generalization, or main-spec synchronization/archiving.
