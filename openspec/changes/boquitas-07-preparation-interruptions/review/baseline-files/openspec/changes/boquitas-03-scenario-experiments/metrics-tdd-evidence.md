# Metrics implementation evidence

Date: 2026-10-22. Public boundary: deterministic `simulate(...)` trace to `boquitas.metrics.summarize(trace)`. All fixtures use literal, manually solved timelines.

## Selected test-first cycles

- **EXP-03 weighted waits:** before the module existed, `uv run --frozen --offline pytest tests/test_metrics.py -q` failed collection with `ModuleNotFoundError: No module named 'boquitas.metrics'`. After adding the public summary, the 0/6-second order fixture passed: order mean 3 seconds, person mean 4 seconds. Acceptance assertions also verify median, linear p95, maximum, denominators, and that summarization leaves the source trace unchanged.
- **EXP-04 queues:** the area and zero-time-cascade tests failed because `queue.payment.mean.orders` and `queue.payment.max.orders` were absent. The implementation now reports area 4 over H=10 as 0.4, maximum 1, and the sole positive interval `[1,5)`; the zero-time dispatch fixture reports zero queue mean and maximum.
- **EXP-03 withdrawal regression:** the public regression failed with `(value, count, n_valid) == (None, 1, 0)` instead of `(2, 1, 1)`. The summary selected served `payment_wait_s` for withdrawn orders; it now selects `withdrawal_wait_s`. The two-person order reports the same 2-second person wait with denominator 2.
- **EXP-05 utilization:** the regular 2+6+2 fixture first failed because resource fraction IDs were missing. It now reports integrated active fraction 0.4, reserved fraction 1.0, external-confirmation reservation 6 worker-seconds, and denominator 10 worker-seconds. Intervals are clipped to `[0,H)` and separated by pool and component.
- **EXP-06 cohort/window drain:** exact-H and after-H fixtures first failed because permanence summaries were absent. They now report regular permanence mean 7 seconds and Tuesday mean 5.5 seconds; delivery at H counts in the completed cohort but not window throughput; arrival 9/delivery 14 yields permanence 5, throughput 0, and overtime 4.
- **Initial history:** an initialized order completing at t=5 first reported `no_completed_orders` for its unavailable permanence. Its test now passes with `unknown_arrival_time` and `preparation_start_predates_trace`; active and reserved occupancy from t=0 is retained.
- **Finite-output integrity:** `test_finite_inputs_that_overflow_metric_outputs_are_rejected` first failed because `summarize` accepted finite inputs whose `capacity * horizon` overflowed to infinity. Setting `allow_inf_nan=False` on the shared frozen `MetricsModel` now raises Pydantic `ValidationError` instead of returning an invalid metrics/run contract. This leaves physical capacity and horizon limits unchanged.

## Final checks

- `uv run --frozen --offline pytest tests/test_metrics.py -q` — **10 passed**.
- `uv run --frozen --offline ruff check src/boquitas/metrics.py src/boquitas/metrics_models.py tests/test_metrics.py` — **all checks passed**.
- `uv run --frozen --offline mypy src/boquitas` — **no issues found in 11 source files**.
- Whole-project `uv run --frozen --offline ruff check .` — **all checks passed**, with a transient `Access is denied` filesystem warning; the scoped metrics check above also passed without warnings.

The 61-test pre-existing suite was preserved. Full-suite acceptance and cross-module export review remain with the main agent under task 4.1.

Subsequent main-agent acceptance completed task 4.1: the final full suite passed all 109 tests, Ruff/mypy passed without the earlier filesystem warning, and independent numerical/file checks passed. See [independent verification](verification-report.md). The block results above retain their original chronology; user approval before spec04 is still pending.
