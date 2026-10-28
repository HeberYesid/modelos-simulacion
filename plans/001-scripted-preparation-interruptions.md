# Plan 001: Pause preparation for one cashier transaction and resume its remaining work

> **Spec07 implementation approved on 2026-10-24, in bounded Luna blocks with independent main-agent review.** The initial proposal and planning-only approval are historical; the subsequent user instruction authorizes implementation while preserving version 1/tests. This original handoff plan remains supporting context; [Spec07](../openspec/changes/boquitas-07-preparation-interruptions/proposal.md) contains the authoritative requirements/design/tasks. Do not commit, push, create a PR, deploy, archive or synchronize specifications under this authorization.
>
> **Drift check:** planned against commit `bdb7591` on 2026-10-24 and the uncommitted working tree fingerprinted in `plans/evidence/preparation-proposal-baseline.json`. Most application files are untracked at that commit. `git diff --stat bdb7591..HEAD -- src tests web docs openspec` is insufficient alone: compare the recorded SHA-256 values and the excerpts below with the live working tree. Preserve all pre-existing work. If the affected code has changed, re-review the plan before executing it.

## Status and purpose

- Priority: P2, before attempting empirical calibration of the regular-day model.
- Effort: L. The engine transition affects metrics, versioned files, API consumers and replay.
- Risk: HIGH for resource accounting, duplicate work and compatibility; mitigated by opt-in behavior, explicit schedules, version separation and public-boundary tests.
- Category: direction / domain-model extension.
- Status: Spec07 implementation authorized; proceeding in reviewed Luna blocks.
- Dependencies: Spec07 requirements/design/tasks and observed main-agent acceptance per block.
- Scope of investigation: interruption-related paths only; no general codebase audit.

The regular-day observation on 2026-10-23 contains eight orders, each represented by one cashier record and one delivery record. The user explicitly confirmed that matching IDs 1–8 refer to the same orders, that delivery `hora_inicio` is preparation start, and that one integrated worker paused preparation to charge another order, then resumed. These confirmations apply to that visit only; Tuesday station IDs remain unlinked.

Order 6 has an elapsed preparation window of 18:13:13–18:16:16. Order 7 arrived at cashier at 18:13:59 and was charged during 18:14:19–18:14:29. The 10-second cashier window falls within order 6's preparation window. Exact pause/resume boundaries and active-versus-external payment segments were not measured. Do not treat `183 − 10 = 173 s` as measured active preparation, or infer an immediate cashier-priority rule from this case.

## Approved decisions for Spec07 preparation

| Topic | Recommended first version | Evidence boundary |
| --- | --- | --- |
| Trigger | Explicit user-supplied interruption schedule | One observed interruption does not establish a general scheduling policy; cashier service began 20 s after arrival |
| Mode/capacity | Regular mode with exactly one integrated worker | The confirmed case uses one worker |
| Work accounting | Preserve completed preparation work; resume only the remainder | The user confirmed continuation of the same preparation |
| Work order | One cashier transaction per interruption, then resume the suspended preparation before starting the newly paid order's preparation | A bounded proposed policy, not a measured universal business rule |
| Payment confirmation | Preserve the current regular-mode rule: confirmation reserves the worker while inactive; resume after full payment completion | This is a compatibility assumption; the observed payment medium was not recorded |
| Compatibility | Existing version-1 inputs and results retain their behavior; interruption-enabled artifacts use a version-2 contract | Current consumers reject unknown events and versions |
| Automatic prioritization | Defer until the operator confirms trigger/safe-point rules and more evidence is available | Do not fit an interruption frequency, probability or safe-point delay from one case |

The user approved these recommendations on 2026-10-24 and requested their specification only. An automatic policy remains a separate design choice; enabling this first version would require a schedule. The application must make that limitation visible instead of implying that an operating policy was learned from observations.

## Current state and evidence

Paths below are relative to `C:/Users/HeberYesid/Desktop/Universidad Trabajos/Modelos-simulación`.

