# Spec07 Block 2 — interruption engine

Date: 2026-10-24  
Scope: `engine.py`, a new public-boundary engine test module, and this evidence report. No task checkboxes or unrelated source files were changed.

## Baseline preservation

Before editing, the main-agent backup at `review/baseline-files/src/boquitas/engine.py` matched the working `src/boquitas/engine.py` exactly: both were **32,493 bytes**, SHA-256 `8095B068866F06B367BFED422C8BAF4D7D6ED188BED67C358A205AE89F2E15A8`.

## Engine changes

- `simulate` now overloads V1 config to V1 trace and V2 config to V2 trace. V1 uses the existing coordinator path and V1 event model.
- V2 configs are reconstructed from `model_dump(mode="python")` at the public boundary so `model_copy(update=...)` cannot bypass validators. Script references must match an initialized or pre-H demand order; arrivals at or after H receive an indexed `order_excluded_at_h` diagnostic.
- The shared coordinator adds one remaining-work value to each interrupted order and one resume obligation to the sole integrated worker. Pause removes the old completion deadline and releases occupancy. The worker performs one cashier transaction, keeps any external confirmation reservation, places the paid order in the regular preparation queue, then resumes the same order before other work.
- V2 dispatch takes completed paid orders before new payment work. Script entries enter the same event calendar as arrivals, deadlines and closure. Stage completions settle before scripts; script processing precedes patience expiry.
- Invalid targets, FIFO violations, occupied-worker/nested attempts, already-paid or abandoned orders, and dangling scripts raise indexed `InputValidationError`s. No partial trace is returned.
- V2 events expose assignment/reserved/active state for regular transitions. The interrupting `payment_completed` event reports the paid cashier order in the preparation queue with the worker released before the resume event. V1 event fields and serialized output remain unchanged.

## TDD evidence

- The core public `simulate(EngineConfigV2, A/B tape, [])` test first failed because the existing V1 trace rejected `EngineConfigV2`. After adding the V2 trace path and shared coordinator transitions, the test passed with A delivering at 14 and B at 17, one initial preparation start per order, and no stale A delivery at 12.
- The main agent added `test_interrupting_payment_completion_exposes_paid_waiting_without_worker_ownership` and observed RED: `queue` was `None`, `assigned_order_id` was B, and the worker remained reserved. I reproduced that failure. The V2 completion path now clears B/worker occupancy before emitting `payment_completed`, records `queue="preparation"`, then resumes A. The review regression, core test and confirmation test passed together (**3 passed**).
- Additional schedule, lifecycle and boundary oracles were added after the initial engine path existed. Their final passing results are acceptance evidence; no separate RED chronology is claimed for those cases.

## Verification

- `uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_interruption_engine.py -q` — **22 passed**.
- `uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_simulation_engine.py -q` — **37 passed** (all existing engine tests).
- `uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_interruption_contracts.py tests/test_interruption_review.py -q` — **33 passed**.
- `uv --cache-dir .uv-cache run --frozen --offline ruff check src/boquitas/engine.py tests/test_interruption_engine.py tests/test_interruption_contracts.py tests/test_interruption_review.py` — **passed**.
- `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas` — **passed**, 15 source files.
- Regenerated complete V1 run JSON and compared bytes against both preserved references. Tuesday: **895,752 bytes**, byte-identical, SHA-256 `8bbe6b117f59dde367816d8ed63bb013b0ad624d916a57159c084fcff4051dd7`. Regular: **976,770 bytes**, byte-identical, SHA-256 `d0093084b4e99e59000725ae99c8cab2603bb3f7a666c986f731b06b5c157e69`.

The whole project suite was not run in this block because the main agent is isolating the concurrent H01 saved-file reopen regression. That test and its H01 source were not run or modified.

## Remaining scope

Engine execution and the assigned engine acceptance cases are implemented. Metrics calculation, scenario/experiment runners, JSON/CSV/API contracts, frontend editing, replay and visual acceptance remain outside this block. No OpenSpec tasks were checked; the main agent owns acceptance and status.
