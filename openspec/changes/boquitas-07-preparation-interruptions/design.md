## Context

On 2026-10-24 the user approved [plan 001](../../../plans/001-scripted-preparation-interruptions.md) and requested its conversion into a new Spec without implementation. This document is the technical design for [preparation-interruptions](specs/preparation-interruptions/spec.md); every future implementation task remains pending.

The user subsequently approved implementation in reviewed Luna blocks on 2026-10-24. Runtime acceptance is tracked in tasks/evidence rather than inferred from the earlier planning-complete status. A necessary integration surface identified during recon is `web/src/replay/host.ts`: its closed state labels and in-shop membership must include paused preparation for truthful non-3D inspection. This is within INT-16's approved behavior, with no expansion of the operational policy.

Current version-1 contracts live in the implemented changes01–06 and the [shared roadmap](../../README.md). The engine has one centralized event coordinator, explicit stage deadlines and a single authoritative worker registry. Regular dispatch skips reserved workers; payment completion immediately starts preparation; preparation start schedules the full input workload. None of these current paths supports suspension. Metrics store one preparation start; JSON and replay consumers explicitly validate version 1.

The approved [comparison](../../../plans/comparacion-martes-vs-normal-2026-10.md) and [calculation evidence](../../../plans/evidence/comparison-calculations.json) retain the observations. For the normal visit only, the user confirmed eight linked orders, preparation-start semantics and the same worker's interruption. The cashier window is known; exact pause boundaries, active service segments and a general triggering policy are not known.

## Goals / Non-Goals

**Goals:** represent explicitly scheduled same-worker pause/cashier/resume operations; conserve work; retain deterministic event ordering; distinguish active/paused/elapsed metrics; support typed version-2 files/API/replay while preserving version 1; supply manually solved acceptance examples and a bounded implementation sequence.

**Non-Goals:** implementation during this planning request, automated inference or priority rules, calibration, multiple integrated workers with this option, nested interruptions, task migration, initially paused snapshots, generalized station joins, recipes, new services/dependencies, changes to Tuesday operation, or synchronization/archiving of main specifications.

## Decisions

### 1. Own one new capability and state its version boundary

This package adds `preparation-interruptions` with INT-01–INT-18. Existing version-1 requirements remain the compatibility baseline. The new version-2 capability explicitly defines its exceptions; it does not rewrite the historical change packages or claim existing main capability files. `openspec/specs/` is empty and remains untouched. A MODIFIED delta against missing main requirements would not be a valid basis for later synchronization, so this package uses ADDED requirements for its new capability.

| Baseline requirement | Version-2 integration boundary | Legacy promise |
| --- | --- | --- |
| ENG-01 validated deterministic boundary | Static script validation plus entry-specific dynamic applicability diagnostics; no accepted partial trace | Same interface, units and version-1 validation/results |
| ENG-04 integrated worker retained through delivery | A preparation can release its active assignment for one scripted payment while retaining a logical resume obligation | Uninterrupted version-1 reservation behavior unchanged |
| ENG-05 stable FIFO | Preserve unpaid FIFO; add paid regular preparation FIFO and in-progress resume precedence | Existing Tuesday/payment tie rules unchanged |
| ENG-06 active payment versus confirmation | Reserve inactive worker for the interrupting order until confirmation completes, then resume | No extra verification stage or Tuesday change |
| ENG-07/08 patience and closing | Scripted service can win an exact patience tie and continue admitted work after H | Admit only `[0,H)`; no post-payment abandonment |
| ENG-09 initial state | Legacy initial residual preparation can be interrupted; paid regular queue exists only as a runtime state | No new initial independent paid queue or paused snapshot |
| ENG-10 public trace | New explicit version-2 pause/resume events and related-order/assignment fields | Version-1 schema and scientific reference bytes preserved |
| ENG-11 excluded implicit operational effects | Explicit version-2 scripts authorize only this defined pause mechanism | No implicit pauses, travel or menu effects in version 1 |
| EXP-01/02/03/04/05/08/09 | Add explicit scripts, version-aware metrics/files and paid/paused states; scripts do not alter demand generation | Existing sampling, units, failures and version-1 outputs retained |
| WEB-01/03/04/05/06/07 | Typed payload unions, script editor, honest edit status, mixed-version selection and non-3D access | Existing workflows/defaults and immutable result semantics retained |
| VIS-02/04/05/06 | Project the new states and worker changes from public history | No synthetic movement delay or metric regeneration |
| REL-03/04/05/06 | Future actual acceptance evidence and guide updates for the new option | Earlier reports remain historical; no empirical-validation claim |

