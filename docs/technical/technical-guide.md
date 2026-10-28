# Boquitas technical guide

This guide describes the Windows application, its local operating path, and the V2 implementation for explicitly scripted preparation interruptions. Spec07 completed independent engineering acceptance of all 28 tasks on 2026-10-24. The [Spec07 verification report](../../openspec/changes/boquitas-07-preparation-interruptions/verification-report.md) records final automated/browser checks, visual inspection and source preservation. No calibration or empirical validation is claimed. The earlier [release acceptance report](../acceptance-report.md) remains historical evidence for version 1.

For the complete Spanish workflow, see the [user manual](../user/MANUAL_USUARIO.md). The [local web application guide](../../web/README.md) retains the existing development, contracts, and verification commands.

## Portable presentation package

For a Windows 10/11 x64 destination, build the self-contained release with `./build-portable.ps1` on the build computer. The ZIP is written to `dist/Boquitas-Windows-x64.zip`; existing outputs are preserved. Use `-OutputDirectory <new-directory>` for another build. Only the build computer needs Python 3.13 x64, uv, Node.js and pnpm. The destination needs a compatible browser and the complete extracted package.

See the [Spanish portable guide](../user/guia-portable.md) and the [observed package verification](../verification/portable-release-2026-10-28.md). To repeat the executable/API check after extracting the ZIP elsewhere, run the build computer's Python with `scripts/check_portable.py <extracted-folder>`. This check strips developer tools from the child process PATH; it does not certify another computer or disable the host network adapter.

## Scope and supported environment

Since 2026-10-28, new application runs and experiments normalize transfer confirmation to zero, including opening-state residual confirmation. The scenario editor and downloaded scenarios use the same policy. Payment method is recorded independently as `cash` or `transfer`; it no longer depends on a positive confirmation duration. Saved runs are reopened without normalization, and the direct deterministic engine retains historical confirmation support for reproducibility. Missing methods in older artifacts remain unknown unless their positive transfer wait establishes a transfer.

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

For the confirmed normal visit on 2026-10-23 only, IDs 1–8 at the two stations were confirmed as eight linked orders and the same worker's interruption of order 6 to charge order 7 was confirmed. This does not link Tuesday station IDs or supply person counts. The recorded order-6 preparation interval 18:13:13–18:16:16 is 183 seconds elapsed; exact pause boundaries and active work were not measured. In particular, 173 seconds is not an observed active-preparation value.

