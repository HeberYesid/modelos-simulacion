# Boquitas photo-based facade — 2026-10-28

User explicitly resumed the saved task with “hazlo”. Implementation: `web/src/replay/scene.ts`.

- Added beige/brick upper facade, white-framed windows, pale roller shutters and door, beige sloping awning, green steel frame, yellow posts, outlined Boquitas lettering, tiled sidewalk and two groups of terracotta pots.
- Replaced the generic enclosure and entry booth; retained operational station and entity positions, immutable trace handling, controls and resource cleanup. All four added canvas textures and associated materials/geometries participate in disposal.
- Camera framing now adapts to narrow viewports. Facade references are the two user photos in `memory/references/boquitas-3d-2026-10-28/`. Dimensions, interior and operating layout remain illustrative.

## Observed verification

- `pnpm typecheck`: passed after final camera adjustment.
- `pnpm test --run`: 39 tests passed in 16 files after facade implementation; later changes were static floor/planter placement and camera framing only.
- `pnpm build`: passed after final adjustment; warning remains for the roughly 753 kB minified JavaScript bundle. No new dependencies or remote assets.
- Existing browser tests: 5 passed covering immutable replay/shared groups/repeated loads/reduced motion, camera, WebGL-unavailable offline fallback, real context loss/retry and invalid-trace preservation. Replayed the immutable-trace and camera tests after floor/planter refinement (2 passed); reran camera test after final responsive framing (1 passed).
- `openspec validate --changes --strict --no-interactive`: 7 passed; no specification files modified.
- `git diff --check -- web/src/replay/scene.ts`: passed.
- Actual browser visual inspection: before-wide.png, final after.png, and mobile.png at 390×844. Final desktop screenshot is from the compiled application served at localhost:8000; browser reported no JS errors.

No backend test suite was run by this task because it changes scene presentation only. Other concurrent payment changes were preserved and are outside this verification claim. Portable ZIP/executable packages were not rebuilt; the local `web/dist` bundle was rebuilt. No commit, push, PR or deployment.
