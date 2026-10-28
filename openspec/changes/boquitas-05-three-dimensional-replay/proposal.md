## Why

The user needs to see the shop, arriving people, queues and order preparation. The animation must explain the same simulation history used for metrics, so playback cannot generate its own arrivals or service outcomes.

## What Changes

- Build a locally available stylized shop with distinct arrival, payment, waiting and preparation areas.
- Render individual people linked to orders and workers with visible idle, working and transfer-reserved states.
- Add deterministic play/pause, speed, timeline seeking, camera controls and entity inspection.
- Dependencies: 01 event/resource contracts, 03 portable run results and 04 browser host.
- Non-goals: photorealism, an exact surveyed floor plan, product recipes, partial deliveries, physical walking-time modeling and changes to motor outcomes.

## Capabilities

### New Capabilities

- `three-dimensional-replay`: inspectable 3D rendering of an immutable simulated history.

### Modified Capabilities

None.

## Impact

Future Three.js scene, replay projection and UI integration. Adds a pure public `project_replay(trace, time_s)` behavior and playback controls. Does not modify engine event or metric meanings.
