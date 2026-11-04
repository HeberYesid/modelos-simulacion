# Public deployment

The public profile runs the existing Python simulation engine and the built browser
application together in one container. It uses synthetic demonstration scenarios;
it does not imply calibration or empirical validation. It is a working application,
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

The frontend is built with `VITE_PUBLIC_DEMO=true`. This profile excludes the bundled
measured-visit archive and its replay controls, keeps simulation-based 3D replay,
and discloses remote processing. The default local build retains its existing
measured-visit archive and local processing labels.

`.dockerignore` uses an allowlist and excludes the measured JSON even from the
Docker build context. Academic documents, field sources, tests, Git metadata,
assistant resources, caches, environment files and local builds are not Docker
inputs. The runtime image receives only the application and the public bundle.
This does not remove files from the source Git repository: a Git-based hosting
provider can clone the linked repository. Repository access and pushing changes
must be authorized separately.

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