Any later synchronization/archiving requires separate authorization and a review of how predecessor capability baselines and this explicit version-2 extension are represented. Current planning does not create or synchronize that baseline. The CLI's artifact-complete state is not implementation consent.

### 2. Keep public workload inputs and add explicit configuration

Preserve the public `simulate(config, demand, initial_state)` boundary. Existing `OrderInput` workloads/person links and legacy-valid initial states keep their meaning. Define a distinct version-2 configuration with compatible shared fields and these new fields:

| Field | Meaning / constraints |
| --- | --- |
| `contract_version` | Literal 2 for the new configuration/trace path |
| `mode` | `regular` only |
| `integrated_workers` | Exactly 1; no active cashier/preparer pool |
| `preparation_interruption_policy` | Literal `scripted_cashier`; existing version-1 inputs are the default/off path |
| `cashier_interruptions` | Immutable ordered entries; empty means no requested interruption, not inferred behavior |
| Entry `at_s` | Finite nonnegative simulation seconds relative to opening; strictly increasing across entries |
| Entry `suspended_order_id` | Existing initialized/admitted order whose preparation must be active at that instant |
| Entry `cashier_order_id` | Distinct initialized/admitted FIFO-eligible waiting-payment order |

Validate exact identities against the explicit tape before scheduling. Arrival at H or beyond is not admitted and cannot be referenced. Reject booleans as numeric script times. At runtime reject entries whose expected states do not hold. Diagnostics identify `config.cashier_interruptions[index]`, a stable error code and the affected field/order without publishing an accepted partial result. For API input/run failures reuse the existing structured error transport; preserve replication-level failure diagnostics in experiments.

An absolute script time can exceed H because admitted work may drain. The script cannot create admissions or keep an otherwise completed run artificially successful: unconsumed entries fail visibly. Do not guess missing IDs, retime entries or ignore them to make a random tape fit.

**Alternative deferred:** immediate or probabilistic cashier priority. The confirmed case had 20 seconds of pre-payment waiting and does not establish a trigger, safe-point rule or interruption frequency.

### 3. Extend the coordinator and conserve one worker's work

Keep one authoritative event calendar and worker registry. Add internal remaining-preparation/last-active-start state to an order and one resume obligation to the integrated worker. The worker's active `assigned_order_id` changes from the suspended preparation to the cashier order; the resume obligation is not a second reservation or active assignment.

At a pause, subtract preparation progress since the latest start/resume, clear its old `stage_due_s`, preserve the positive remainder, and emit a pause event. At full cashier payment completion, put the newly paid order in an unassigned paid preparation queue and resume the suspended preparation using `now + remaining`. Emit a separate resume event; do not call the existing full-work preparation-start path unchanged. A later valid script can interrupt the resumed preparation again.

Resumption precedes any not-yet-started preparation. Once a preparing order delivers, select a paid queued order before a fresh unpaid order; paid FIFO is payment-completion time, event sequence and stable source order for final ties. Payment FIFO retains existing initial-queue rank/arrival/input ordering. There is one transaction per interruption and no nested suspended stack.

The existing regular confirmation rule is retained deliberately: after active cashier work the worker can remain reserved/inactive for external confirmation, with the original preparation still paused. Resumption during confirmation would be a different, unapproved model. Walking or task-switch overhead is not added automatically; the real 1–2 second differences between station marks do not establish a physical delay parameter.

**Alternative deferred:** replacing the coordinator with independent preemptive-resource processes. This would broaden the change and risk conflicting ownership; no new SimPy API or dependency is required by this design. If an executor later chooses a library interrupt API, first obtain current official documentation and re-review the architectural change.

### 4. Settle ties without altering the legacy path

For the version-2 path at time t:

