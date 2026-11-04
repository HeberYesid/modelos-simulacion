# Public deployment verification — 2026-11-03

Baseline: clean tracked worktree at `35aaae5` before this request. The user requested
internet publication of the complete project if possible, otherwise a demonstration
with test data. This record covers deployment preparation and the completed
publication below. It does not establish empirical model validation.

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
| Docker image build/run | Passed on Render; local Docker engine could not initialize |
| Public HTTPS deployment | Live; health, home and both bundled assets returned HTTP 200 |

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
alone verify a Linux image, cloud build, internet reachability, or production load.
The subsequent public deployment checks below verify the cloud image and public
runtime, but no production load test was performed.

The implementation agent reported an observed failing public-disclosure test
before editing the UI, followed by two passing focused tests. The main agent
independently ran the complete frontend suite and reviewed the changes.

## Completed publication

Render is available in the session. The user explicitly confirmed workspace
`Heber` and authorized commit/push to `main` and creation of the Free Render
service using the project's current Git connection. The existing
Git remote is `https://github.com/HeberYesid/modelos-simulacion.git`, branch `main`.

- Public URL: <https://boquitas-simulacion.onrender.com>.
- Deployed application commit: `2d9204961dab520a9a229b01f8ac55bcfed22ddb`.
- Render service: `srv-dblam10n74is739imqlg`.
- Deployment: `dep-dblam1on74is739ims40`, status `live`.
- Deployment finished: 2026-11-03 at 22:49:46 UTC-05:00.
- Actual service: Free plan, Virginia, one instance, automatic deployments off.
- The integration did not set the optional HTTP health-check path; the Blueprint
  declares it, while the actual service retains its default platform check.
  `/api/v1/health` was independently requested and returned the expected JSON.

An independent agent fetched the HTTPS home page, health and both assets, scanned
the public bundle against the same 140 measured identifiers/hashes (zero matches),
then submitted only a remote-demo-derived synthetic 600-second scenario. It
returned 9 orders and 56 events; CSV export returned 6 nonempty tables. No measured
source data was uploaded. The main agent separately used the real public page to
execute the default scenario, observed the results and synthetic label, and visually
checked its 3D replay at 900 seconds. The cloud screenshot is local scratch evidence
at `.tmp/publication-20261103/cloud-replay.png`.

The final documentation update is a separate source commit. It changes no Docker
inputs or application behavior, so the deployed application remains the commit
listed above; automatic deployment is intentionally disabled.

The Free service is for small public demonstrations: it can sleep when idle,
results are not persisted as user accounts, and concurrency/load capacity has not
been validated under production traffic. The container keeps one worker because
execution coordination is process-local. See [deployment guidance](../technical/deployment.md).
