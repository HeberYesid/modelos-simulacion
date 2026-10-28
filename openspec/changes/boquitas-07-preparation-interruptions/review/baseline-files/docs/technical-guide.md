# Boquitas technical guide

This guide describes the installed Windows application and its local operating path. See the [acceptance report](acceptance-report.md) for observed checks, environment, evidence and limitations.

For the complete Spanish workflow, see the [user manual](MANUAL_USUARIO.md). The [local web application guide](../web/README.md) retains the existing development, contracts, and verification commands.

## Scope and supported environment

Boquitas runs a discrete-event simulation for explicitly configured scenarios. It does not infer scenario parameters from imported observations. All example defaults below are synthetic teaching inputs, not estimates of the real shop.

The supported Python line is pinned to 3.13 by `.python-version`, `pyproject.toml`, and `uv.lock`. The frontend's exact dependency resolution is recorded in `web/pnpm-lock.yaml`. The following versions were observed in the inspected Windows workspace on 2026-10-23; they describe that workspace, not a promise that other machines already have the same tools installed.

| Tool | Observed version |
| --- | --- |
| Python | 3.13.7 |
| uv | 0.9.26 |
| Node.js | 24.17.0 |
| pnpm | 11.18.0 |
| Frontend lockfile format | pnpm 9.0 |

The installed Python package versions below matched `uv.lock`; `uv lock --check --offline` passed during this documentation check.

| Python package | Locked and installed |
| --- | --- |
| fastapi | 0.160.0 |
| numpy | 2.5.4 |
| pydantic | 2.14.1 |
| python-multipart | 0.0.32 |
| scipy | 1.18.1 |
| simpy | 4.1.2 |
| uvicorn | 0.54.0 |
| pytest | 9.1.1 |
| ruff | 0.17.1 |
| mypy | 2.4.0 |

The installed direct frontend dependencies matched the versions under the `.` importer in `web/pnpm-lock.yaml`.

| Frontend package | Locked and installed |
| --- | --- |
| three | 0.186.1 |
| @playwright/test | 1.64.1 |
| @types/node | 24.19.2 |
| @types/three | 0.186.0 |
| happy-dom | 20.14.6 |
| openapi-typescript | 7.13.0 |
| typescript | 5.9.3 |
| vite | 8.3.5 |
| vitest | 4.1.12 |

## Install and build

Open PowerShell in the repository root. The initial dependency installation and the production asset build may require internet access. These steps are separate from normal runtime.

```powershell
uv sync --frozen
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
```