1. Settle due payment/preparation/confirmation completions; register resulting paid orders and resume obligations. A completed preparation cannot be paused afterward.
2. Admit arrivals with arrival < H and close admissions when due.
3. Fulfill an existing mandatory resume obligation caused by full payment completion.
4. Consume the script entry at t, validating the active target, FIFO cashier eligibility and positive residual work. Strictly increasing script times mean at most one entry at this instant.
5. Run remaining eligible dispatch and zero-duration settling to stability, honoring any resulting resume obligation before ordinary paid FIFO work. Never consume the same script entry twice.
6. Expire patience only for orders still awaiting first payment. Service at its exact deadline wins.

The next-event calendar includes script times as well as arrivals, valid active-stage deadlines, confirmation deadlines, patience and closure. Paused preparations have no due completion. Preserve legitimate positive durations such as `5e-10`; an epsilon must not erase residual work. Reject stale/completed-target scripts rather than emitting a zero-work pause. Keep the version-1 ordering and outputs intact.

### 5. Make every state reconstructible from a versioned public trace

Version-2 traces retain stable `seq`, `time_s`, order/person IDs and worker identity. Add `preparation_paused` and `preparation_resumed` types with remaining preparation seconds, related cashier order ID and the resulting assigned-order/reserved/active state. Emit a single initial `preparation_started`, with pause/resume pairs representing later segments. At the pause the worker can be unassigned/inactive in that intermediate sequence position before `payment_started`; after the timestamp settles, the active payment assignment must be coherent.

The paused order retains a same-worker resume relationship while its active worker occupancy is released. Newly paid waiting orders own no worker. Shared person projections follow their order without multiplying workload or utilization. Existing `order_delivered`, payment and terminal events remain authoritative. An initial preparation with unknown historical start exposes only known residual segments/pauses and does not fabricate its earlier start or full duration.

### 6. Propagate version 2 through metrics, artifacts and consumers

| Contract / behavior | Version handling |
| --- | --- |
| Existing config/scenario/run/trace/metrics/experiment | Keep version 1 and exact supported semantics/reference bytes |
| Interruption config/scenario/run/trace/metrics | Explicit version 2 with typed discriminated handling; preserve all input assumptions and script entries |
| Mixed legacy/scripted experiment | Version-2 envelope; each scenario/metric/selected run keeps its actual member version; legacy selected runs remain version 1 |
| Observation reports and unrelated contracts | Keep current versions and correction profiles |
| API routes | Reuse existing operations; an `/api/v1/` route name is not a reason to mislabel payload contracts or introduce new endpoint paths |
| Unsupported/inconsistent payload | Actionable format error; retain last valid UI result |

Use typed version-aware loaders/unions instead of silently migrating files or casting unknown events into version-1 models. Regenerate the API schema/TypeScript through existing tools; add new version-2 fixtures without overwriting the old scientific reference.

For each fully observed completed preparation, provide `preparation_active_s`, `preparation_paused_s`, `preparation_pause_count` and existing elapsed preparation meaning. `elapsed = active + paused`; the first preparation timestamp is never overwritten by resume. Expose first-preparation paid queue wait separately from post-start pause. In version 1 the existing regular preparation-queue unavailability remains unchanged; version 2 can report this new applicable paid-queue measure.

Integrate window queues/utilization only over `[0,H)`. A paused order is not a newly paid waiting order; inactive confirmation is not active service. Worker occupancy is counted once even though two orders have pending logical work. Full unknown historical metrics remain null with a reason, while clearly labeled known residual segment measures may be reported.

Changing only a policy/script is a scheduling assumption and must not perturb random demand streams/tapes or pairing labels. Validate each script against each generated tape. If one replication fails, retain its index/diagnostic and existing incomplete-experiment semantics. Version-2 mixed experiments allow a legacy-versus-scripted comparison on a common workload without pretending scripts were fitted or business effects were validated.

### 7. Preserve explicit assumptions in editing and replay

Use Spanish policy/schedule controls and labels such as `Pausas programadas para cobrar`, `Preparación pausada`, `Trabajo activo`, `Tiempo en pausa` and `Reanudar preparación`. Show that the user supplies the times and that exactly one integrated worker is supported. Retain script entries across load/edit/save and incompatible draft changes; require an explicit user resolution rather than silently clearing the script on a mode/capacity switch. Keep current demos/defaults on version 1 with interruption off. Editing does not alter an existing result; a new run is required.