| Path | Current role / affected behavior |
| --- | --- |
| `src/boquitas/models.py` | Immutable public engine inputs and version-1 trace; event types contain no pause/resume |
| `src/boquitas/engine.py` | Centralized event coordinator, regular resource dispatch, stage deadlines and completion |
| `src/boquitas/scenarios.py`, `experiments.py` | Scenario configuration, generated demand and replayable run/experiment wrappers |
| `src/boquitas/metrics.py`, `metrics_models.py` | First preparation timestamp, elapsed time, queue integration and worker utilization |
| `src/boquitas/exports.py` | Strict JSON loaders and CSV projections |
| `src/boquitas/api_models.py`, `api.py` | Public request/response validation and saved-file endpoints |
| `web/src/replay/project.ts`, `scene.ts` | Strict version/event validation and visible order/worker states |
| `web/src/main.ts`, `components/scenario-editor.ts`, `components/results.ts` | File-version checks, scenario editing and event/metric presentation |

Relevant current excerpts, read directly from the working tree:

```python
# src/boquitas/engine.py:309-320
if self.config.mode == "regular":
    integrated_workers = [
        worker for worker in self.workers.values() if worker.pool == "integrated"
    ]
    for worker in integrated_workers:
        if worker.reserved:
            continue
        order = self._oldest_waiting_payment()
        if order is None:
            break
        self._start_payment(order, worker)
```

```python
# src/boquitas/engine.py:453-455
if self.config.mode == "regular":
    worker = self.workers[order.worker_id or ""]
    self._start_preparation(order, worker)

# src/boquitas/engine.py:457-460
def _start_preparation(self, order: _Order, worker: _Worker) -> None:
    order.status = "preparing"
    order.worker_id = worker.worker_id
    order.stage_due_s = self.current_time_s + order.preparation_s
```

Calling `_start_preparation` to resume would currently restart the full workload and emit another initial-start event. Payment completion also starts the newly paid order immediately, leaving no opportunity to resume another order first.

`_Coordinator._settle_current_time` at `engine.py:237` handles completions, arrivals, dispatch and patience expiry in a stable order; `_next_event_time` at line 500 builds the future calendar from arrivals, stage deadlines and patience. Extend this architecture rather than introducing a second resource manager.

`metrics.py:48-49` sets `preparation_started_s` whenever it sees `preparation_started`; resume must use a different event. `web/src/replay/project.ts:75` defines an explicit accepted-event set, and its validator at line 112 accepts only version 1. `web/src/main.ts:649` also checks version 1. JSON loaders in `exports.py:154-171` call the current concrete version-1 models. Adding engine events alone would leave these consumers incompatible.

The approved engine requirements currently reserve the integrated worker through delivery (ENG-04), disallow an independent initial regular preparation queue (ENG-09), define the version-1 trace (ENG-10) and exclude pauses (ENG-11). The proposed extension needs explicit requirement amendments; retain the legacy semantics when the extension is off. Do not rewrite historical verification results.

Conventions: use immutable typed public models, seconds as units, stable `(time_s, seq)` ordering, one payment/preparation per shared order and `InputValidationError` with field-level diagnostics. Tests should observe public traces/metrics, following `tests/test_simulation_engine.py::test_regular_mode_keeps_the_integrated_worker_until_each_delivery`, `test_regular_transfer_reserves_integrated_worker_while_inactive` and `tests/test_metrics.py::test_shared_order_waiting_time_is_summarized_by_order_and_person`.

## Proposed public behavior

### Inputs and versioning

Preserve `simulate(config, demand, initial_state)` as the public boundary. Recommend a version-2 configuration for the new path, with `preparation_interruption_policy = "scripted_cashier"` and an immutable `cashier_interruptions` list. Each record contains `at_s`, `suspended_order_id` and `cashier_order_id`. Times are explicit nonnegative finite simulation offsets. IDs refer to actual admitted/initialized demand, never to guessed people or imported station joins.

Reject this policy outside regular mode or with an integrated capacity other than one. Reject unknown/equal order IDs, repeated script records, non-finite/negative times, or references to arrivals excluded at the horizon. Entries must have strictly increasing times for the single worker. A script may occur after admissions close if both orders were already admitted or initialized; closure still prevents new arrivals at or beyond H.

At execution time, the suspended order must be actively preparing on that worker, have positive remaining work, and the cashier order must be the FIFO-eligible waiting-payment order. It must not have abandoned or started payment already. An impossible script fails the run with a structured diagnostic that identifies its entry; it is not silently ignored or converted to a partial successful result. A script still unconsumed when all orders are terminal is also invalid.

Version 1 must continue to load, run, export and replay exactly as before. Use explicit version-2 models/unions at engine, scenario, run, experiment and metric envelopes where the new payload is present. Keep import-report and unrelated contracts at their existing versions. Never insert new events into an artifact labeled version 1, silently migrate a saved scientific file, or hand-edit generated TypeScript. Add version-2 fixtures; retain the existing version-1 reference fixture.

