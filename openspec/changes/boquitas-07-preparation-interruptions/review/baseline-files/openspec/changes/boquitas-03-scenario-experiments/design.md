## Context

Depends on the [engine design](../boquitas-01-simulation-engine/design.md), [observation design](../boquitas-02-observation-import/design.md) and [shared baseline](../../README.md). Metrics are computed here once, then consumed by API/UI and exports. Statistical fitting and empirical model validation require a later evidence-backed change.

## Goals / Non-Goals

**Goals:** stable demand tapes, transparent order/person metrics, fair staffing comparisons, replicate uncertainty and self-contained files.

**Non-Goals:** automatic calibration, staff optimization, demand forecasts, inferred promotion effects or real-world uncertainty claims.

## Decisions

### Interfaces and typed contracts

- `generate_demand(scenario, root_seed, replication_index) -> list[OrderInput]`.
- `summarize(trace) -> RunMetrics`.
- `run_scenario(scenario, root_seed=20261020, replication_index=0) -> RunResult`.
- `run_experiment(scenarios, root_seed=20261020, replications=30) -> ExperimentResult`.
- JSON/CSV import/export for these public contracts, tested through the confirmed experiment boundary.

`Scenario` contains `contract_version=1`, unique `scenario_id`, display name, `EngineConfig`, initial state, generation distributions, transfer probability, optional patience distribution, `provenance` (`synthetic_demo` or `user_assumptions`) and assumptions. A time distribution is `{kind:'constant',value_s}`, `{kind:'triangular',low_s,mode_s,high_s}` or `{kind:'exponential',mean_s}`. Group weights are a normalized list of `{size,probability}`. All required fields and shared defaults are specified in the roadmap; selecting another day changes resource rules only.

Validate positive interarrival parameters, triangular low <= mode <= high with low < high, finite nonnegative stage durations, positive exponential means, positive integer group sizes, unique sizes, nonnegative weights summing to 1 within 1e-9 and transfer probability in [0,1]. Constant durations can be zero; triangular zero-width durations use the constant form. Reject nonfinite values and unknown contract versions. Group-size sums near 1 are normalized deterministically after validation.

For an explicit workload size bound, stop and report `workload_limit_exceeded` if a replication would exceed 10000 new orders; never silently truncate. Allow 1 to 200 replications and 1 to 8 scenarios per request; comparisons require at least two. These are application workload limits, not physical shop limits. Execute replications sequentially in v1; no multiprocessing or distributed infrastructure.

### Random streams and common inputs

Use NumPy `SeedSequence` with stable integer IDs for replication and categories: arrivals, groups, active payment, transfer selection, confirmation duration, preparation and patience. Do not use process-dependent Python string hashes or staffing identifiers as seed material. Use separate per-order draws/category substreams keyed by order index, including optional attributes, so enabling abandonment or changing staff cannot shift other order attributes. Generate all timings before resource use.

The first arrival is sampled after opening. Subsequent interarrivals accumulate until arrival >= H. Map the extremely unlikely zero exponential interarrival to the smallest strictly positive floating-point value and let the order-count guard stop pathological progression. IDs derive from replication/order/member index and remain unchanged across staffing scenarios. The same generation settings reuse the same tape. If demand distributions change, reuse matched underlying category streams and label `demand_matched=false`; do not claim identical tapes. Initialization is explicit, not sampled from historical source rows.

### Metrics and denominators

Use domain events and initialized state to reconstruct piecewise-constant queues/resources. Integrate after all events at a given time settle, clipping to `[0,H)`. Report event-driven queue time series with both person and order counts. No sampling-frequency approximation and no transient zero-time queue maxima.

