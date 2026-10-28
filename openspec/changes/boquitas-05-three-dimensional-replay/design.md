## Context

Depends on the [engine trace](../boquitas-01-simulation-engine/design.md), [run result](../boquitas-03-scenario-experiments/design.md), [browser host](../boquitas-04-local-web-app/design.md) and [shared baseline](../../README.md). This is explanatory replay of a discrete-event model, not a second simulation or a surveyed digital replica.

## Goals / Non-Goals

**Goals:** recognizable shop, individual people/order links, correct worker states, repeatable timeline inspection and actual visual evidence.

**Non-Goals:** photorealism, real-site measurements, menu/recipe modeling, collisions, travel-time calculation or live intervention.

## Decisions

### Pure projection and single clock

Export a pure `project_replay(trace, time_s) -> ReplayState` from the frontend's replay module. ReplayState has ordered payment/preparation queues, pending payments, order/person state, worker assignments and active/reserved state, admission-closed flag and selected simulation time. Reuse engine event meanings, not inferred drawing coordinates. Validate contract version, required fields and monotone `(time_s,seq)` before playback.

Initialize from public registry and `order_initialized` events, then apply every event <= t. All same-timestamp events settle before painting. Implement backward seeking by rebuilding from the immutable trace; add timestamp indexing only if profiling justifies it. The initial result is paused at 0. Use one animation loop and one virtual playback clock, independent of SimPy wall-clock execution. Speeds are 1x, 5x, 20x and 60x, default 20x; seek covers 0 through `drain_end_s`. At drain end pause. Restart returns to 0. Show local clock, elapsed simulation time and closing marker, including day offsets if draining crosses midnight. Selecting a new run resets time and selection.

### Scene, layout and characters

Use Three.js WebGLRenderer, a PerspectiveCamera and OrbitControls. Build the shop procedurally from simple meshes: floor, partial walls for visibility, entrance/signage, cashier counter and separate preparation/collection counter. Use the palette and typography from 04. This is an illustrative layout labeled as such; no claim about actual Boquitas dimensions or branding accuracy. Camera begins in a three-quarter overview with reset.

Create cashier/preparer or integrated workstations from the trace's configured resource identities. People use simple low-detail bodies/heads with distinguishable IDs/colors and selection. Keep identities stable across seeking. Show groups together; one representative approaches payment while companions wait nearby. Preparation is one worker action per order, not one per avatar. Simple hand motions and an order container illustrate active preparation; the delivered object is generic, not a claimed recipe or product count. Pending transfers and reserved inactive workers receive distinct labels/icons instead of an active-preparation gesture.

Logical queues can extend outside the illustrative waiting zone; do not introduce an unapproved physical admission limit. Use reusable/instanced geometry for people where practical. Camera culling is rendering only; inspectors and counts retain all entities. Delivered/abandoned people leave the active scene cosmetically but remain inspectable in result lists. Do not keep them visibly waiting as though still in the system.

### Cosmetic transitions

Positions are projections of logical states and a deterministic transition phase from the last event, not outputs that affect the model. Use short bounded interpolation for walking. If the next authoritative event arrives first, complete or snap the cosmetic motion to the required state. No movement can postpone a worker release or delivery. On seeking render the exact target state immediately; do not replay past walking animations in real time. Reduced-motion mode disables walking/gestures and preserves selected-time state changes. The animation clock can use browser frame deltas; it never changes scientific metrics.

### Controls, failures and lifecycle

Keep keyboard-operable playback/camera-reset controls outside the canvas. Provide a selected-person/order inspector showing IDs, shared order members, stage, worker and known timestamps. Tables remain the accessible alternative to canvas-only information. If WebGL setup fails or context is lost, stop the loop and show the existing non-3D state inspector/results; do not display a fabricated screenshot as live playback. Reload can attempt renderer initialization again.

On replacing/unmounting a scene, stop its loop, detach event/resize/selection handlers, dispose controls, geometries, materials and textures, and release renderer resources. Respect actual viewport size and cap device-pixel scaling for practical local presentation. Start with procedural assets, no downloaded models, CDN or external fonts.

### Verification

Use the approved replay/UI boundary for pure projection fixtures plus real browser tests. Compare projected states at known times with the manually solved engine cases; use times immediately before/at/after delivery, initialization, transfer and closing. Exercise seeking, speeds, repeated loading and unavailable WebGL. During browser QA inspect screenshots and actual motion at payment, preparation, abandonment and final delivery; report visual findings separately from structural tests. Record observed responsiveness on the target machine without claiming a universal FPS guarantee.

## Risks / Trade-offs

- Smooth movements can contradict short stages -> authoritative state wins and cosmetic transitions snap when needed.
- Many people can obscure queues -> group arrangement, camera controls and inspectors preserve comprehension without dropping entities from the model.
- GPU availability varies -> non-3D workflows remain functional and unsupported graphics are reported.

## Migration Plan

Integrate inside 04's replay host after verifying the portable trace. Engine contracts and scientific results remain unchanged. No remote asset service or deployment.

## Open Questions

None blocking the agreed stylized view. A measured real-shop layout would be a separate enhancement requiring references.
