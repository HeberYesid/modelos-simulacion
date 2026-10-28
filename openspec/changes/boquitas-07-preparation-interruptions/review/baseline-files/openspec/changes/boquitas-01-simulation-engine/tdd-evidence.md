# TDD evidence

This log records only commands actually run for this change. Test slices use the approved public `simulate(config, demand, initial_state)` boundary. Pytest's cache plugin is disabled in targeted commands because this workspace denies writes to `.pytest_cache`; it does not disable test execution.

## 1.1 Tooling setup (no behavior test)

- `uv --version` -> exit 0, `uv 0.9.26 (ee4f00362 2026-01-15)`.
- `C:\Python313\python.exe --version` -> exit 0, `Python 3.13.7`.
- `uv sync --python C:\Python313\python.exe` with `UV_CACHE_DIR=<project>\.uv-cache` -> exit 0; created `.venv` and installed the locked project dependencies.
- `uv run --python C:\Python313\python.exe pytest --version` -> exit 0, `pytest 9.1.1`.
- `uv run --python C:\Python313\python.exe ruff --version` -> exit 0, `ruff 0.17.1`.
- `uv run --python C:\Python313\python.exe mypy --version` -> exit 0, `mypy 2.4.0 (compiled: yes)`.

## 1.2 Empty deterministic run

Test: `test_empty_input_returns_repeatable_trace_with_closed_window_and_idle_resources`.

- RED command: `uv run --python C:\Python313\python.exe pytest -p no:cacheprovider tests/test_simulation_engine.py -q` -> exit 1. Observed collection failure: `ImportError: cannot import name 'EngineConfig' from 'boquitas'`.
- Minimal implementation: exported `EngineConfig` and the versioned trace types; added the empty simulation path using SimPy virtual time and stable idle worker identities.
- GREEN: same command -> exit 0, output `. [100%]` and `1 passed in 0.39s`.

## 1.3 Input validation slices

- Capacity test: `test_active_pool_with_zero_capacity_is_rejected_with_field_issue`.
  - RED: `uv run --python C:\Python313\python.exe pytest -p no:cacheprovider tests/test_simulation_engine.py::test_active_pool_with_zero_capacity_is_rejected_with_field_issue -q` -> exit 1, `Failed: DID NOT RAISE InputValidationError`.
  - Minimal implementation: validate active and inactive capacities before constructing the simulation environment; report `config.cashiers` with code `capacity_minimum`.
  - GREEN: `uv run pytest -q tests/test_simulation_engine.py::test_active_pool_with_zero_capacity_is_rejected_with_field_issue` -> exit 0, `1 passed in 0.15s`.
- Time test: `test_nonfinite_horizon_is_rejected_as_a_field_issue`.
  - RED: `uv run pytest -q tests/test_simulation_engine.py::test_nonfinite_horizon_is_rejected_as_a_field_issue` -> exit 1; Pydantic raised its raw `ValidationError` (`finite_number`) instead of the public `InputValidationError`.
  - Minimal implementation: translate Pydantic model validation details into the public `{path, code, message}` issue shape before an input model is created.
  - GREEN: `uv run pytest -q tests/test_simulation_engine.py` -> exit 0, `3 passed in 0.14s`.
- Identity test: `test_person_identity_cannot_appear_twice_in_one_order`.
  - RED: `uv run pytest -q tests/test_simulation_engine.py::test_person_identity_cannot_appear_twice_in_one_order` -> exit 1, `Failed: DID NOT RAISE InputValidationError`.
  - Minimal implementation: reject repeated person IDs in an order through the public input model.
  - GREEN: same command -> exit 0, `1 passed in 0.16s`.
- Current full suite: `uv run pytest -q` -> exit 0, `4 passed in 0.14s`.

## 2.1 Shared order with two people

Test: `test_two_people_share_one_payment_and_one_preparation`.

- RED: `uv run pytest -q tests/test_simulation_engine.py::test_two_people_share_one_payment_and_one_preparation` -> exit 1, `NotImplementedError: Non-empty workloads are added in later behavior slices.`
- Minimal implementation: added a coordinated SimPy controller for a shared order, one payment, one preparation, individual completion projections and ordered trace events.
- GREEN: same command -> exit 0, `1 passed in 0.15s`.
- Regression check: `uv run pytest -q` -> exit 0, `5 passed in 0.15s`.

