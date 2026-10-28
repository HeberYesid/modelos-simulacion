
## 2026-10-28 — Completed: photo-based Boquitas 3D facade

- Status: IMPLEMENTED after the user explicitly said “hazlo” on 2026-10-28.
- Request: improve the ice cream shop's existing 3D model inside the software so it resembles the original shop, using the two supplied photographs.
- Reference details: Boquitas sign, beige awning, green frame and yellow posts, light rolling shutters, brick/beige facade, red brick sidewalk, and rows of terracotta plant pots. Photographs show the exterior; interior details and exact dimensions are not established.
- Preserved references: [Front view](references/boquitas-3d-2026-10-28/facade-front.png) and [Angled view](references/boquitas-3d-2026-10-28/facade-angle.png).
- Changed only web/src/replay/scene.ts for the facade, materials, pots and responsive camera. Engine/replay history unchanged by this task. Local web build updated; existing portable ZIP packages were not rebuilt by this task. Verification and screenshots: docs/review/boquitas-facade-2026-10-28/verification.md.
## 2026-10-28 — Payment simplification completed

- User approved removing transfer-confirmation waits and displaying only cash/transfer. New app runs/experiments normalize confirmation to zero; historical saved runs and the deterministic engine preserve legacy timing.
- Methods are recorded on demand/initial inputs independently of duration. Unknown legacy methods remain unknown. Evidence: `docs/verification/payment-simplification-2026-10-28.md` and `payment-simplification-portable.json`.
- Verified: 266 Python tests, 39 frontend tests, two focused browser flows, types/build/contracts and actual portable execution. Updated ZIP: `dist/pagos-simplificados-20261028/Boquitas-Windows-x64.zip`; previous package retained.