`uv sync --frozen` uses the existing Python lock without updating or checking whether it is current; `uv lock --check` is the separate freshness check. `pnpm install --frozen-lockfile` fails if the pnpm lock is absent or inconsistent and does not update it. `pnpm build` creates the local production assets in `web/dist`. The runtime launcher must not install packages, rebuild assets, or fetch assets from a CDN. See the official [uv project synchronization documentation](https://docs.astral.sh/uv/concepts/projects/sync/#automatic-lock-and-sync) and [pnpm install documentation](https://pnpm.io/cli/install) for these options.

## Start, stop, and restart

After dependencies and the production bundle are present, run the root launcher in the foreground:

```powershell
.\start-boquitas.ps1
```

Add `-NoBrowser` to start the local service without opening the default browser:

```powershell
.\start-boquitas.ps1 -NoBrowser
```

The direct Python entry point is also documented for diagnosis or when the launcher is unavailable:

```powershell
.\.venv\Scripts\python.exe -m boquitas
```

The service address is `http://127.0.0.1:8000`. Keep the PowerShell window open while using the application. Press **Ctrl+C in that same window** to stop the foreground server. Close the browser tab separately. To restart, start the command again and confirm the local service responds; do not kill an unrelated process to release port 8000.

Do not weaken PowerShell execution policy to run the launcher. If local policy blocks the script, use the direct Python entry point or have the script signed/approved under the existing policy. Do not use an execution-policy bypass.

## Import observations without changing their meaning

The importer accepts UTF-8 CSV or TXT text up to 10 MiB. The documented header is:

```csv
lugar,fecha,tipo_dia,personal,id,hora_llegada,hora_inicio,hora_fin,hora_se_fue
```

Choose **Sin correcciones** for an unrecognized source. Select the approved Boquitas correction profile only for its recognized source files. A source that already includes the approved corrections must not have them applied again. Keep the raw source unchanged and review correction records, exclusions, unknown values, chronology, and overlap diagnostics before interpretation.

Station-local IDs do not link cashier and delivery records. Do not join them into person or order histories without independent evidence. In the supplied corrected reference, person/group counts remain unknown and six delivery intervals overlap while four preparers are reported. This discrepancy is a measurement issue to resolve, not a parameter to tune away. **Import never calibrates the model automatically.**

See the [full manual's observation section](MANUAL_USUARIO.md#4-revisar-datos-observados) for field definitions, sample format, and the approved correction profile.

## Scenario defaults and assumptions

Every value in this table is a synthetic teaching assumption. Scenario edits affect only a new run; a completed result keeps its submitted configuration.

| Input | Demonstration default |
| --- | --- |
| Mode and staffing | Tuesday: 1 cashier and 4 preparers; regular day: 1 integrated worker |
| Opening and admission close | 15:00 to 21:30; horizon `H = 23,400 s` |
| Initial state | Empty, as an explicit assumption |
| Interarrival time | Exponential, mean 180 s; first arrival occurs after a sampled interval |
| Group sizes | 1 person with probability 0.6; 2 people with probability 0.4 |
| Active payment | Triangular 15 / 30 / 45 s (minimum / mode / maximum) |
| Preparation per order | Triangular 60 / 120 / 180 s, independent of group size |
| Transfer probability | 0.25 |
| External confirmation | Triangular 30 / 60 / 90 s for transfers; zero otherwise |
| Patience | Disabled (`null`) |
| Root seed | 20261020 |
| Experiment replications | 30 |
| Confidence level | 95% two-sided Student-t interval |

Other accepted time distributions are constant, triangular, and exponential; group sizes are positive integers with explicit weights. Probabilities must sum to one. A time between arrivals must be strictly positive. Do not fit a distribution from the imported observations through the application.

Each group shares one order, one payment, and one preparation; group size does not scale preparation time. Tuesday uses separate cashier and preparer pools. Regular mode uses an integrated worker: external transfer confirmation reserves that worker without counting as active work. Tuesday confirmation releases the cashier. Patience applies only before the first payment starts. The model has no physical queue-capacity limit, product recipes, partial deliveries, or post-payment abandonment.

New arrivals are admitted in `[0, H)`. Window throughput, queue areas, and resource utilization use that same half-open window. Orders admitted before closing continue through completion or withdrawal, so the drain may extend beyond `H`; there is no warm-up period. Initial orders are reported as a separate cohort from newly admitted orders. See the [scenario manual](MANUAL_USUARIO.md#5-configurar-un-escenario) for initial-state fields and mode-specific rules.

## Metrics, units, and cohorts

The run contract carries each summary's `metric_id`, `unit`, `population`, `cohort`, `count`, `n_valid`, and any denominator or unavailable reason. Preserve those fields in downstream analysis.

| Measure | Unit and population | Interpretation |
| --- | --- | --- |
| Event times and durations | Seconds (`s`) relative to opening | Fields ending in `_s` are simulated times; duration summaries are seconds. A duration may be unavailable when required history is unknown or the outcome did not occur. |
| Counts | `orders` or `people` | One group can contain multiple people. Order-weighted and person-weighted waits/permanence use different denominators. |
| Queue summaries | Queue count in orders or people | Time-average queue count is integrated over `[0,H)` and divided by `H`; payment and preparation queues are separate. Active work and pending transfers are not queue waiting. |
| Throughput | `orders/s` or `people/s` | Deliveries inside `[0,H)` divided by the horizon. Read the unit and population from the exported summary. |
| Resource use | Fraction, 0–1 | Active and reserved worker time divided by available worker time during `[0,H)`. Reservation can include an inactive confirmation wait. |
| Drain | Seconds (`s`) | End of drain and overtime after admission close. These can extend beyond the observation window. |

The three cohort labels are `new`, `initialized`, and `all`. `new` contains orders admitted after the opening state; `initialized` contains work already present at opening; `all` combines the represented run records where applicable. Window measures use the horizon, while completed-cohort outcomes can include post-close drain. A withdrawal is not a zero-duration completion. Unknown history and undefined estimates are `null` with a reason, not zero. Preparation-queue wait is not applicable in regular mode.

Simulation event times are relative to the declared opening time; the interface formats them as local clocks. A result records both the horizon and drain end. For detailed names and per-order/per-person records, inspect `RunMetrics` in `src/boquitas/metrics_models.py` and the metric summary contract in `src/boquitas/statistics.py`.

## Seeds, replication, and confidence intervals

The root seed and replication index identify reproducible generated inputs. A staffing-only comparison with the same root seed and replication index reuses the same order tape. Changing demand-generation settings can change the tape; the result identifies whether demand was matched. Replication 0 is the first replication.

Experiments request 30 replications by default and accept up to 200 in the UI. A single-run action performs one run; the experiment replication count is used by **Compare scenarios**. Confidence intervals are two-sided 95% Student-t intervals computed over replication summaries. Candidate-versus-reference intervals use within-replication paired differences (`candidate - reference`), with valid and requested counts disclosed. Intervals describe Monte Carlo variation conditional on the configured assumptions; they do not estimate uncertainty in real-shop parameters. Fewer than two valid observations yield an unavailable interval with a reason; identical replication summaries can produce a zero-width interval.

### Compare the deterministic demo reference

The repository contains a synthetic reference run at [`reference-demo-run.json`](../openspec/changes/boquitas-06-validation-and-delivery/reference-demo-run.json). Its file SHA-256 is `8bbe6b117f59dde367816d8ed63bb013b0ad624d916a57159c084fcff4051dd7`. The main agent regenerated it in a separate Python process and observed identical complete UTF-8 JSON bytes. To repeat this check under the frozen environment:

```powershell
@'
from hashlib import sha256
from pathlib import Path

from boquitas import demo_scenario, dump_run_json, run_scenario

expected_sha256 = "8bbe6b117f59dde367816d8ed63bb013b0ad624d916a57159c084fcff4051dd7"
reference = Path("openspec/changes/boquitas-06-validation-and-delivery/reference-demo-run.json").read_bytes()
generated = dump_run_json(
    run_scenario(demo_scenario(), root_seed=20261020, replication_index=0)
).encode("utf-8")

if generated != reference or sha256(generated).hexdigest() != expected_sha256:
    raise SystemExit("Generated scientific JSON does not match the reference fixture.")
print(f"Reference JSON matches; SHA-256={sha256(generated).hexdigest()}")
'@ | .\.venv\Scripts\python.exe -
```

`RunResult` contains the scenario, seed/index, demand tape, trace, and metrics; it has no wall-clock timestamp field. Keep the reference file unchanged unless the scientific contract intentionally changes and a reviewer authorizes a new reference. A passing hash comparison verifies serialization and deterministic generation in this locked setup, not empirical model validity.

## Save, reopen, and export

- Scenario JSON preserves inputs and assumptions, not an execution history.
- Run JSON preserves its versioned configuration, seed/replication identity, generated inputs, event trace, and metrics so it can be reopened and replayed without re-simulation.
- Experiment JSON preserves scenarios, replication summaries, estimates, and comparisons. Select a scenario and replication index to inspect the exact run.
- CSV downloads are rectangular analysis tables for observations, runs, experiments, or a selected replication. They retain unit, population, cohort, and unavailable-value information where applicable; CSV alone does not preserve a replayable trace.

The web contract version is `1`. Keep the JSON alongside any CSV extract when reproducibility or replay matters. An unsupported version, malformed history, oversized file, or numeric value that the browser cannot represent exactly should be rejected with an actionable message. Do not treat a partial experiment diagnostic as a completed comparison.

## Three-dimensional replay

Replay projects the saved engine trace at a selected simulation time; it does not generate events or change metrics. The scene opens paused at 20×. Controls support play/pause, restart, speeds of 1×, 5×, 20×, and 60×, seeking through the full drain, camera orbit/zoom/reset, and person/order inspection. The displayed shop geometry and motion are illustrative and add no travel time. If WebGL is unavailable, use the metrics, tables, and timeline. See the [Spanish replay instructions](MANUAL_USUARIO.md#9-usar-la-reproducción-3d).

## Local verification and CI status

No hosted CI workflow file was present in the inspected checkout. The following are local verification commands, not recorded results from CI. Run them after the relevant implementation is complete and retain their actual output in the release evidence.

```powershell
uv --cache-dir .uv-cache run --frozen --offline pytest
uv --cache-dir .uv-cache run --frozen --offline ruff check .
uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas
uv --cache-dir .uv-cache run --frozen --offline python scripts/export_web_contracts.py --check
pnpm --dir web contracts:check
pnpm --dir web test --run
pnpm --dir web typecheck
pnpm --dir web build
pnpm --dir web test:e2e
pnpm --dir web exec tsc --noEmit -p tsconfig.release.json
# With the production application already running in a separate console:
pnpm --dir web exec playwright test --config playwright.release.config.ts
openspec validate --changes --strict --no-interactive
```

The browser end-to-end suite requires its Playwright Chromium build. On a new machine, install it once with `pnpm --dir web exec playwright install chromium`. Automated checks do not replace an actual import-to-export workflow, offline network inspection, repeated start/stop, or graphical 3D review. If a required browser or graphics check cannot run, record it as pending.

## Common setup and runtime errors

| Symptom | Response |
| --- | --- |
| Python environment or module is missing | From the repository root, run `uv sync --frozen`; then retry the direct Python entry or launcher. |
| Built interface is missing | Run `pnpm --dir web install --frozen-lockfile` and `pnpm --dir web build`. |
| Port 8000 is occupied | Check for an existing Boquitas instance. Do not terminate an unrelated process. |
| Browser cannot reach the service | Confirm the foreground server is running and open `http://127.0.0.1:8000`. |
| Observation file is rejected | Check UTF-8, CSV/TXT format, the required header, the 10 MiB limit, and whether the chosen correction profile is allowed for that source. |
| Scenario is rejected | Read the field-level diagnostic; check positive capacities, finite durations, group weights, valid initial worker assignments, and a strictly positive interarrival time. |
| A metric is unavailable | Keep its reason and denominator visible. Do not replace it with zero. |
| 3D renderer is unavailable | Continue with metrics, tables, and the timeline; retry WebGL only if appropriate for the machine. |
| An application error includes a diagnostic reference | Preserve that reference and describe the action that produced it. |

## Validation boundary

Passing software tests and running synthetic comparisons verify code behavior under stated inputs. They do not calibrate or validate the model against Boquitas operations. Current preliminary observations do not establish linked person/order histories or resolve the delivery overlap. Do not attribute simulated changes to the real business or make operational recommendations until representative measurements, independent validation, operator review, and a separately agreed acceptance criterion are available. The [prospective empirical validation protocol](empirical-validation-protocol.md) describes the required evidence.