## Review fix: preserve positive sub-nanosecond work

Test: `test_positive_subnanosecond_payment_is_not_completed_early`.

- RED: `uv run pytest -q tests/test_simulation_engine.py::test_positive_subnanosecond_payment_is_not_completed_early` -> exit 1, assertion showed `payment_active_ended.time_s == 0.0`, expected `5e-10`.
- Minimal implementation: removed epsilon from arrival and stage-due eligibility checks; retained a separate logical event time so SimPy's accumulated float clock cannot make a future timestamp eligible early.
- GREEN: same command -> exit 0, `1 passed in 0.15s`.
- Regression check: `uv run pytest -q` -> exit 0, `6 passed in 0.15s`.

## 2.2 Tuesday A/B sequence

Test: `test_tuesday_orders_a_and_b_follow_the_solved_payment_and_prep_timeline`.

- This fixture was already supported by the minimal multi-order controller introduced for 2.1, so no additional implementation change or manufactured RED was made.
- Acceptance check: `uv run pytest -q tests/test_simulation_engine.py::test_tuesday_orders_a_and_b_follow_the_solved_payment_and_prep_timeline` -> exit 0, `1 passed in 0.16s`. Public events show A's payment/preparation/delivery at `0/2/5` and B's at `2/4/7`.

## 2.3 Fifth eligible Tuesday order

Test: `test_fifth_paid_order_waits_until_a_preparer_is_released`.

- The 2.1 controller already dispatches only to idle preparers, so this required no additional implementation change or manufactured RED.
- Acceptance check: `uv run pytest -q tests/test_simulation_engine.py::test_fifth_paid_order_waits_until_a_preparer_is_released` -> exit 0, `1 passed in 0.18s`. Four orders occupy the four preparers; E starts at A's delivery time 6 on the released worker.

## 2.4 Regular A/B sequence

Test: `test_regular_mode_keeps_the_integrated_worker_until_each_delivery`.

- RED: `uv run pytest -q tests/test_simulation_engine.py::test_regular_mode_keeps_the_integrated_worker_until_each_delivery` -> exit 1, `NotImplementedError: Regular-mode behavior is added in a later behavior slice.`
- Minimal implementation: dispatch regular orders through the integrated pool and retain the assigned worker across active payment and preparation; the worker is released at delivery.
- GREEN: same command -> exit 0, `1 passed in 0.16s`. Public events show A delivery at 5 and B payment start/delivery at 5/10 on `integrated-1`.
- Regression check: `uv run pytest -q` -> exit 0, `9 passed in 0.15s`.

## 2.5 Stable queues, completion ties and worker IDs

- Existing behavior coverage: `test_initial_payment_service_uses_arrival_then_input_sequence` passed (`1 passed in 0.17s`), and `test_simultaneous_orders_and_workers_use_stable_ids_and_input_order` passed (`1 passed in 0.16s`). These exercised the existing dispatcher without a new implementation change.
- Transfer reorder test: `test_tuesday_preparation_queue_uses_payment_completion_after_transfer` first failed with the temporary transfer `NotImplementedError`; after adding Tuesday pending-confirmation completion and paid-queue insertion, it passed (`1 passed in 0.18s`). B's payment/preparation starts at 2, before A completes confirmation at 11.
- Completion-tie test: `test_paid_completion_tie_uses_confirmation_scheduling_order`.
  - RED: `uv run pytest -q tests/test_simulation_engine.py::test_paid_completion_tie_uses_confirmation_scheduling_order` -> exit 1; observed `['A', 'B']`, expected `['B', 'A']` for simultaneous payment completion after confirmations.
  - Minimal implementation: use the public `payment_active_ended` sequence as the deterministic start order of each confirmation wait.
  - GREEN: same command -> exit 0, `1 passed in 0.16s`.
- Current full suite: `uv run pytest -q` -> exit 0, `13 passed in 0.16s`.

## 2.6 Confirmation stages and worker state

