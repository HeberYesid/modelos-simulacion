# REL-01 launcher evidence

Observed on Windows PowerShell with Python 3.13.7.

- RED: Before implementation, `uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_launcher.py -q` reported 3 failures because `start-boquitas.ps1` was absent: no setup/port diagnostic and no local health response. That run also exposed sandbox-denied temporary-directory cleanup; the setup case was rerun with the authorized temporary-fixture runner.
- GREEN: The same focused command passed 3 tests in 5.90 seconds with the authorized temporary-fixture runner. It checked the missing-build instruction, confirmed a bound port-8000 listener remained available, and completed two `-NoBrowser` start/health/`CTRL_BREAK_EVENT`/port-release cycles.
- Static checks: `uv --cache-dir .uv-cache run --frozen --offline ruff check .` passed; `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas` reported no issues in 14 source files.
- The launcher checks the local Python and built frontend, starts only `.venv\Scripts\python.exe -m boquitas` on `127.0.0.1:8000`, and opens the default browser after the versioned health response succeeds. The automated test uses `-NoBrowser`; literal Ctrl+C and default-browser behavior remain for main-agent acceptance.

## Main-agent closure

The main agent independently ran the full 131-test Python suite, including these three launcher checks, with no skips. Actual PTY startup with `-NoBrowser` returned health200; literal Ctrl+C logged completed Uvicorn shutdown and freed port8000. A second startup without `-NoBrowser` returned health200 before the default browser requested the production HTML, JS, CSS and demo endpoint, all200. Windows PowerShell also returned the occupied-port diagnostic while the live server remained available. The final literal Ctrl+C stopped that server; neither 8000 nor 5173 had a listener at closure. Execution policies remained RemoteSigned for CurrentUser and LocalMachine, unchanged from the initial check.