### Pause, charge, resume

1. At the script instant, subtract actual preparation progress since the last start/resume from the remaining work. Clear the old preparation deadline so it cannot deliver the order while paused. The suspended order enters `preparation_paused`.
2. Store a resume obligation on the worker and change its active assignment to the cashier order. The suspended order retains its identity and remaining workload but does not claim a second active or reserved worker.
3. Execute one ordinary payment, including optional external confirmation under the existing regular-mode reservation rule. Do not interrupt a payment, confirmation or another paused episode; nested pauses are unsupported.
4. The newly paid order enters a regular-mode paid preparation queue. It owns no worker while waiting. This is an explicit extension of regular behavior, not a second preparation pool.
5. After full payment completion, resume the suspended order on the same worker before starting another preparation. Resume uses `now + remaining_preparation_s`, never `now + original_preparation_s`.
6. After delivery, select already-paid waiting preparations by payment-completion time/event sequence before taking a fresh unpaid order. A resumed in-progress order has precedence over not-yet-started preparations. Further valid scripted interruptions are allowed after resumption.

Without a scheduled interruption, no worker is preempted automatically. If no paid queue or resume obligation exists, legacy regular dispatch applies. Retain one authoritative worker assignment and count worker activity once at every instant.

Legacy-valid initial states remain supported, including an initially preparing order with known residual work. Do not add an initializer for an already-paused order in this first version. Unknown historical preparation starts stay unavailable; report residual observed/simulated work separately from a full historical duration.

### Timestamp ordering

For the new path, settle stage completions and their zero-time consequences, admit eligible arrivals/close admissions, then apply the scheduled interruption before remaining FIFO dispatch and patience expiry. Resume obligations precede new preparation starts. Preserve service priority at the exact patience deadline. When preparation completes exactly at a scripted interruption time, completion wins: the now-inapplicable script produces a diagnostic instead of a zero-work pause. Zero-duration payments must settle once without duplicate events or a scheduling loop. Do not change the legacy ordering.

### Public events, metrics and replay

Add version-2 `preparation_paused` and `preparation_resumed` events. Include the suspended order ID, worker ID, remaining preparation seconds and a related cashier order ID. Emit `preparation_started` once per order; emit each pause/resume once per episode. Event data must show the resulting worker assignment/reservation/activity, allowing metrics and replay to reconstruct state without private engine access. Keep one payment and one final delivery per order.

Report preparation active seconds, cumulative paused seconds, pause count, and elapsed time from first preparation start to delivery separately. For a fully observed complete simulated preparation, `elapsed = active + paused`; unknown initialized history remains null with a reason. Separate first-preparation queue wait for a paid order from interruptions after preparation has started. Distinguish this from total time since cashier arrival.

Worker utilization integrates actual segments: preparation, payment, externally reserved inactive time and idle time. A paused order does not add preparation activity while the worker charges another order. The replay must show the old order paused, the same worker charging the new order, and subsequent resumption, using the saved trace rather than reconstructed guesses. CSV and JSON must preserve units, version, policy and pause information.

For stochastic scenarios, scripts are explicit scenario assumptions bound to generated order IDs. They must validate against each generated tape. An infeasible script makes that replication fail visibly under the existing diagnostic workflow; never discard failed replications and advertise a successful batch. Changing the script is a scheduling assumption, not a change to workload generation. Do not automatically reuse a real visit's script for random demand or claim a learned interruption process.

## Architecture recommendation and documentation check

The existing engine owns one centralized SimPy coordinator and explicit stage deadlines. Extend `_Order` with remaining preparation/last-resume state and `_Worker` with one resume obligation, then integrate the script into that calendar. No new dependency or replacement resource system is proposed.

