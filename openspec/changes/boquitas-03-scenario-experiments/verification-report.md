# Spec03 independent verification report

Date: 2026-10-22. Implementers: two bounded GPT-6 Luna agents, both at max effort. Reviewer and integration owner: main agent. Authorized scope: `boquitas-03-scenario-experiments`, after explicit user approval of spec02.

## Acceptance status

Engineering review passed for EXP-01 through EXP-09 and all 14 tasks. Spec03 now awaits user approval before spec04. No synchronization, archiving, commit, push, PR or deployment was performed.

The implementation provides validated hypothetical scenarios, indexed demand generation, trace-derived metrics, replicated experiments, paired comparisons and portable JSON/CSV exports. No automatic fitting, empirical validation, business forecasting, API, UI or 3D implementation is claimed.

## Reviewed files and integration

- `scenarios.py`: immutable scenario/distribution contracts and explicitly synthetic defaults.
- `demand.py`: complete demand tapes with stable replication/order/category streams and workload guards.
- `metrics.py` and `metrics_models.py`: public trace summaries, order/person rows, settled queues and worker usage.
- `statistics.py`: replication-level Student-t estimates, availability reasons, physical-bound disclosures and explicit Monte Carlo interpretation.
- `experiments.py`: replayable selected runs, bounded batches, retained failures and jointly available paired differences.
- `exports.py`: versioned JSON and separate CSV tables with identity, provenance, units and unavailable values.
- `__init__.py`: main-agent integration of the public API; all 59 exported names resolved in an independent smoke check.
- Six new test modules; NumPy/SciPy dependency declarations and lockfile; current authorization/status documentation and block evidence.

The repository already had extensive uncommitted/untracked work. The reviewer read new file contents directly rather than relying on `git diff` alone. SHA-256 comparisons confirmed that all 23 protected files remained unchanged: existing engine/models/importer, the two prior test modules, their three observation fixtures/manifests, and all 15 artifacts of specs04-06. Both original observation sources also retained their pre-implementation hashes. Dependency declarations/lockfile and package exports changed within the authorized scope.

## Independently executed verification

Environment: Windows, project Python 3.13 environment, NumPy 2.5.4, SciPy 1.18.1 and the existing project tooling. Commands used the project-local `.uv-cache` through `UV_CACHE_DIR`.

| Check | Observed result |
| --- | --- |
| Pre-implementation `uv run --frozen --offline pytest -q` | 61 passed |
| Final `uv run --frozen --offline pytest -q` | Exit 0; 109 passed in 5.20s: all 61 prior tests plus 48 new cases |
| `uv run --frozen --offline ruff check .` | Exit 0; all checks passed, no final traversal warning |
| `uv run --frozen --offline mypy src/boquitas` | Exit 0; no issues in 11 source files |
| `uv lock --check --offline` | Exit 0; 21 packages resolved, lockfile current |
| `openspec validate --changes --strict --no-interactive --json` | Exit 0; 6 changes valid, no issues |
| `git diff --check` | Exit 0; no tracked whitespace errors; existing LF/CRLF conversion notice |
| Protected-file/source SHA-256 readback | All 23 protected files and both original sources unchanged |
| Actual JSON/CSV file save/readback | Passed; exact JSON reopening, UTF-8 text, CSV formula protection and original display-text preservation |

The first dependency download failed under restricted networking. The normal approved execution route installed the declared NumPy/SciPy dependencies without changing security settings. An implementer file-writing probe also encountered Windows sandbox ACL failures; the file-writer test was retained/restored and subsequently passed in the main agent's approved full-suite execution. The empty directory created by that probe was verified inside the project and empty before removal. Temporary paths for the final independent file smoke check were verified inside the project and cleaned afterward.

No required check remains failed, skipped or pending. Native OpenSpec validation establishes artifact structure, not runtime correctness. Browser/visual QA is inapplicable to this Python-only change.

## Requirement map

| Requirement | Reviewed and observed behavior |
| --- | --- |
| EXP-01 | Constant/triangular/exponential contracts, positive arrival support, finite nonnegative stages, validated group probabilities, staffing and explicit initialization; exact synthetic demo settings; empty/no-warm-up assumptions; observations never populate parameters |
| EXP-02 | Seed material uses fixed integer category/order/replication IDs, independent of staffing and invocation order; staff/mode changes preserve complete tapes; optional patience does not shift other attributes; first arrival is after opening and admissions stop before H |
| EXP-03 | Distinct order/person counts and means; new versus initialized cohorts; completed versus withdrawn outcomes; median, linear p95, maximum and valid sample counts; unknown history remains unavailable with reasons |
| EXP-04 | Public events reconstruct exact settled payment/preparation intervals; integrated areas divide by H; person/order maxima exclude transient zero-time queues and active/pending stages |
| EXP-05 | Active and reserved worker time is clipped to the window and divided by pool availability; regular external confirmation reserves without activity; initial residual occupancy contributes from zero |
| EXP-06 | Delivery at H is excluded from window throughput but retained in cohort completion; drain and overtime are distinct; initialized cohorts/history remain separate |
| EXP-07 | Default 30 independent replications and 95% two-sided Student-t estimates; sample variance uses n-1; no clamping; insufficient/constant samples have reasons; pair differences use matching indices and jointly available values; intervals disclose conditional simulation variability |
| EXP-08 | Scenario/run/experiment JSON round trips; unsupported nested versions rejected; selected indexed run reproduces its batch member; full tape/trace travels with a saved run; rectangular CSV preserves identity, provenance, denominators, missing-value reasons and safe text cells |
| EXP-09 | 1-8 scenarios and 1-200 replications; explicit failure above 10000 generated new orders; invalid distributions, probabilities, pools, identities and initialization fail; failed replications remain visible and prevent overall success |

