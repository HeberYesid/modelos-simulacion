# Windows x64 portable release verification — 2026-10-28

The user requested a package for demonstrating Boquitas on another computer and confirmed Windows 10/11 x64 as the destination. The release contains the Python runtime, native numerical libraries, production web assets, a CMD launcher, a Spanish guide, two synthetic scenarios, third-party notices and a file checksum manifest. Destination installation of Python, Node.js, uv or pnpm is not required.

## Delivered artifact

- Local ZIP: `dist/Boquitas-Windows-x64.zip` (ignored build output).
- Size: 61,424,826 bytes.
- ZIP SHA-256: `0b8a4ba71ca3fd21882c335263f2d59ddbdc7d93d9b981632c50985541007224`.
- Extract the entire ZIP; open `INICIAR_BOQUITAS.cmd` in the extracted folder.
- Spanish instructions: [portable presentation guide](../user/guia-portable.md), also packaged as `LEEME.txt`.

No simulation, API or frontend production source was changed. Existing locked package versions were preserved; a separate pinned `release` dependency group adds PyInstaller 6.22.3 and its build dependencies. Existing root `package.json`, `pnpm-lock.yaml` and `node_modules/` were already untracked and were left untouched.

## Build and reproducible checks

Build from Windows with an x64 Python 3.13 environment:

```powershell
.\build-portable.ps1
```

The script installs from frozen Python/frontend locks, builds web assets, generates the onedir application and checksum manifest, then creates the ZIP. Initial dependency downloads can require internet on the build host. Existing release outputs are preserved; select a new output directory with `-OutputDirectory` to build again. The script validates the Python architecture and refuses incompatible builds. The destination launcher does not install, compile or download anything.

The actual ZIP was extracted outside the repository, under a separate folder whose name contains spaces and an accented character. Its executable was launched with a working directory outside the bundle and an environment whose PATH contained only Windows System32; Python-specific variables, virtual-environment variables and proxy configuration were absent.

```powershell
.\.venv\Scripts\python.exe scripts/check_portable.py <extracted-folder> --report <report.json>
```

Observed results are retained in [API/package acceptance](portable-release-2026-10-28/api-acceptance.json):

- All 310 checksummed files verified, including runtime DLLs and static assets.
- Health endpoint and both compiled web assets served locally.
- Tuesday V1 run exactly matched the compact HTTP reference SHA-256 `f854666a3bec3133f772a01292f514dfa6ab6b8716d65f654c9830f3b784053c` and matched the complete scientific values of the preserved indented reference, whose SHA-256 remains `8bbe6b117f59dde367816d8ed63bb013b0ad624d916a57159c084fcff4051dd7`. The different hashes represent the existing compact/indented serializations.
- Normal mode, the V2 pause scenario, JSON save/reopen, CSV export and synthetic observation import succeeded.
- Two scenarios with 30 replications each completed, exercising the packaged numerical/statistical dependencies.
- Two start/stop cycles released their port. A deliberately occupied port produced an actionable error while preserving the existing listener.
- The extracted CMD launcher successfully found the executable and forwarded `--help`.

## Browser and visual checks

Six existing production browser workflows passed against the extracted executable on port 8001. A disposable copy changed only test paths/origin/evidence destinations, preserving the historical tests and reports. It covered import/corrections, Tuesday/normal modes, 30-replication comparison and indexed inspection, staffing changes, JSON/CSV round trips, replay, playback/camera controls and repeated replay mounts.

One additional browser case loaded `ejemplos/pausa-programada-v2.json` from the extracted ZIP. It verified A/B completion at 14/17 seconds, the paused state at 6 seconds, the paid waiting state at 8 seconds and an available WebGL renderer. The two scene captures were directly inspected: [6 seconds](portable-release-2026-10-28/v2-at6-scene.png), [8 seconds](portable-release-2026-10-28/v2-at8-scene.png).

All seven browser cases blocked external HTTP(S), observed zero external attempts and used the packaged localhost server. The [network audit](portable-release-2026-10-28/browser-network-audit.json) retains per-case results. This browser restriction does not mean the host network adapter was disabled.

## Other observed verification

- Test-first source launcher checks: 3 failed before the entry point existed; 3 passed after implementation. They cover startup from another working directory/restart, busy-port preservation and missing frontend diagnostics.
- Final Python run: **260 passed, 2 deselected**. The two unchanged legacy launcher cases require port 8000, which was already occupied by a pre-existing listener (PID 19340). The initial unrestricted attempt produced 257 passed, one bind failure and one skip for that reason. That process was left intact. The new portable launcher's corresponding behaviors were independently tested on available ports.
- Frontend: **37 tests passed**; TypeScript and generated contract checks passed.
- Ruff passed; mypy passed for all 15 application source files; API/fixture export drift check passed.
- All seven existing OpenSpec changes passed strict validation. No new SDD package was introduced.
- Frozen lock freshness, preservation of all prior locked versions, PowerShell parsing, the x64 builder prerequisite and final whitespace/diff checks passed.
- A first sandboxed build attempt could not open pnpm's AppData operation lock. The actual successful build and Windows runtime checks ran with the approved local execution escalation. No security policy was changed.

## Remaining boundary

This verifies a relocated, extracted bundle on the build host. A second physical computer, its institutional execution policy, browser/GPU driver, projector and the destination network-disconnected workflow have not been tested. Use the guide's checklist on the destination before the defense. Windows ARM64/x86, macOS and Linux are outside this artifact's target. Keep the complete folder, including `_internal`.

The package contains only synthetic examples, not the field source files. Software verification does not establish model calibration or empirical validation. No commit, push, PR, deployment, source synchronization or OpenSpec archive was performed.