The confirmation transitions were implemented in the transfer reorder slice (2.5), so this acceptance fixture required no extra code change or manufactured RED.

- Tuesday: `test_tuesday_preparation_queue_uses_payment_completion_after_transfer` -> exit 0, `1 passed in 0.18s`; A's active end at 1 records `worker_reserved=False` and `worker_active=False`, and B starts payment at that same time.
- Regular: `test_regular_transfer_reserves_integrated_worker_while_inactive` -> exit 0 in the combined targeted command `uv run pytest -q tests/test_simulation_engine.py::test_tuesday_preparation_queue_uses_payment_completion_after_transfer tests/test_simulation_engine.py::test_regular_transfer_reserves_integrated_worker_while_inactive`, with `2 passed in 0.17s`. A remains on `integrated-1`, reserved/inactive from 2 to 12; B starts only after A's delivery at 15. A has one active payment stage and no second verification stage.
- Current full suite: `uv run pytest -q` -> exit 0, `14 passed in 0.16s`.

## 3.1 Whole-group patience before payment

Test: `test_waiting_group_abandons_together_before_first_payment_service`.

- RED: `uv run pytest -q tests/test_simulation_engine.py::test_waiting_group_abandons_together_before_first_payment_service` -> exit 1, `NotImplementedError: Patience behavior is added in a later behavior slice.`
- Minimal implementation: keep deadlines only for orders still waiting for first payment; dispatch and settle zero-time work before expiry, then abandon the whole order and its linked people. Orders that have started payment leave the deadline candidate set.
- GREEN: same command -> exit 0, `1 passed in 0.18s`. B abandons at 3 with both people; A starts payment at 0 with patience 1 and completes at 8 without abandonment.
- Regression check: `uv run pytest -q` -> exit 0, `15 passed in 0.19s`.

## 3.2 Service wins at exact patience deadline

Test: `test_service_start_wins_when_worker_release_matches_patience_deadline`.

- The current settlement order already completes releases, dispatches, drains immediate stages and only then expires waiting orders, so no implementation change or manufactured RED was needed.
- Acceptance check: `uv run pytest -q tests/test_simulation_engine.py::test_service_start_wins_when_worker_release_matches_patience_deadline` -> exit 0, `1 passed in 0.17s`. A delivers at 5, B starts payment at 5 afterward in sequence order, and B is not abandoned.
- Regression check: `uv run pytest -q` -> exit 0, `16 passed in 0.16s`.

## 3.3 Admission close and drain

Tests: `test_closing_stops_admissions_but_drains_last_accepted_order` and `test_cancelled_patience_deadline_does_not_extend_drain`.

- The event calendar already filters arrivals to `[0,H)` and only considers patience deadlines of orders still waiting for payment, so no implementation change or manufactured RED was needed.
- Targeted command: `uv run pytest -q tests/test_simulation_engine.py::test_closing_stops_admissions_but_drains_last_accepted_order tests/test_simulation_engine.py::test_cancelled_patience_deadline_does_not_extend_drain` -> exit 0, `2 passed in 0.18s`. A at 9 delivers at 14, B at 10 is absent from the admitted registry, and a cancelled patience deadline does not push the run past H.
- Regression check: `uv run pytest -q` -> exit 0, `18 passed in 0.16s`.

## Review corrections to public input validation

These contract regressions were added after independent review; each was reproduced at the public boundary and corrected before scheduling.

- Empty people: test `test_order_requires_at_least_one_person`; `uv run pytest -q tests/test_simulation_engine.py::test_order_requires_at_least_one_person` RED -> `Failed: DID NOT RAISE InputValidationError`; after rejecting empty groups through the public input model, the same command GREEN -> `1 passed in 0.17s`.
- Cross-order identity, including scheduled demand at H: test `test_person_id_is_unique_across_all_scheduled_orders_before_admission_filtering`; `uv run pytest -q tests/test_simulation_engine.py::test_person_id_is_unique_across_all_scheduled_orders_before_admission_filtering` RED -> `Failed: DID NOT RAISE InputValidationError`; after checking identities across all demand and initial orders before admission filtering, the same command GREEN -> `1 passed in 0.16s`, with path `demand[1].person_ids[0]` and code `duplicate_person_id`.
- Clock format: test `test_opening_time_must_be_a_valid_hh_mm_ss_clock`; `uv run pytest -q tests/test_simulation_engine.py::test_opening_time_must_be_a_valid_hh_mm_ss_clock` RED -> `Failed: DID NOT RAISE InputValidationError`; after checking 24-hour `HH:MM:SS`, the same command GREEN -> `1 passed in 0.17s`, with path `config.opening_time` and code `time_format`.