Project saved pause/resume events in both the non-3D inspector and 3D view. During the core pause, show A paused and the same worker charging B; after resumption, A prepares and B is paid waiting. Seeking and speeds use only trace history. No scene-generated work, moving-time adjustment or regenerated metrics are introduced. Exports and non-3D state remain available if graphics fail.

### 8. Use solved synthetic examples as future acceptance oracles

These timelines are designed examples, not executed feature tests or estimates of the shop. Every order has explicit synthetic identities; no real person count is inferred.

| Example | Inputs and script | Expected result |
| --- | --- | --- |
| Legacy comparison | One worker; A arrival 0, payment 2/preparation 10; B arrival 5, payment 2/preparation 3; no confirmations; version 1 | A delivers 12, B pays 12–14 and delivers 17 |
| Core | Same workload, H=20, version 2; pause A for B at 5 | A prepares 2–5 and 7–14; B pays 5–7 and prepares 14–17; A active 10/paused 2/elapsed 12; B paid wait 7; worker active 17 s, utilization 0.85; paid queue area 7, mean 0.35 |
| Confirmation | Core with B confirmation wait 3 | B active 5–7, reserved inactive 7–10; A resumes 10–17; B prepares 17–20; A active 10/paused 5/elapsed 15 |
| Repeated pause | Core plus C arrival 8, payment 1/preparation 1; pause A for C at 9 | A active at 2–5, 7–9, 10–15; A/B/C deliver 15/18/19; A has 3 paused seconds; paid B precedes C |
| Residual initial work | A initially preparing, residual 10, historical start unknown; B arrival 2, payment 1/preparation 1; pause A for B at 2 | A residual work at 0–2 and 3–11; B prepares 11–12; no full historical preparation duration is invented |
| Drain | Core with B arrival 3 and H=4, script still at 5 | Already admitted A/B complete at 14/17; statistical window stays 4; no admission at or after H |

The core has the same final drain time as its legacy counterpart but postpones A's delivery and changes B's waiting stage. Do not label interruption intrinsically faster or an operational improvement.

## Risks / Trade-offs

- Duplicate active assignments or stale deadlines → maintain one worker registry, remove paused deadlines and verify public trace/resource invariants.
- Restarted work or overwritten preparation starts → separate start/resume transitions and test exact active/pause conservation including tiny residuals.
- A fixed script becomes infeasible on a generated tape → explicit indexed failure; no automatic retiming or failed-replication deletion.
- New event/version rejected or misread downstream → typed version-2 propagation, old-fixture preservation and real reopen/replay workflows.
- A scheduled operation is mistaken for a learned automatic rule → explicit scenario assumptions and Spanish explanations; auto priority remains excluded.
- Elapsed field durations used as active inputs and pauses added again → keep observations descriptive, preserve unknown boundaries and require separately supported active measurements before calibration.
- Empty main specs and historical broad wording confuse future sync → keep new capability explicitly version scoped, retain the integration table and require separate sync/archive authorization and baseline review.

## Migration Plan

Planning only: this request creates the new change artifacts and updates their shared index/context and approved-plan status. It does not change application models, generated contracts, tests, fixtures, launchers or raw data.

If implementation is later authorized, first recheck the actual working-tree baseline, then implement typed contracts and critical engine/metric cases test-first, propagate files/API, add consumers, and execute the full relevant acceptance gates. Preserve the baseline 37 tests and all subsequent existing coverage. Require main-agent review of diff and actual results. No rollback is currently needed because runtime is unchanged; the future compatibility fallback is the retained version-1 option, not an authorized deletion/revert of user work. No remote operation is included.

Before claiming future engineering completion, run the project commands recorded in [tasks.md](tasks.md), verify old reference bytes, and perform actual pause/cashier/resume visual inspection including reopened files and the non-3D fallback. Structural OpenSpec validation alone does not meet these gates.

## Open Questions

No unresolved decision blocks preparing this approved scripted-policy Spec. The observations still do not establish a general trigger, safe-point delay, exact pause boundaries, payment medium, active preparation parameters, interruption frequency, observation coverage or independent validation data. Those remain research/possible future-policy questions; do not invent values or expand this change to answer them.
