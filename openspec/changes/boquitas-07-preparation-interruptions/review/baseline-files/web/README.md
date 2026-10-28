# Local web application

For installation and normal operation, see the [technical guide](../docs/technical-guide.md), [Spanish quick guide](../docs/guia-de-uso.md) and [full Spanish user manual](../docs/MANUAL_USUARIO.md). The [acceptance report](../docs/acceptance-report.md) records actual verification and remaining empirical limits.

Run commands from the repository root. Python dependencies are locked in `uv.lock`; frontend and browser-test dependencies are locked in `web/pnpm-lock.yaml`.

## Production bundle

```powershell
uv --cache-dir .uv-cache sync --frozen
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
.\start-boquitas.ps1
```

Open [the local application](http://127.0.0.1:8000). The default launcher binds to loopback and serves the API and built assets from the same origin. After installation and build, normal operation requires no internet connection. Stop the foreground server with Ctrl+C.

The launcher checks the installed Python, production build and port8000 before starting. It opens the default browser after health succeeds. Use `-NoBrowser` to suppress browser opening, or `.\.venv\Scripts\python.exe -m boquitas` for direct startup. Run under the existing PowerShell execution policy; use direct Python if policy blocks the script.

## Development

Start the same Python command in one terminal and `pnpm --dir web dev` in another. Open the Vite URL on `127.0.0.1:5173`; `/api` is proxied to the Python service on port 8000. No CORS or external asset service is needed.

## Verification

```powershell
uv --cache-dir .uv-cache run --frozen pytest
uv --cache-dir .uv-cache run --frozen ruff check .
uv --cache-dir .uv-cache run --frozen mypy src/boquitas
uv --cache-dir .uv-cache run --frozen python scripts/export_web_contracts.py --check
pnpm --dir web contracts:check
pnpm --dir web test --run
pnpm --dir web typecheck
pnpm --dir web build
pnpm --dir web test:e2e
pnpm --dir web exec tsc --noEmit -p tsconfig.release.json
```

On a new test machine, install Chromium once with `pnpm --dir web exec playwright install chromium`. Playwright runs the real local API and Vite proxy; it reuses services already running on the configured ports.

For production/offline acceptance, first start `.\start-boquitas.ps1 -NoBrowser` in a separate console, then run `pnpm --dir web exec playwright test --config playwright.release.config.ts`. That suite uses only the built production origin, starts no Vite server or dependency resolver, blocks external HTTP(S) and writes a network audit for each test. Stop the launcher with Ctrl+C afterward. Run Python launcher tests with port8000 free.

## Contracts and state

The backend reuses the approved domain operations. `scripts/export_web_contracts.py` generates the OpenAPI document and deterministic domain examples. Run `pnpm --dir web contracts:generate` after an intentional schema update; the corresponding check detects stale generated TypeScript types.

Observations provide auditable evidence and never calibrate scenario parameters automatically. Completed results retain their submitted scenario, seed, trace and metrics when the editable draft changes. JSON and CSV are explicit local downloads; unsaved in-memory work is lost on refresh. Uploaded files are limited to 10 MiB. The browser rejects integer tokens beyond JavaScript's safe range instead of silently rounding them; supported opened JSON files retain their original bytes for re-export.

Spec05 adds a procedural Three.js shop driven solely by the saved engine trace, with play/pause, restart, 1/5/20/60x speeds, full-drain seeking, camera orbit/zoom/reset and person/order inspection. Playback starts paused. Tables and the timeline remain available without WebGL; reduced motion disables decorative walking and gestures. The layout is illustrative. See the [spec05 independent review](../openspec/changes/boquitas-05-three-dimensional-replay/verification-report.md). The prior [spec04 report](../openspec/changes/boquitas-04-local-web-app/verification-report.md) retains its historical results.