## 3.4 Initial waiting-payment queue (first slice)

Test: `test_initial_waiting_payment_precedes_new_time_zero_arrivals_without_rearrival`.

- RED: `uv run pytest -q tests/test_simulation_engine.py::test_initial_waiting_payment_precedes_new_time_zero_arrivals_without_rearrival` -> exit 1, `NotImplementedError: Initial-state behavior is added in a later behavior slice.`
- Minimal implementation: initialize a waiting order once at t=0, preserve its explicit queue rank and unknown arrival as null, and place it ahead of new time-zero demand without synthesizing an arrival event.
- GREEN: same command -> exit 0, `1 passed in 0.16s`.
- Regression check: `uv run pytest -q` -> exit 0, `22 passed in 0.17s`.

## 3.4 Remaining initial-state coverage

Only the waiting-payment initialization boundary above had an observed RED→GREEN cycle. The coordinator initialization edit also included the other stage forms; their stage-specific tests were added after that edit and passed directly. No separate RED was observed for those fixtures, and the waiting-order RED is not attributed to them.

- `test_initial_active_payment_uses_remaining_time_without_past_events`: `uv run pytest -q tests/test_simulation_engine.py::test_initial_active_payment_uses_remaining_time_without_past_events` -> exit 0, `1 passed in 0.18s`; active payment ends at 2, confirmation ends at 12, preparation starts at 12, delivery is 15, and historical arrival remains null.
- `test_initial_pending_payment_has_no_fabricated_active_end`: `uv run pytest -q tests/test_simulation_engine.py::test_initial_pending_payment_has_no_fabricated_active_end` -> exit 0, `1 passed in 0.18s`; completion at 2 has no `payment_active_ended` or earlier payment-start event.
- `test_initial_preparation_releases_worker_to_initial_paid_queue`: `uv run pytest -q tests/test_simulation_engine.py::test_initial_preparation_releases_worker_to_initial_paid_queue` -> exit 0, `1 passed in 0.19s`; A completes at 3 and B begins on its released preparer at 3.
- `test_initial_paid_queue_ranks_precede_new_time_zero_paid_orders`: `uv run pytest -q tests/test_simulation_engine.py::test_initial_paid_queue_ranks_precede_new_time_zero_paid_orders` -> exit 0, `1 passed in 0.19s`; reversed initial ranks start B then A before newly paid C, with unknown arrivals retained as null.
- `test_zero_time_initial_and_new_work_settles_before_patience_expiry`: `uv run pytest -q tests/test_simulation_engine.py::test_zero_time_initial_and_new_work_settles_before_patience_expiry` -> exit 0, `1 passed in 0.18s`; all three orders deliver at 0 before patience expiry.
- `test_initial_waiting_order_uses_remaining_patience_from_time_zero`: `uv run pytest -q tests/test_simulation_engine.py::test_initial_waiting_order_uses_remaining_patience_from_time_zero` -> exit 0, `1 passed in 0.20s`; the initialized waiter expires at its residual deadline 2.
- Initial validation acceptance checks: command `uv run pytest -q tests/test_simulation_engine.py::test_initial_queue_rejects_duplicate_ranks tests/test_simulation_engine.py::test_initial_state_rejects_two_orders_assigned_to_one_worker tests/test_simulation_engine.py::test_cross_list_person_identity_is_rejected_before_simulation` -> exit 0, `3 passed in 0.17s`; command `uv run pytest -q tests/test_simulation_engine.py::test_cross_list_order_identity_is_rejected_even_for_arrival_at_horizon tests/test_simulation_engine.py::test_regular_mode_rejects_an_initial_separate_preparation_queue` -> exit 0, `2 passed in 0.19s`.
- Current full suite: `uv run pytest -q` -> exit 0, `33 passed in 0.18s`.

