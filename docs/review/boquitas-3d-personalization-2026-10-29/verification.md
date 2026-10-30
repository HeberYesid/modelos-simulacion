# Boquitas 3D personalization

Final independent review: 2026-10-30. Work began on 2026-10-29.

## Authorized scope

Improve the shop, characters and service actions in the existing 3D replay without changing simulation rules, times, events or metrics. Preserve the photo-based exterior and keep service counters inside the shop.

Implementation changes are confined to `web/src/replay/scene.ts`. `web/e2e/shop-personalization.spec.ts` adds three browser checks for the public replay and saved-result boundaries. Existing unrelated work was preserved.

## Applied changes

- Tiled floor and backsplash, interior Boquitas plaque, illustrative display case, shelf, cups and utensils. Interior fittings and uniforms are visual interpretations; the supplied photographs establish exterior references, not measured interior geometry or equipment capacity.
- Instanced customer heads, hair, eyes, shirts, arms, hands, trousers and shoes. Appearance is deterministic by ID, with shared-order colors and visual spacing for group members.
- Worker caps, aprons, badges and hands, with payment and preparation poses derived from their existing replay states. A representative cup and utensil illustrate preparation without introducing recipes or product inputs.
- A brief delivery marker uses existing `order_delivered` events and the simulation clock. Binary lookup supports seeking without scanning the complete history each frame. No simulation stage, service duration or delivery delay was added.
- The interior cutaway hides the exterior canopy/sign and upper facade so the service floor remains visible. Facade view restores them. A higher interior camera makes people and counters visible; the interior plaque uses a world-aligned texture so its text is not clipped by the wall.
- Reduced motion, pause, reverse seek, camera controls, picking and resource disposal remain supported.

SHA-256 comparisons with the pre-change files confirmed that `web/src/replay/project.ts`, `clock.ts` and `host.ts` were unchanged. Final scene SHA-256: `EC41E2E418E0248C288DA7DE91306D136CEBB8A3EB6C63DE911FFF70DFEA09CD`.

## Observed verification

| Check | Observed result |
| --- | --- |
| `pnpm --dir web build` | Passed; local `web/dist` updated. Final JavaScript bundle 790.34 kB, 206.00 kB gzip. The existing warning for chunks above 500 kB remains. |
| `pnpm --dir web typecheck` | Passed after the final visual correction. |
| `pnpm --dir web test --run` | 81 tests passed across 19 files after the final correction. |
| Focused browser workflows against the compiled application | 10 passed, including the three new tests. |
| `git diff --check -- web/src/replay/scene.ts` | Passed. |
| Actual desktop/mobile screenshot inspection | Completed for the final interior, facade, service/delivery and interrupted-preparation views. |

The browser selection covers immutable traces and repeated mounts, camera zoom/orbit/reset, current transfers, legacy transfer reservations, actual WebGL context loss and recovery, malformed-trace rejection, facade/interior state preservation, Tuesday and regular service checkpoints, saved JSON equality, deterministic reverse seeks, and reduced-motion V2 pauses at a 390-pixel viewport.

The final browser command used the ignored `.tmp/boquitas-3d-personalization/playwright.config.ts`, `BOQUITAS_REVIEW_URL=http://127.0.0.1:8000`, `BOQUITAS_REVIEW_OUTPUT=accepted-browser-results`, and a 90-second test timeout. Test selection:

```powershell
pnpm --dir web exec playwright test shop-personalization.spec.ts shop-views.spec.ts local-workflows.spec.ts --grep 'artwork|reduced motion and mobile|interior and facade|immutable engine trace|camera zoom|legacy released|new transfers|nonmonotone trace|without WebGL' --timeout 90000 --config ../.tmp/boquitas-3d-personalization/playwright.config.ts
```

An earlier run on 2026-10-30 had nine passes and one local API `ECONNRESET` during repeated replay mounting. The complete final selection subsequently passed without changing or weakening its assertions. Earlier development-server checks were interrupted by unrelated live reloads. The final checks used the compiled application. The approval-system usage limit that prevented the last build on 2026-10-29 was resolved before the successful final build and review.

## Visual evidence

- [Final interior with active customers](final-interior-viewport.png)
- [Final facade](final-facade-viewport.png)
- [Final delivery checkpoint](final-tuesday-delivery.png)
- [Final mobile interrupted preparation](final-mobile-paused.png)
- `final-regular-*.png` and `final-tuesday-*.png`: final automated service checkpoint captures.

`before-*` files preserve the baseline. `after-*` and `review-*` files document intermediate review, including the rejected framing where the exterior sign blocked service and unsuccessful element-only captures. They are not final acceptance images.

The built local application includes these changes. Portable executables and ZIPs were not regenerated. No commit, push, pull request, deployment, synchronization, empirical calibration or empirical validation was performed by this task.