## Independent numerical and boundary probes

The reviewer checked literal timelines through public interfaces, independently of the implementers' tests:

- Waits 0 and 6 with group sizes1 and2 yield order mean3 and person mean4.
- Regular arrival0/1, payment2, preparation3, H10 yields deliveries5/10, queue area4, queue mean0.4 and permanence mean7. Tuesday yields permanence mean5.5. Delivery at exactly H remains outside window throughput.
- Regular payment2, confirmation6, preparation2 yields active fraction0.4 and reserved fraction1.0.
- Arrival9/delivery14 with H10 yields completed permanence5, window throughput0 and overtime4.
- Initial regular waiting-payment and active-payment cases with active remainder2/confirmation3/preparation4 use active6/reserved9 worker-seconds. Pending confirmation3/preparation4 uses active4/reserved7; initial preparation4 uses4/4. Unknown historical timestamps stay null.
- Tuesday one preparer initially busy for2 seconds plus an initialized two-person queued order with preparation4: queue means0.2 orders/0.4 people, preparation starts2 and ends6, observed preparation4; full historical paid queue wait remains unknown.
- Student-t sample `[1,2,3]` yields mean2 and endpoints approximately -0.48413771175033/4.48413771175033. Independent probes at scales1e200 and1e-200 preserve the corresponding scaled interval without false zero variability.
- H6, constant interarrival2, payment3, preparation1 and cashier1 versus2: every paired replication has candidate-minus-reference payment-wait mean -0.5, permanence -0.5, payment-queue mean -1/6 and overtime -1. Constant differences produce the disclosed zero-width interval.
- An unavailable scalar in the reference remains an unavailable pair even when the candidate has a valid value; n_valid is0 rather than an invented difference against zero.
- An explicit initial identity colliding with the first generated ID only in replication0 produced one failed candidate replication, a retained `duplicate_order_id` issue and a successful replication1. The overall experiment was failed with n_valid1/2 and all four scenario/replication records preserved.
- Default batch execution returned 30/30 valid replications, confidence0.95 and root seed20261020. Indexed selected-run metrics matched the corresponding batch record.
- Actual UTF-8 file save/reopen preserved `=Cúcuta + demo` exactly in JSON while CSV text was safely prefixed. All CSV tables were rectangular.

These are synthetic engineering checks, not measured Boquitas results.

## Review findings addressed

1. Withdrawal summaries incorrectly sampled served wait fields; the focused regression now uses abandonment minus arrival and preserves person weights.
2. Squaring unscaled deviations caused infinite intervals or false zero variability for finite extreme-scale inputs; normalized calculation now preserves finite representable intervals and rejects unrepresentable endpoints explicitly.
3. Boolean group sizes were coerced to integers; strict validation now rejects them. Requested replication counts and numeric scenario fields are also checked.
4. Horizon was absent from generation-assumption comparison; changed opening-window length now breaks the matching label when it changes the tape.
5. Aggregate/standalone CSV metadata omitted seeds, requested counts, denominators or source identity; readback regressions now check these fields and provenance.
6. Finite inputs could overflow intermediate metric outputs, breaking exact JSON reopening after infinity became null. Shared metric models now reject nonfinite outputs. An independent full experiment probe returned an explicit failed result with retained diagnostic and an exact JSON round trip.
7. Statistical interpretation was present in planning prose but absent from portable intervals; JSON and relevant CSV rows now explicitly describe conditional Monte Carlo variability and exclusion of actual parameter uncertainty.

See [metrics TDD evidence](metrics-tdd-evidence.md) and [generation/experiment/export evidence](experiments-tdd-evidence.md) for selected observed failures and successful fixes. Passing acceptance coverage and ordinary export integration are not retroactively labeled test-first. An exploratory reviewer probe using an intentionally invalid `model_copy` scenario was rejected by nested scenario validation; the subsequent valid-scenario collision probe above verified retained runtime failures without weakening validation.

## Contracts and limits

Stable seed composition is `[order_index, category_id, replication_index, root_seed]`, with category IDs0-6 for arrivals, groups, payment, transfer selection, confirmation, preparation and patience. No process-dependent string hashes, resource dispatch or scenario display names participate. Exact stored JSON is the portable record; it includes the explicit tape/trace so reading a saved run does not regenerate demand.

Batches execute sequentially and retain metrics instead of all tapes/traces. Request a chosen scenario/replication for replay and complete run order/person/event CSV tables. Batch CSV orders/people/events are header-only; its substantive tables are metrics, replications and comparisons. Observation exports retain the separate station/source views from spec02. CSV is a presentation format with safe text prefixes; JSON preserves exact original text.

Workload limits are software bounds, not physical capacity estimates. Requests outside representable finite numerical output fail explicitly. Intervals quantify variation across simulated replications conditional on chosen assumptions, not uncertainty in actual Boquitas parameters. Field-data conflicts, unknown group sizes and absent station links remain unresolved evidence limits.

Documentation was refreshed with Context7 using the official [NumPy independent-stream guidance](https://numpy.org/doc/stable/reference/random/parallel.html) and [SciPy statistical implementation/documentation](https://github.com/scipy/scipy/blob/main/stats/_stats_py.py). No observation data was sent to documentation services.