| Output | Definition |
| --- | --- |
| Admissions, initialized, delivered, abandoned | Separate order/person counts; separate new and initialized cohorts |
| Payment queue wait | `payment_started-arrival` when both are known; report served and withdrawn queue waits separately |
| Transaction elapsed | `payment_completed-payment_started`, distinct from active work |
| Paid preparation queue wait | `preparation_started-payment_completed`, Tuesday only; regular reports not applicable |
| Preparation elapsed | `delivery-preparation_started`, with incomplete historical initial stages unavailable |
| Completed permanence | `delivery-arrival` for known arrivals; all people in the order share it in v1 |
| Withdrawal wait | `abandonment-arrival` for known arrivals; no service/permanence-completed value |
| Window queue mean | Person/order queue area over H; window starts at simulation 0, not first recorded arrival |
| Throughput | Delivered orders or people with delivery in `[0,H)`, divided by H; display per hour as rate * 3600 |
| Active utilization | Clipped active worker-seconds / (pool capacity * H); regular payment/preparation components and total |
| Reservation | Clipped assigned worker-seconds / (pool capacity * H); includes regular external wait |
| Drain end and overtime | Trace drain end; `max(0,drain_end-H)` |

Person means weight each linked person equally; order means weight each order equally. Return count, mean, median, p95 (linear interpolation), max and `n_valid` for elapsed-time samples. A metric with no eligible samples is null with a reason, never zero. Queue means/utilization in an empty positive-length window are valid zeros. Unknown initial history excludes only metrics requiring it; residual queue/resource occupancy still contributes from time 0. Completed-cohort summaries default to new admissions, with initialized summaries separately available; window states include both. Non-payment stages do not contribute to payment queue. Populations and units appear in every export.

For the manual regular two-order fixture (arrival 0/1, payment 2, preparation 3, H=10), payment queue area is 4 and mean 0.4 orders; completed permanence mean is 7 seconds. The delivery at exactly 10 belongs to the completed cohort but is outside window throughput. For Tuesday 1+4 the mean completed permanence is 5.5 seconds. These are manual acceptance values, not executed results.

### Replications and confidence

Keep one scalar per metric per independent replication; do not pool all people across runs as independent observations. For n>=2 valid values use `mean +/- t.ppf(0.975,n-1)*sample_sd/sqrt(n)` with sample ddof=1. For zero sample_sd return [mean,mean] with `zero_observed_variability`; for n<2 return null interval with reason. Preserve unclamped interval endpoints and explain when physical bounds are crossed. Exclude unavailable metric values with explicit n requested/valid; a failed run makes the overall experiment failed rather than being omitted. Retain partial diagnostics without a success label.

Use the first scenario as reference. For each candidate compute candidate-minus-reference differences for the same replication index using only jointly available values, then the same t interval on differences. Mark whether demand tapes are identical and whether generation assumptions differ. A narrower simulated interval does not validate assumptions or estimate uncertainty in Boquitas's actual parameters.

### Exports and replay selection

`RunResult` contains contract version, scenario, root seed, replication index, assumptions, complete demand tape, initial state, trace and metrics. `ExperimentResult` contains scenarios, root seed, requested/valid replication counts, per-replication metrics, aggregate estimates, paired differences, status/issues and provenance. Avoid storing every trace in a large batch response; request a chosen scenario/replication through `run_scenario` for replay. Its seeded inputs reproduce that indexed batch member. Exporting a replayable run includes its full tape/trace, so opening it never requires rerunning random generation.

CSV exports are separate tables: `orders.csv`, `people.csv`, `events.csv`, `metrics.csv`, `replications.csv`, `comparisons.csv` and observation tables from 02. Use UTF-8, comma delimiter, dot decimal, a header row, blank unavailable numeric fields plus a reason column, and explicit IDs/units/cohort columns. The UI offers each relevant table individually; no spreadsheet/ZIP feature is required. Prefix user-provided text cells that start with spreadsheet formula operators when exporting CSV, preserving numeric cells as numbers. JSON preserves original display text and is the exact round-trip format.

## Risks / Trade-offs

- Wrong draw coupling can invalidate comparisons -> generate tapes first and test cross-staff identity equality.
- Small n or undefined metric -> show unavailable intervals and explicit valid counts.
- Large batch replay payloads -> retain summaries in batch and obtain one reproducible run on demand.
- Aggregate preparation independent of group size -> clearly label this v1 simplification.

## Migration Plan

Add typed experiment contracts without changing engine meanings. Validate saved JSON versions; reject unsupported versions rather than reinterpret them. No database migration or deployment.

## Open Questions

No implementation blockers. Calibration parameters, real group-size distributions, representative daily demand and observation-derived patience remain unestimated.
