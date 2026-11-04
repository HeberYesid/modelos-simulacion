# Public deployment preparation — 2026-11-03

Baseline: clean tracked worktree at `35aaae5` before this request. The user requested
internet publication of the complete project if possible, otherwise a demonstration
with test data. This record concerns deployment preparation, not empirical model
validation. No commit, push, or cloud deployment has been performed at this checkpoint.

## Prepared changes

- One container serves the existing Python engine/API and built frontend together.
- Render Blueprint: Free plan, Virginia, HTTP health check, automatic redeploys off.
- `VITE_PUBLIC_DEMO=true` selects a synthetic public presentation without the
  bundled measured-visit archive; the local build retains its existing archive.
- Public copy discloses server-side simulation and upload processing.
- Docker build inputs are allowlisted; source observations and academic files are
  excluded from that context. A hosting provider cloning the Git repository can
  still read repository contents; `.dockerignore` does not restrict Git access.
- No engine, statistical model, API schema, dependency lockfile or measured JSON
  was intentionally changed.

## Independently observed checks

| Check | Result |
| --- | --- |
| Python suite, 299 collected | 297 passed, 1 failed, 1 skipped |
| Python failure/skip | Windows launcher tests require port 8000, already occupied |
| Ruff | Passed |
| mypy | Passed, 17 source files |
| Python contract/fixture drift | Passed, 8 files |
| Frontend OpenAPI declarations | Passed |
| Frontend unit suite | Passed, 124 tests in 26 files |
| Application and release TypeScript checks | Both passed |
| Existing OpenSpec changes | Passed, 7 of 7 |
| Default local production build | Passed; measured visit identifier retained |
| Public build without measured JSON | Passed from an isolated source copy with that JSON absent |
| Public bundle scan | Passed: 140 real visit/record identifiers and source hashes absent; no measured replay controls |
| Public HTTP workflow | Passed: health, home, 2 static assets, synthetic run and 6 CSV tables |
| Public browser workflow | Passed: starts on Escenarios, executes a run, shows results and 3D replay at 900 s, hides measured replay and discloses remote upload processing |
| Docker image build/run | Not verified: local Docker engine did not initialize |
| Public HTTPS deployment | Pending |

The initial restricted Python run hit Windows temporary-directory access errors.
The subsequent full run used an explicitly fresh project scratch directory and
approved subprocess access; the remaining failure/skip are due to port 8000, not
assertions about changed application behavior. The occupied service was preserved.
Vite/Vitest also required approved local subprocess access after `spawn EPERM`.
The successful local build reported the existing large-chunk warning; no warning
threshold or test assertion was weakened.

The main agent built both profiles into separate scratch directories, preserving
the existing `web/dist`. The default local bundle retained a real visit identifier;
the public bundle contained none of the 140 checked measured identifiers/hashes.
Public runtime checks used the actual Python app with the public bundle on port
10000. A real browser rendered the 3D canvas (921 by 605 pixels), sought to 900 s,
and displayed the server-processing disclosures. The screenshot is local scratch
evidence at `.tmp/publication-20261103/public-replay.png`. These checks do not
verify a Linux image, cloud build, internet reachability, or production load.

The implementation agent reported an observed failing public-disclosure test
before editing the UI, followed by two passing focused tests. The main agent
independently ran the complete frontend suite and reviewed the changes.

## Publication boundary

Render is available in the session. The user explicitly confirmed workspace
`Heber` and authorized commit/push to `main` and creation of the Free Render
service using the project's current Git connection. The existing
Git remote is `https://github.com/HeberYesid/modelos-simulacion.git`, branch `main`.
Do not report a public URL until the service is actually deployed and checked.

The Free service is for small public demonstrations: it can sleep when idle,
results are not persisted as user accounts, and concurrency/load capacity has not
been validated under production traffic. The container keeps one worker because
execution coordination is process-local. See [deployment guidance](../technical/deployment.md).
