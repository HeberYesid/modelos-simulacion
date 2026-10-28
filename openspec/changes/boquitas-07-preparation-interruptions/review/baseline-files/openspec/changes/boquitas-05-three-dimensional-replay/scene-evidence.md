# Spec 05 scene evidence

## Browser checks

- `pnpm --dir web test:e2e --grep "renders the immutable|distinguishes released"` passed 2 real-browser tests. They open runs returned by the local API, compare WebGL canvas frames across replay states, exercise customer/order inspection and playback lifecycle, distinguish released from reserved workers, and lose the actual WebGL context before checking the non-3D fallback and retry.
- `pnpm --dir web test:e2e --grep "shape-valid run"` passed 1 real-browser test. A run with a malformed event sequence passes the API's shape validation, then the UI reports the replay-contract error and preserves the previously selected run, time, and person.
- `pnpm --dir web test:e2e --grep "camera zoom, orbit, and reset"` passed 1 real-browser test after the camera fix. It checks that zoom, reset, and pointer orbit change captured canvas pixels and that none produces a browser `pageerror`.
- The camera test first failed as intended: three zoom clicks generated `RangeError: Maximum call stack size exceeded` from `OrbitControls.update()` re-entering the `change` handler, and the canvas pixels did not change. Removing `controls.update()` from the render callback broke that cycle; the change listener now renders the scene directly. OrbitControls damping is disabled, so this does not require another animation loop.

The parent task subsequently confirmed the frontend unit suite (21 tests), typecheck, and production build passed. At the time this evidence was updated, the full 12-test browser suite was still running; the first 8 had passed, including the real WebGL context-loss fallback. The production build reports Vite's existing large-chunk warning for the Three.js bundle (>500 kB); the build itself succeeds.

## Visual artifacts

The review directory contains browser captures of the rendered shop and replay states:

- `review/main-motion-a.png`, `review/main-walking-a.png`, and `review/main-walking-b.png` show actual WebGL frames with worker/task and customer states. These are visual snapshots, not a video recording.
- `review/main-regular-reserved.png` captures the regular-mode pending transfer state; `review/main-final-delivery.png` captures the delivery state.
- `review/main-context-lost.png` shows the unavailable-scene fallback while the timeline, latest-event summary, result metrics, and entity inspector remain usable. Context loss was also exercised through the browser's `WEBGL_lose_context` extension.
- `review/main-camera-fixed.png` was captured after the camera fix and shows the changed zoomed view. `review/main-mobile-final.png` was captured after resizing to a 390px viewport and shows the WebGL shop rendered in the responsive layout.
- `review/main-camera-zoom.png`, `review/main-camera-closer.png`, and `review/main-camera-closest.png` were captured before the camera fix and show the regression (identical scale). They are retained as regression evidence and do not demonstrate the corrected camera. The passing camera test above verifies the corrected behavior.
- `review/main-mobile.png` predates the camera fix and has a blank canvas after the recursion errors. It is superseded by `review/main-mobile-final.png` and is not responsive acceptance evidence.

No video was recorded because FFmpeg was unavailable in the review environment. The evidence is based on actual browser rendering, screenshots, state changes, and automated pixel comparisons.

Final main-agent acceptance: 21 unit tests and all 12 real-browser workflows passed, along with typecheck and production build. Post-fix camera/mobile screenshots were independently inspected. See verification-report.md; earlier pending-check statements above record their historical checkpoint.