## 3.5 Versioned immutable trace and replay

- Trace-detail test: `test_public_trace_exposes_stage_queue_and_resource_state_transitions`.
  - RED: `uv run pytest -q tests/test_simulation_engine.py::test_public_trace_exposes_stage_queue_and_resource_state_transitions` -> exit 1; `order_arrived` exposed `stage=None` and unset resource flags instead of public state.
  - Minimal implementation: populate stage, logical queue membership, and reservation/activity details on arrival, active-end, and payment-completion events. Pending confirmation is represented as an order stage, not a queue membership.
  - GREEN: same command -> exit 0, `1 passed in 0.23s`.
- Serialization/immutability acceptance: `uv run pytest -q tests/test_simulation_engine.py::test_trace_round_trips_as_json_and_is_deeply_immutable` -> exit 0, `1 passed in 0.23s`; the public trace round-trips through Pydantic JSON APIs, uses tuples for collections, and rejects nested event/data mutation.
- Replay acceptance: `uv run pytest -q tests/test_simulation_engine.py::test_public_events_reconstruct_final_orders_people_queues_and_workers` -> exit 0, `1 passed in 0.23s`; a consumer rebuilds terminal order/person/resource states and empty queues from public events only.
- Same-time and zero-duration coverage: stable service/worker ties pass in `test_simultaneous_orders_and_workers_use_stable_ids_and_input_order` and `test_paid_completion_tie_uses_confirmation_scheduling_order`; zero-duration cascades pass in `test_zero_time_initial_and_new_work_settles_before_patience_expiry`.
- Current full suite: `uv run pytest -q` -> exit 0, `36 passed in 0.20s`.

## 3.6 Same explicit demand in both staffing modes

Test: `test_same_explicit_workload_preserves_people_and_order_work_across_modes`.

- The existing mode-specific dispatcher preserved the explicit workload without a new implementation change or manufactured RED.
- Acceptance command: `uv run pytest -q tests/test_simulation_engine.py::test_same_explicit_workload_preserves_people_and_order_work_across_modes` -> exit 0, `1 passed in 0.25s`. Both traces retain the same orders and people and exactly one payment, preparation and delivery per order; delivery times differ due to resource rules.
- Current full suite: `uv run pytest -q` -> exit 0, `37 passed in 0.21s`.

## Preliminary tool checks (main-agent acceptance still pending)

- Final `uv run pytest` -> exit 0, 37 tests passed in 0.35s.
- First `uv run ruff check .` -> exit 1 with import ordering, one unnecessary typing annotation, four line-length findings, and access warnings from pytest temporary directories. After formatting those findings and excluding/ignoring the generated `pytest-cache-files-*` directories, the same command -> exit 0, `All checks passed!` with no warnings.
- First `uv run mypy src/boquitas` -> exit 1 with six type errors in the identity-validation loop and worker-pool tuple inference. After adding explicit union/tuple annotations, the same command -> exit 0, `Success: no issues found in 3 source files`.
- These are preliminary implementation checks only. OpenSpec task 4.1 remains unchecked for the main agent's independent review and rerun.

## Historical TDD qualification at the original handoff

Initial-state behavior was implemented and covered by public tests, but only the initial waiting-payment boundary had an observed pre-implementation RED. The generalized initializer already supported active payment, pending confirmation and preparation by the time their separate tests were added. Those tests passed directly; no RED is claimed for them. At that handoff, task3.4 was left unchecked pending the user's decision on the strict-TDD qualification. No failing test was manufactured.

## User policy decision on 2026-10-22

The user explicitly adopted selective TDD and requested instruction/OpenSpec updates while preserving all 37 tests. This resolves the former method-only blocker on task3.4 using the existing functional checks and independent review. The task is now complete under the current policy; the test chronology recorded above is unchanged and no new historical RED is claimed. Future critical rules/calculations and testable regressions use focused test-first cycles; ordinary integration/UI/tooling can be developed and verified in coherent blocks with concise evidence. User approval before advancing to spec02 is still required.