The official [SimPy machine-shop example](https://simpy.readthedocs.io/en/latest/examples/machine_shop.html), retrieved through Context7 on 2026-10-24, illustrates preserving remaining work by subtracting elapsed processing before resuming. The [process-interaction guide](https://simpy.readthedocs.io/en/latest/simpy_intro/process_interaction.html) documents process interrupts. Those examples use separate processes; retaining this repository's centralized coordinator is an architectural recommendation based on the inspected code, not a claim that SimPy requires either approach. Re-query current documentation if the later executor chooses to use a library interrupt API. Do not interrupt the coordinator itself or mix an independent resource model with the existing worker registry.

## Independently solved synthetic acceptance examples

These are proposed test oracles, not field measurements or tests already executed. Each test order uses explicit synthetic person IDs and no inferred group size.

**Core case:** one regular worker, H=20. A arrives at 0, active payment=2, preparation=10. B arrives at 5, active payment=2, preparation=3. Both confirmation waits are zero. Script: pause A at 5 to charge B.

| Interval | Work |
| --- | --- |
| 0–2 | Pay A |
| 2–5 | Prepare A: 3 s completed, 7 s remaining |
| 5–7 | A paused; pay B |
| 7–14 | Resume A: remaining 7 s |
| 14–17 | Prepare B |

Expected: A delivered at 14, B at 17; A preparation active=10, paused=2, elapsed=12. B payment wait=0, paid preparation wait=7. Worker active work=17 s within H=20, without double counting. Under the unchanged legacy policy A delivers at 12 and B at 17; B payment wait=7. The interruption shifts waiting and increases A's completion time in this case; it is not automatically a performance improvement.

**External confirmation:** use the same inputs but give B a 3 s confirmation wait. B is actively charged at 5–7 and reserves the inactive worker at 7–10. A resumes at 10 and delivers at 17; B prepares at 17–20. A active=10, paused=5, elapsed=15. This tests the proposed compatibility assumption, not an observed transfer for order 7.

**Repeated interruption:** use the core case, add C arriving at 8, payment=1, preparation=1; pause A again at 9 to charge C. A runs preparation at 2–5, 7–9 and 10–15, totaling 10 active s with 3 paused s. A delivers at 15, B at 18 and C at 19. B remains ahead of C in the paid preparation queue.

## Scope for a future approved implementation

Modify only these reviewed surfaces and their focused tests/fixtures:

- Domain: `src/boquitas/models.py`, `engine.py`, `scenarios.py`, `experiments.py`, `metrics_models.py`, `metrics.py`, `exports.py`, `api_models.py`, `api.py`, `__init__.py`.
- Contracts: `scripts/export_web_contracts.py`, `web/contracts/openapi.json`, additive version-2 fixtures in `web/contracts/fixtures/`, generated `web/src/api/schema.d.ts`, and `web/src/api/types.ts`.
- Consumers: `web/src/main.ts`, `services/api.ts`, `components/scenario-editor.ts`, `components/results.ts`, `replay/project.ts`, `replay/scene.ts`, `replay/host.ts`, and `domain/errors.ts` if labels require it. The host's paused-state labels/in-shop membership are a necessary INT-16 integration surface identified and reviewed during implementation recon. Use Spanish UI labels and existing styles.
- Tests: `tests/test_simulation_engine.py`, `test_metrics.py`, `test_scenarios.py`, `test_experiments.py`, `test_exports.py`, `test_api.py`; `web/tests/replay.test.ts`, `scenario-form.test.ts`, `results-readback.test.ts`; additive version-2 fixtures; one focused extension in `web/e2e/local-workflows.spec.ts` and `web/e2e-release/release-acceptance.spec.ts`.
- After authorization: the new/affected OpenSpec requirements and design, `docs/MANUAL_USUARIO.md`, `technical-guide.md`, and a concise implementation verification report. Do not rewrite historical acceptance evidence.

Outside scope: empirical fitting, changing raw observations, generalized station-ID joins, automatic policies, multiple integrated workers with this policy, nested interruptions, moving preparation between workers, recipes, partial deliveries, network services, dependency upgrades or changing Tuesday operation. `observation_import.py` and its correction fingerprints remain unchanged. Keep existing version-1 replay/reference fixtures byte-identical; add fixtures for version 2 rather than overwriting them. If a required edit falls outside this list, re-scope before implementing.

## Implementation order and verification gates — all pending

All commands below are future gates drawn from current project configuration/documentation. They were not run as software acceptance for this proposal. Execute from the repository root with existing locked dependencies; do not install or upgrade packages without separately established need/authorization.

1. **Approve behavior and amend requirements.** Record the accepted decisions, including scripted trigger, same-worker resumption, one-cashier-operation limit, confirmation reservation and version-2 compatibility. Resolve ENG-04/09/10/11 and downstream metric/replay implications through the existing project workflow. Gate: `openspec validate --changes --strict --no-interactive` exits 0 for the amended planning package. Do not implement while this step is pending.
2. **Specify contracts and test uncovered critical behavior first.** Add a focused public-boundary failing test for the core oracle before implementing it; confirm the failure is caused by missing interruption behavior. Define version-2 schemas and strict diagnostics, with version-1 compatibility tests. Gate: `uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_simulation_engine.py -k interruption` initially shows the relevant observed failure, then passes after the corresponding domain implementation. Do not manufacture RED by breaking legacy behavior.
3. **Implement calendar/resource transitions and numerical metrics in small tested slices.** Cover the core, confirmation, repeated interruption, paid queue and remaining-work invariants. Gate: `uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_simulation_engine.py tests/test_metrics.py tests/test_scenarios.py tests/test_experiments.py` exits 0 with the explicit oracle assertions. Keep existing behavioral tests.
4. **Propagate versioned file/API contracts.** Add version-2 round-trip, invalid-script and legacy-fixture tests. Update generated files with the existing exporter/generator, retaining version-1 reference data. Gates: `uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_exports.py tests/test_api.py`; `uv --cache-dir .uv-cache run --frozen --offline python scripts/export_web_contracts.py --check`; `pnpm --dir web contracts:check`. All exit 0, and existing version-1 scientific reference bytes remain unchanged.
5. **Expose truthful replay and scenario editing.** Add focused projector tests first for the new state transitions. The editor must preserve an explicit schedule across load/save/edit and disclose that it is a user assumption; never silently discard it on form changes. Load applicable frontend/browser skills before this later UI work. Gates: `pnpm --dir web test --run`, `pnpm --dir web typecheck`, `pnpm --dir web exec tsc --noEmit -p tsconfig.release.json`, `pnpm --dir web build`, and `pnpm --dir web test:e2e` exit 0. With production running, `pnpm --dir web exec playwright test --config playwright.release.config.ts` exits 0. Visually inspect pause, cashier assignment, resume, seeking and reopened version-1/version-2 runs.
6. **Review the full change and run final appropriate checks.** Gates: `uv --cache-dir .uv-cache run --frozen --offline pytest`; `uv --cache-dir .uv-cache run --frozen --offline ruff check .`; `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas`; the applicable contract/frontend/browser gates above; `openspec validate --changes --strict --no-interactive`; and final `git diff --check`/scope review. All must pass, with any unavailable runtime/visual check explicitly pending. Only then record engineering completion; do not equate it with empirical calibration/validation.

## Additional required edge coverage

- Legacy mode off, Tuesday mode, empty input and initial residual preparation retain existing results.
- B's patience expires before the script: reject the impossible script without service or successful output; exactly-at-deadline service wins.
- Script at preparation completion: completion wins, then a diagnostic; no zero-work pause or duplicate delivery.
- Zero-duration payment/confirmation, repeated future pauses and positive subnanosecond remaining work settle deterministically; no epsilon may erase legitimate work.
- Unknown ID, FIFO violation, duplicate time/entry, a nested attempt, a completed order, an excluded-at-H arrival and unsupported capacity produce actionable diagnostics.
- Closing admits only arrivals before H, permits valid scheduled work on already-admitted orders after H and drains every paid or paused order exactly once. A dangling script cannot be silently accepted.
- A shared order with multiple synthetic members creates one pause episode/workload; person projections do not duplicate resource use.
- Unknown initial history stays unavailable; no full active duration is invented from residual segments.
- Experiment failures are retained, denominators disclosed and old/new versions reopened explicitly; random tapes are not fitted to the real timestamps.

## Done criteria and stop conditions

Before a future implementation is called complete, require all applicable gates above, the three solved timelines, no overlap in active worker assignments, exact conservation of preparation work, one initial preparation start and delivery per order, a correct version-2 replay, and unchanged version-1 fixture bytes. Record the actual RED/GREEN chronology only for cycles observed by the executor. Update the status in `plans/README.md` only after main-agent review; preserve the original proposal as review history.

Stop affected implementation and report if approval is absent, source excerpts/fingerprints have drifted without review, an input requires a guessed interruption policy, active service must be inferred from elapsed field durations, two worker assignments appear necessary at the same instant, an out-of-scope module must change, a required runner is unusable, or a verification fails repeatedly. Do not weaken validation, remove tests, tune measured timestamps or change staffing to hide a failure.

Maintenance: new event types must be handled jointly by metrics, exporters, API schemas, event labels and replay. Any future automatic policy, confirmation-time resumption, multiple-worker support or interrupted initial-state snapshot needs its own reviewed semantics and examples. The observed comparison remains descriptive until representative calibration data and independent validation are available.
