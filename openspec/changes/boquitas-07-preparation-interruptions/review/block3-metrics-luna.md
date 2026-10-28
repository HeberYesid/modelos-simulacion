# Spec07 Block 3: Metrics

Date: 2026-10-24  
Scope: INT-11 and INT-12; task 4.1–4.3.  
Owned source changes: `src/boquitas/metrics.py` and `tests/test_interruption_metrics.py`.

## Implemented behavior

- `summarize` dispatches version-1 and version-2 public traces to typed results. The version-1 summarizer retains its existing calculations and serialization; the version-2 path reads only ordered public events and final states.
- Fully observed, completed V2 preparations report `preparation_active_s`, `preparation_paused_s`, `preparation_pause_count`, and the existing `preparation_elapsed_s`. The first `preparation_started` event remains authoritative; resume events do not replace it.
- Initial orders already preparing without a known start expose null full-history active, paused, pause-count, and elapsed values with `preparation_start_predates_trace`. Their observed worker activity still contributes to window utilization.
- V2 regular runs expose the payment-completion-to-first-preparation queue wait. A paused order is excluded from that queue. Queue/resource integrations are clipped to `[0,H)`; post-H completion remains in admitted-cohort lifecycle metrics. Confirmation contributes reserved time, not active service time.
- Order and person projections preserve existing cohort and weighting conventions. Shared orders contribute one workload and one worker timeline while each member receives a person projection.

New summary IDs for UI translation:

- `duration.preparation_active.order.{new,initialized,all}` and `duration.preparation_active.person.{new,initialized,all}`
- `duration.preparation_paused.order.{new,initialized,all}` and `duration.preparation_paused.person.{new,initialized,all}`
- `duration.preparation_pause_count.order.{new,initialized,all}` and `duration.preparation_pause_count.person.{new,initialized,all}`
- Existing `duration.preparation_queue_wait.order/person.{new,initialized,all}` IDs are populated for V2; V1 regular results retain their existing unavailable state.

## Verification evidence

- Before editing, the required baseline backup existed and matched `src/boquitas/metrics.py` exactly: SHA-256 `72C9F975D4254DAB66FB62A2A524DC54043DBB9CD9A1764B70AC8EF30797D387`.
- Selective TDD RED/GREEN: `test_core_version_two_summary_reports_active_preparation_seconds` failed against the V1-only implementation because `OrderMetric` had no `preparation_active_s`; after adding the V2 public summarizer, that focused test passed.
- The manually solved public trace checks cover the core interruption, confirmation reservation, two pauses, an initialized residual preparation with unknown historical start, a shared group, and completion after H. They verify A's core values `active=10`, `paused=2`, `count=1`, `elapsed=12`, the core paid-queue mean `0.35`, and integrated active fraction `0.85`.
- After independent review, corrected only synthetic fixture data: repeated-pause remaining work at t=9 is 5 seconds; interrupting `payment_completed` events expose the released worker and paid preparation queue; terminal final orders have no assigned worker. The metrics algorithm was unchanged. The focused tests were rerun after these corrections.
- After the engine owner corrected the intermediate `payment_completed` worker-release state, the actual core engine integration `summarize(simulate(...))` passed with A/B deliveries at 14/17 and the expected core metrics. The post-fix focused command `uv --cache-dir .uv-cache run --frozen --offline pytest -q tests/test_interruption_metrics.py::test_core_engine_trace_produces_the_same_interruption_metrics tests/test_metrics.py tests/test_interruption_metrics.py`: **17 passed** (10 existing metrics tests and 7 new interruption-metrics tests).
- `uv --cache-dir .uv-cache run --frozen --offline ruff check src/boquitas/metrics.py tests/test_interruption_metrics.py`: **All checks passed**.
- `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas`: **Success: no issues found in 15 source files**.
- `git diff --check`: exit code 0; Git printed its existing LF-to-CRLF working-copy notice for `openspec/config.yaml`.
- Direct comparison against the backed-up V1 `summarize` implementation produced identical `model_dump_json()` bytes for four V1 traces: empty run (26,645 bytes), regular shared orders with confirmation (29,564), Tuesday shared orders (29,077), and regular initial preparation (28,514). No V1 metric serialization delta was observed.

## Pending checks and limits

- The full Python suite, browser/UI, API/export and visual replay checks were not run in this bounded metrics block. Main-agent review and whole-change acceptance remain pending.
- This block does not complete or check off OpenSpec tasks, claim empirical calibration, or modify API/UI/docs/contracts/engine files.
