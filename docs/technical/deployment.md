# Public deployment

The public profile runs the existing Python simulation engine and the built browser
application together in one container. The current source preloads the two measured
visits and explicitly exploratory scenarios; this does not imply calibration or
empirical validation. It is a working application,
not a static recording of results.

Live instance: [Boquitas](https://boquitas-simulacion.onrender.com).
See the [publication verification record](../verification/public-deployment-2026-11-03.md).

## Build and runtime

`Dockerfile` installs the locked Python and frontend dependencies in separate build
stages. The final image contains the Python environment, `src/boquitas`, and the
public frontend bundle. It runs as an unprivileged user and serves the API and
frontend on one origin. No database is required by the current application.

```powershell
docker build --tag boquitas-public .
docker run --rm --publish 127.0.0.1:10000:10000 --env PORT=10000 boquitas-public
```

Open <http://127.0.0.1:10000>. Health is available at `/api/v1/health`.
The hosting platform supplies HTTPS and forwards requests to `0.0.0.0:$PORT`.
Retain one Uvicorn worker and one instance: execution cancellation, the one-active-run
limit, and execution history are process-local. Multiple workers/instances require
a separate coordination design. The container caps concurrent HTTP connections at
16; this is not per-client rate limiting or an authentication system.

The source tree remains at `/app/src` and is on `PYTHONPATH`. This preserves the
existing automatic lookup of `/app/web/dist`; moving the package to site-packages
without changing that lookup can leave the frontend unavailable.

## Public data profile

The frontend is built with `VITE_PUBLIC_DEMO=true`. Both public and local profiles
include the 119 corrected Tuesday records and 16 Friday records, native importer
audit reports, measured replay, and two editable exploratory scenarios. Reports are
bundled and displayed without uploading files or calling the import endpoint.
The public profile discloses remote processing for simulations and new uploads;
the local profile retains local processing labels.

`.dockerignore` uses an allowlist and includes the measured JSON, audit reports and
the one scenario template required by the application. Academic documents, field sources, tests, Git metadata,
assistant resources, caches, environment files and local builds are not Docker
inputs. The runtime image receives only the application and the public bundle.
This does not remove files from the source Git repository: a Git-based hosting
provider can clone the linked repository. Repository access and pushing changes
must be authorized separately.

Regenerate and verify the bundled records/reports from hash-verified field sources:

```powershell
uv run python scripts/export_observed_visits.py --reports-output web/src/replay/visit-import-reports.json
uv run python scripts/export_observed_visits.py --reports-output web/src/replay/visit-import-reports.json --check
```

Scenario defaults use the observation window and reported staffing, an exponential
interarrival mean from successive cashier arrival marks (including withdrawals),
and constant payment/preparation proxies equal to mean completed elapsed windows.
These windows are not active-work measurements. Groups of one, empty initial
state, no abandonment and no external transfer delay are explicit assumptions.
Tuesday station links, unknown opening work, worker assignments and Friday pause
boundaries are not reconstructed. Actual measured replay remains independent of
simulation outputs. Selecting a visit scenario preserves existing edits.

The 2026-11-03 publication record describes the earlier synthetic-only release;
these source changes require a separately authorized publication before the live
instance can be described as containing the preloaded visits.

Visitors can upload files to the existing API. In this profile those files travel
to the remote server for processing. Use synthetic files for public demonstrations.
The application does not implement a persistent user-file store or accounts;
multipart processing may use framework-managed temporary files. Hosting request
logs and operational retention are governed by the provider. Download desired
results; unsaved browser state is lost when the page is refreshed.

## Render

`render.yaml` declares one Docker web service on the Free plan in Virginia, with
`/api/v1/health` as its HTTP health check. Automatic redeploys are disabled so a
future Git push does not itself publish another version.

The current service was created through the Render integration, whose create
operation does not expose `healthCheckPath` and does not automatically apply the
Blueprint. Its platform health check therefore uses the default configuration;
the public `/api/v1/health` endpoint was separately verified with HTTP 200.
Use the Blueprint workflow when configuring that HTTP path on a new service.

After local acceptance and explicit confirmation of the Render workspace and
Git publication operation, publish the reviewed deployment files to the approved
repository/branch and create the service using the Blueprint or Render integration.
Use the repository root as Docker context and `./Dockerfile` as the Dockerfile.
Wait for the deployment to be live before reporting a public URL, then check the
home page, health, synthetic demo, and a completed simulation on that URL.

The Free service can sleep after 15 minutes without inbound traffic and take about
one minute to wake. Its filesystem is ephemeral. Render currently grants 750 free
instance hours per workspace per month. These limits can change; verify them
before publication. Small demonstration runs are appropriate; the free instance
has not been load-tested for sustained multi-user simulation workloads.

References: [Render web services](https://render.com/docs/web-services),
[Free instances](https://render.com/docs/free),
[Blueprint fields](https://render.com/docs/blueprint-spec),
[FastAPI containers](https://fastapi.tiangolo.com/deployment/docker/), and
[uv Docker integration](https://docs.astral.sh/uv/guides/integration/docker/).