See the [full manual's observation section](../user/MANUAL_USUARIO.md#4-revisar-datos-observados) for field definitions, sample format, and the approved correction profile.

## Scenario defaults and assumptions

Every value in this table is a synthetic teaching assumption. Scenario edits affect only a new run; a completed result keeps its submitted configuration.

| Input | Version-1 demonstration default |
| --- | --- |
| Contract and interruption policy | Version 1; no interruption schedule. V2 is explicit opt-in. |
| Mode and staffing | Tuesday: 1 cashier and 4 preparers; regular day: 1 integrated worker |
| Opening and admission close | 15:00 to 21:30; horizon `H = 23,400 s` |
| Initial state | Empty, as an explicit assumption |
| Interarrival time | Exponential, mean 180 s; first arrival occurs after a sampled interval |
| Group sizes | 1 person with probability 0.6; 2 people with probability 0.4 |
| Active payment | Triangular 15 / 30 / 45 s (minimum / mode / maximum) |
| Preparation per order | Triangular 60 / 120 / 180 s, independent of group size |
| Transfer probability | 0.25 |
| External confirmation | Zero for all new application executions; legacy domain examples retain their original distribution |
| Patience | Disabled (`null`) |
| Root seed | 20261020 |
| Experiment replications | 30 |
| Confidence level | 95% two-sided Student-t interval |

Other accepted time distributions are constant, triangular, and exponential; group sizes are positive integers with explicit weights. Probabilities must sum to one. A time between arrivals must be strictly positive. Do not fit a distribution from the imported observations through the application.

Each group shares one order, one payment, and one preparation; group size does not scale preparation time. Tuesday uses separate cashier and preparer pools. Regular mode uses an integrated worker. New application executions use the configured payment duration for both cash and transfers, with no additional confirmation wait. The historical engine contract reserves the integrated worker during confirmation and releases the Tuesday cashier. Patience applies only before the first payment starts. The model has no physical queue-capacity limit, product recipes, partial deliveries, or post-payment abandonment.

New arrivals are admitted in `[0, H)`. Window throughput, queue areas, and resource utilization use that same half-open window. Orders admitted before closing continue through completion or withdrawal, so the drain may extend beyond `H`; there is no warm-up period. Initial orders are reported as a separate cohort from newly admitted orders. See the [scenario manual](../user/MANUAL_USUARIO.md#5-configurar-un-escenario) for initial-state fields and mode-specific rules.

## Scripted preparation interruptions (version 2)

The current implementation adds an explicit `EngineConfigV2` path. It is opt-in through `contract_version: 2`, permits only regular mode with exactly one integrated worker and no separate cashier/preparer team, and leaves application demonstrations on the unchanged version-1 path. Importing observations, choosing a day label, or changing a staffing value does not create a schedule. V2's script does not infer a priority rule or a pause time. Spec07 has passed engineering acceptance.

The configuration identifies `preparation_interruption_policy: "scripted_cashier"` and an ordered `cashier_interruptions` list. Each entry has this shape:

```json
{
  "at_s": 5,
  "suspended_order_id": "A",
  "cashier_order_id": "B"
}
```

`at_s` is a finite, nonnegative second offset from opening; entries are strictly increasing. The two IDs must differ and resolve to initialized or admitted orders. At execution time, the suspended order must be actively preparing with positive work remaining and the cashier order must be the eligible FIFO waiter for its first payment. Invalid or stale references return an entry-specific diagnostic under `config.cashier_interruptions[index]`; an inapplicable or unconsumed entry is not silently skipped, retimed, or accepted as a successful partial run.

A script may run after `H` for an order initialized or admitted before closing. New arrivals remain restricted to `[0,H)`. Generated demand IDs encode the replication index, such as `r000000-o00000`; a literal script ID must match the exact tape. A target that differs in a later replication is not remapped. The current experiment, API and file paths retain version and report infeasible script entries by replication; no failed member is hidden as a completed success.

An interruption serves one cashier order. The same worker then resumes its original preparation before taking the new paid preparation from the separate first-preparation queue. If external confirmation is configured, active payment ends first; during confirmation the worker stays reserved and inactive and the original preparation remains paused. Resumption waits until payment completion. Each later scripted entry is a separate transaction; no automatic or nested pauses, multiple integrated workers, Tuesday-mode interruptions, initially paused states, or separate initialized paid-preparation queue are supported.

The [scripted demo input](../../openspec/changes/boquitas-07-preparation-interruptions/review/scripted-demo-input.json) uses stable initial orders A and B, with no generated arrivals inside its 20-second horizon, so the same script can target those two initial IDs over multiple replications. Its [version-1 counterpart](../../openspec/changes/boquitas-07-preparation-interruptions/review/scripted-demo-legacy-reference.json) preserves the legacy comparison. These are hypothetical inputs, not observations. Neither file establishes a general trigger or calibrated interruption policy.

### Current user-interface path

In **Escenarios**, click **Activar pausas programadas**. This explicitly switches the scenario to V2; the schedule remains empty until entries are added. Keep **Normal** mode and exactly one integrated worker. Click **Añadir pausa programada**, then fill **Tiempo programado (s desde la apertura)**, **Orden cuya preparación se pausa**, and **Orden que pasa a cobrar**. The interface labels these as user assumptions and says that observation data does not infer the time or order IDs. Existing or admitted order IDs must match literally on each generated tape.

Field validation marks an incomplete, nonfinite, negative, non-increasing or duplicate-ID entry. A mode/capacity conflict displays a Spanish warning, preserves the script, and blocks submission; **Resolver incompatibilidad: usar modo normal con una persona integrada** is an explicit draft change. At runtime, an entry whose suspended order is not preparing or whose cashier order is not the FIFO-eligible payment waiter returns an indexed diagnostic at `config.cashier_interruptions[index]`; an unconsumed entry also fails that replica. It is never silently retimed, replaced or skipped.

After **Ejecutar una réplica**, **Órdenes de esta réplica** exposes the columns **Trabajo activo**, **Tiempo en pausa**, **Recuento de pausas**, and **Tiempo transcurrido**. The timeline event details include **Preparación pausada**, **Reanudar preparación**, the related cashier order, remaining work, assignment, reservation and active-work state. The focused browser record above exercises schedule editing, core-run seeking at 6 and 8 seconds, JSON/CSV download, reopen, graphics fallback and mixed-version experiment selection. The final verification report records these visible checks together with the full gates and independent main review.

### Core synthetic example

For H=20, A arrives at 0, pays for 2 seconds and needs 10 seconds of preparation; B arrives at 5, pays for 2 seconds and needs 3 seconds of preparation. The explicit entry `{ "at_s": 5, "suspended_order_id": "A", "cashier_order_id": "B" }` yields A preparation from 2–5 and 7–14, B payment from 5–7, and B preparation from 14–17. A therefore has 10 active seconds, 2 paused seconds, 1 pause and 12 elapsed seconds. Active worker use is 17/20 = 0.85; B's paid first-preparation queue contributes 7 order-seconds over the 20-second horizon, or 0.35 orders on average. This is a manually solved synthetic check, not a business result.

The linked fixture instead initializes both A and B waiting for payment at time 0 with explicit queue ranks; A is served first, so B's payment still begins at 5. This keeps the literal IDs stable across the example replications.

For the 2026-10-23 normal visit only, the user confirmed matching IDs 1–8 across the stations and that the same worker paused order 6 to charge order 7. The recorded preparation interval for order 6 is 183 seconds elapsed; exact pause boundaries and active preparation were not measured. The 173-second difference is not observed active work. Do not calibrate a pause script or active-time input from it.

## Metrics, units, and cohorts

The run contract carries each summary's `metric_id`, `unit`, `population`, `cohort`, `count`, `n_valid`, and any denominator or unavailable reason. Preserve those fields in downstream analysis.

| Measure | Unit and population | Interpretation |
| --- | --- | --- |
| Event times and durations | Seconds (`s`) relative to opening | Fields ending in `_s` are simulated times; duration summaries are seconds. A duration may be unavailable when required history is unknown or the outcome did not occur. |
| Counts | `orders` or `people` | One group can contain multiple people. Order-weighted and person-weighted waits/permanence use different denominators. |
| Queue summaries | Queue count in orders or people | Time-average queue count is integrated over `[0,H)` and divided by `H`; payment and preparation queues are separate. In V2, the regular preparation queue contains paid orders waiting for their first preparation, not an order paused after preparation began. Active work and pending confirmations are not queue waiting. |
| Throughput | `orders/s` or `people/s` | Deliveries inside `[0,H)` divided by the horizon. Read the unit and population from the exported summary. |
| Resource use | Fraction, 0–1 | Active and reserved worker time divided by available worker time during `[0,H)`. Reservation can include an inactive confirmation wait. |
| Drain | Seconds (`s`) | End of drain and overtime after admission close. These can extend beyond the observation window. |

The three cohort labels are `new`, `initialized`, and `all`. `new` contains orders admitted after the opening state; `initialized` contains work already present at opening; `all` combines the represented run records where applicable. Window measures use the horizon, while completed-cohort outcomes can include post-close drain. A withdrawal is not a zero-duration completion. Unknown history and undefined estimates are `null` with a reason, not zero. V1 retains its prior regular-mode preparation-queue unavailability; V2 can report the paid queue wait before first preparation.

For a fully observed, completed V2 order, the metric record adds `preparation_active_s`, `preparation_paused_s`, and integer `preparation_pause_count` alongside `preparation_elapsed_s`. Active and paused durations are seconds; the count is pauses per order or person. `preparation_elapsed_s` runs from the first `preparation_started` event to delivery and equals active plus paused seconds. Resume events do not replace the original start. Summary IDs follow these patterns:

- `duration.preparation_active.order.{new,initialized,all}` and `duration.preparation_active.person.{new,initialized,all}`
- `duration.preparation_paused.order.{new,initialized,all}` and `duration.preparation_paused.person.{new,initialized,all}`
- `duration.preparation_pause_count.order.{new,initialized,all}` and `duration.preparation_pause_count.person.{new,initialized,all}`

Each summary carries its own unit, population, cohort, sample count and availability.

If an order is already preparing at opening and its historical start is unknown, full active, paused, pause-count and elapsed values remain null with an unavailable reason; residual work is not presented as its full historical duration. Known worker segments still contribute to resource utilization inside `[0,H)`. A paused order contributes neither a second worker assignment nor paid-first-preparation queue time. External confirmation contributes reserved worker time but no active work.

Simulation event times are relative to the declared opening time; the interface formats them as local clocks. A result records both the horizon and drain end. For detailed names and per-order/per-person records, inspect `RunMetrics` in `src/boquitas/metrics_models.py` and the metric summary contract in `src/boquitas/statistics.py`.

## Seeds, replication, and confidence intervals

The root seed and replication index identify reproducible generated inputs. A staffing-only comparison with the same root seed and replication index reuses the same order tape. Changing demand-generation settings can change the tape; the result identifies whether demand was matched. Replication 0 is the first replication.

Experiments request 30 replications by default and accept up to 200 in the UI. A single-run action performs one run; the experiment replication count is used by **Compare scenarios**. Confidence intervals are two-sided 95% Student-t intervals computed over replication summaries. Candidate-versus-reference intervals use within-replication paired differences (`candidate - reference`), with valid and requested counts disclosed. Intervals describe Monte Carlo variation conditional on the configured assumptions; they do not estimate uncertainty in real-shop parameters. Fewer than two valid observations yield an unavailable interval with a reason; identical replication summaries can produce a zero-width interval.

### Compare the deterministic demo reference

The repository contains a synthetic reference run at [`reference-demo-run.json`](../../openspec/changes/boquitas-06-validation-and-delivery/reference-demo-run.json). Its file SHA-256 is `8bbe6b117f59dde367816d8ed63bb013b0ad624d916a57159c084fcff4051dd7`. The main agent regenerated it in a separate Python process and observed identical complete UTF-8 JSON bytes. To repeat this check under the frozen environment:

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

- A V1 or V2 scenario JSON preserves inputs and assumptions, not an execution history.
- A V1 or V2 run JSON preserves configuration, seed/replication identity, generated inputs, event trace, and metrics so it can be reopened without re-simulation.
- A V1 or V2 experiment JSON preserves scenarios, replication summaries, estimates, and comparisons. Select a scenario and replication index to request that exact run for inspection.
- Current CSV downloads are rectangular analysis tables for observations, runs, experiments, or a selected replication. They retain unit, population, cohort, and unavailable-value information where applicable; CSV alone does not preserve a replayable trace.

Version 1 remains the default for existing scenarios, demos and scientific references. The current implementation supports typed contract version 2 for explicitly scripted preparation interruptions; it does not silently migrate V1 files. Spec07 has passed engineering acceptance. V2 reuses the existing API/file operations and does not define a new endpoint.

The client retains exact JSON bytes returned by the server for result downloads. Reopening a saved V1 or V2 run validates and loads its stored configuration, demand, trace and metrics without submitting a new simulation. Opening an experiment restores its summaries; requesting one indexed member for inspection uses its stored scenario, seed and replication index. The inspected local size limits are separate: observation uploads are capped at **10 MiB**; saved JSON uploads are capped at **64 MiB** and an oversized upload reports `saved_file_too_large` (HTTP 413); a serialized run or experiment response above **64 MiB** is rejected with `result_too_large` (HTTP 422). Use binary MiB limits (10 × 1,048,576 and 64 × 1,048,576 bytes). For oversized generated outputs, reduce the horizon, demand or replication count before rerunning. Do not treat a partial experiment diagnostic as a completed comparison.

## Three-dimensional replay

Replay projects the saved V1 or V2 engine trace at a selected simulation time; it does not generate events or change metrics. The scene opens paused at 20×. Controls support play/pause, restart, speeds of 1×, 5×, 20×, and 60×, seeking through the full drain, camera orbit/zoom/reset, and person/order inspection. V2 shows one worker changing assignment, the suspended order's pause/resume states and the related cashier order; seeking at 6 and 8 seconds in the core example exposes the pause and resumption. The displayed shop geometry and motion are illustrative and add no travel time. If WebGL is unavailable, use the metrics, tables, event details and exports. See the [Spanish replay instructions](../user/MANUAL_USUARIO.md#9-usar-la-reproducción-3d).

## Local verification and CI status

No hosted CI workflow file was present in the inspected checkout. The following local commands reproduce the engineering gates; they are not CI results. The verification report records the completed Spec07 run. Record fresh results for later changes.

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
| Saved JSON upload is rejected | Check the format and the 64 MiB limit; `saved_file_too_large` identifies an oversized saved file. |
| Run or experiment response exceeds the output limit | `result_too_large` means its serialized JSON exceeds 64 MiB. Reduce the horizon, demand or replication count before trying again. |
| Scenario is rejected | Read the field-level diagnostic; check positive capacities, finite durations, group weights, valid initial worker assignments, and a strictly positive interarrival time. |
| A scripted interruption is rejected | Follow the indexed `config.cashier_interruptions[index]` diagnostic. Verify both literal order IDs, the scheduled state and timing, one integrated worker and payment FIFO eligibility. Do not remap IDs or retime the entry. |
| A metric is unavailable | Keep its reason and denominator visible. Do not replace it with zero. |
| 3D renderer is unavailable | Continue with metrics, tables, and the timeline; retry WebGL only if appropriate for the machine. |
| An application error includes a diagnostic reference | Preserve that reference and describe the action that produced it. |

## Validation boundary

Passing software tests and running synthetic comparisons verify code behavior under stated inputs. They do not calibrate or validate the model against Boquitas operations. Tuesday observations do not establish linked station histories or resolve the delivery overlap. For the normal visit only, the user confirmed the eight station-to-order links and the same-worker interruption; person counts, exact pause boundaries and a general interruption policy remain unknown. Do not attribute simulated changes to the real business or make operational recommendations until representative measurements, independent validation, operator review, and a separately agreed acceptance criterion are available. The [prospective empirical validation protocol](../empirical-validation-protocol.md) describes the required evidence.
