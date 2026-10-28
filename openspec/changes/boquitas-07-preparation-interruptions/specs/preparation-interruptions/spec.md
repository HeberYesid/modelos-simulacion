## ADDED Requirements

### Requirement: INT-01 Explicit opt-in scope preserves legacy operation
The system SHALL enable scripted preparation interruption only through a version-2 configuration in regular mode with exactly one integrated worker. Version-1 inputs, defaults, Tuesday rules and saved scientific artifacts SHALL retain their existing behavior; loading observations or selecting a day label SHALL NOT enable interruption.

#### Scenario: Legacy mode remains unchanged
- **GIVEN** A arrives at 0 with active payment 2 and preparation 10, B arrives at 5 with active payment 2 and preparation 3, both have zero confirmation wait, and one regular worker uses version 1
- **WHEN** the workload runs
- **THEN** A delivers at 12, B starts payment at 12 and delivers at 17, and no pause/resume event is emitted.

#### Scenario: Unsupported mode or capacity
- **GIVEN** interruption is requested in Tuesday mode or with two integrated workers
- **WHEN** configuration is validated
- **THEN** a field-level incompatibility diagnostic prevents execution without silently disabling the policy or changing staffing.

### Requirement: INT-02 Scripts contain validated explicit scheduling assumptions
The version-2 configuration SHALL identify `scripted_cashier` policy and an immutable list of entries containing finite nonnegative `at_s`, `suspended_order_id` and `cashier_order_id`. Script times SHALL be strictly increasing, IDs SHALL differ within an entry, and each ID SHALL reference initialized or admitted demand. Invalid times, duplicate entries, unknown IDs and references to excluded-at-H arrivals SHALL be rejected with the entry/field identified. An empty script SHALL introduce no interruption or inferred schedule.

#### Scenario: Invalid script entry
- **GIVEN** an entry references an unknown order, repeats a script time or has a negative/nonfinite time
- **WHEN** explicit inputs are validated
- **THEN** the result identifies `cashier_interruptions[index]` and the invalid field, and no successful run or partial trace is returned.

#### Scenario: Valid schedule contains no inferred trigger
- **GIVEN** B arrives at 5, a valid script schedules its cashier service by pausing A at 8, and no other rule makes B eligible earlier
- **WHEN** the run advances from 5 to 8 while A is preparing
- **THEN** arrival at 5 does not itself interrupt A and the scheduled operation is attempted at 8.

### Requirement: INT-03 Dynamic applicability is checked without silent script loss
At each script instant, the target preparation SHALL be active on the integrated worker with positive remaining work, and the cashier order SHALL be the FIFO-eligible waiting-payment order. A completed, abandoned, already-paid or ineligible order, a worker in payment/confirmation, or a nested pause attempt SHALL make the run fail with a structured entry-specific diagnostic. A script left unconsumed when all orders are terminal SHALL also fail. No successful run or completed-success experiment SHALL hide an infeasible script.

#### Scenario: FIFO violation
- **GIVEN** C is ahead of B in the unpaid FIFO queue and a script requests charging B while A prepares
- **WHEN** that script entry is reached
- **THEN** execution identifies B's ineligibility rather than skipping C, skipping the entry or returning a successful partial result.

#### Scenario: Dangling future entry
- **GIVEN** all orders are terminal but a scheduled interruption remains
- **WHEN** the run would otherwise finish
- **THEN** it reports the unconsumed entry and does not publish a successful trace.

### Requirement: INT-04 Preparation work is conserved through pause and resume
Pausing SHALL preserve the work already performed and the positive remaining preparation duration, remove the old completion deadline and put the order in `preparation_paused`. Resuming SHALL schedule only the remaining work on the same worker. There SHALL be exactly one initial preparation start, one payment and one final delivery per order; group members SHALL NOT duplicate work. Finite positive subnanosecond residual work SHALL NOT be rounded away by an epsilon.

#### Scenario: Core independently solved pause sequence
- **GIVEN** H=20, A arrives at 0 with payment 2/preparation 10, B arrives at 5 with payment 2/preparation 3, both confirmation waits are zero, one worker is configured, and the script pauses A for B at 5
- **WHEN** the version-2 workload runs
- **THEN** A prepares at 2–5, retains 7 seconds, B pays at 5–7, A resumes at 7–14 and delivers at 14, and B prepares at 14–17 and delivers at 17.

#### Scenario: Old deadline cannot deliver a paused order
- **GIVEN** A originally would deliver at 12 but a valid interruption extends its delivery to 14
- **WHEN** time crosses 12
- **THEN** A is not delivered by a stale deadline, and its only final delivery is at 14.

#### Scenario: Positive tiny remainder
- **GIVEN** a valid interruption leaves `5e-10` preparation seconds
- **WHEN** preparation resumes
- **THEN** the completion is scheduled that positive duration after resumption and the work is not collapsed to zero.

### Requirement: INT-05 One cashier transaction is followed by resumption and paid FIFO work
Each interruption SHALL serve exactly one cashier order, then resume the suspended preparation before starting the newly paid order's preparation. A newly paid order SHALL wait without owning a worker. After completing in-progress preparation, the free worker SHALL take paid waiting preparations by payment-completion time/event sequence before fresh unpaid orders. Subsequent valid scripted pauses after resumption SHALL be supported; automatic or nested interruptions SHALL NOT be introduced.

#### Scenario: Paid order waits for resumed work
- **GIVEN** the core sequence of INT-04
- **WHEN** B's payment completes at 7
- **THEN** B waits for first preparation during 7–14, A resumes immediately on the same worker, and no second worker assignment is created.

#### Scenario: Repeated interruption preserves work and paid FIFO
- **GIVEN** the core sequence, C arrives at 8 with payment 1/preparation 1, and a second script pauses A at 9 to charge C
- **WHEN** execution completes
- **THEN** A's active preparation segments are 2–5, 7–9 and 10–15, A delivers at 15, B at 18 and C at 19, with B ahead of C in the paid queue.

### Requirement: INT-06 Confirmation retains existing regular reservation semantics
Payment active work and external confirmation SHALL remain distinct. During a scripted cashier transaction, configured external confirmation SHALL reserve the integrated worker for the cashier order while inactive, leave the original preparation paused, and complete automatically without a second active verification stage. Preparation SHALL resume only after full payment completion.

#### Scenario: Scripted payment has external confirmation
- **GIVEN** the core sequence with B's confirmation wait changed to 3 seconds
- **WHEN** B completes active payment at 7
- **THEN** the worker is reserved/inactive at 7–10, A resumes at 10 and delivers at 17, B prepares at 17–20, and A's preparation has 10 active, 5 paused and 15 elapsed seconds.

### Requirement: INT-07 Timestamp ordering is deterministic at boundary cases
The version-2 coordinator SHALL settle stage completions, admit eligible arrivals/close admissions and fulfill existing resume obligations before applying the script for that timestamp, then perform remaining eligible dispatch/zero-time settling before patience expiry. Preparation completion at the exact script time SHALL win and invalidate an inapplicable pause. Same-time effects SHALL have stable sequence numbers and zero-duration operations SHALL settle once without loops or duplicate transitions. Version-1 ordering SHALL remain unchanged.

#### Scenario: Preparation completes at the requested pause time
- **GIVEN** A completes preparation exactly at the time a script asks to pause A
- **WHEN** the timestamp settles
- **THEN** A's completion is processed first and the inapplicable script is diagnosed without a zero-work pause or duplicate delivery.

#### Scenario: Zero-duration cashier service
- **GIVEN** a valid interruption whose cashier active and confirmation durations are both zero
- **WHEN** it executes
- **THEN** payment starts/completes and preparation pauses/resumes once in deterministic sequence, elapsed time does not advance, and no duplicate work or infinite dispatch loop occurs.

### Requirement: INT-08 Patience and closing retain their admission meanings
Patience SHALL apply only before first payment starts; exact-deadline service SHALL win. New arrivals SHALL be admitted only in `[0,H)`. Valid scripted work on already admitted/initialized orders SHALL be allowed after H, while all paid or paused work SHALL drain to a single final outcome. Window statistics SHALL still use `[0,H)`.

#### Scenario: Patience expires before a script
- **GIVEN** B's patience expires before its scheduled cashier operation
- **WHEN** the script references B later
- **THEN** the run reports B's inapplicability and B is not charged or prepared after abandonment.

#### Scenario: Payment starts at the patience deadline
- **GIVEN** B's patience deadline is exactly a valid scripted payment start
- **WHEN** the timestamp settles
- **THEN** B starts payment once and does not abandon.

#### Scenario: An admitted order is charged after closing
- **GIVEN** the core sequence has H=4, B instead arrives at 3, and A is paused at 5 to charge B
- **WHEN** the run closes admissions at 4 and later drains
- **THEN** the scheduled operation at 5 remains valid, A delivers at 14 and B at 17, no arrival at or after 4 is admitted, and the statistical window remains 4 seconds.

### Requirement: INT-09 Initial residual work does not create historical observations
Legacy-valid initial states SHALL remain supported by the extension, including one initially preparing order with known residual work and an unknown historical arrival/start. Residual progress SHALL be preserved through interruption. Full historical metrics SHALL remain unavailable when their necessary timestamps are unknown. An initially paused snapshot or independent initial regular paid-preparation queue SHALL NOT be added by this version.

#### Scenario: Initialized preparation has unknown prior start
- **GIVEN** initial A is preparing with residual work 10 and no known historical preparation start, B arrives at 2 with payment 1/preparation 1, and A is paused for B at 2
- **WHEN** execution completes
- **THEN** A performs residual preparation at 0–2 and 3–11, B prepares at 11–12, and A's full historical preparation duration remains unavailable despite known residual work and the observed pause.

### Requirement: INT-10 Versioned events expose every interruption without double assignment
Version-2 traces SHALL emit `preparation_paused` and `preparation_resumed` events carrying the suspended order, related cashier order, worker, remaining preparation seconds and resulting worker assignment/reservation/activity. A worker SHALL have at most one active assignment/reservation at any instant; a suspended order's resume obligation SHALL NOT count as a second worker reservation. Metrics/replay SHALL reconstruct state from ordered public events without engine internals. New events SHALL NOT appear in a version-1 trace.

#### Scenario: One worker switches tasks in a saved trace
- **GIVEN** the core sequence
- **WHEN** events at 5 and 7 are inspected in sequence order
- **THEN** the trace identifies A as paused while the sole worker charges B, then A as resumed while B waits, with 7 seconds remaining for A at resumption and one authoritative worker assignment throughout.

#### Scenario: A shared order is paused
- **GIVEN** A has two explicit synthetic person IDs and one shared preparation workload
- **WHEN** A is paused and resumed once
- **THEN** both person projections follow A and there is one workload/pause episode rather than one per person.

### Requirement: INT-11 Active paused and elapsed preparation metrics are distinct
The metrics layer SHALL expose preparation active seconds, cumulative paused seconds, pause count and elapsed time from first preparation start to delivery, with units, cohort and availability. For a complete fully observed simulated preparation, elapsed SHALL equal active plus paused. Unknown initial history SHALL NOT be replaced with zero or with residual duration presented as full duration.

#### Scenario: Core preparation accounting
- **GIVEN** the core sequence of INT-04
- **WHEN** A's metrics are summarized
- **THEN** active preparation is 10 seconds, paused time is 2, pause count is 1 and elapsed preparation is 12, with the original preparation start still at 2.

### Requirement: INT-12 Queue and utilization measures count actual states once
Waiting after a cashier operation but before first preparation SHALL be represented as a paid regular preparation queue, separately from post-start paused preparation. Temporal queue measures SHALL integrate only eligible waiting states over `[0,H)` with no zero-time spikes. Resource activity SHALL integrate actual payment/preparation segments once; confirmation SHALL add reservation but no active work and paused preparation SHALL add no worker activity.

#### Scenario: Core resource and paid-queue integration
- **GIVEN** the core sequence with H=20
- **WHEN** window metrics are computed
- **THEN** the sole worker has 17 active seconds and active utilization 0.85, B's paid queue interval is 7–14 with mean order queue 0.35, and paused A is not also counted in that paid-first-preparation queue.

### Requirement: INT-13 Typed files and APIs preserve version and scientific history
The API, JSON loaders/exporters, CSV and generated contracts SHALL support explicit version-2 configurations, traces, metrics and containing scenario/run/experiment payloads without silently migrating version-1 files. Old models, demo/reference fixture bytes and default results SHALL remain compatible. Saved version-2 runs SHALL retain scripts, explicit demand, events and metrics so reopening requires no rerun or source file. Unsupported/inconsistent versions SHALL receive actionable errors while the last valid UI result remains available.

#### Scenario: Reopen an interruption-enabled saved run
- **GIVEN** the core run is saved under version 2
- **WHEN** it is reopened without its original observation sources
- **THEN** the script, demand, A's pause/resume events and A/B metrics match exactly without random regeneration or execution.

#### Scenario: Old fixtures and invalid mixed versions
- **GIVEN** an existing version-1 run or a purported version-1 trace containing a pause event
- **WHEN** loaders validate the file
- **THEN** the old valid run still opens unchanged and the mislabeled new trace is rejected rather than silently accepted as version 1.

### Requirement: INT-14 Experiments separate scheduling from generated demand and failures
Scripts SHALL be explicit scenario assumptions validated against every generated tape. A change only to interruption policy/script SHALL NOT change generated order identities, arrivals, workloads, groups, transfers or patience under a shared seed/index. Version-2 experiment envelopes SHALL support comparison with a version-1 reference scenario while preserving each member's actual version. Infeasible replications SHALL remain failed and visible, with existing count/denominator semantics, instead of being dropped from a success result.

#### Scenario: Compare legacy and scripted policy on the same tape
- **GIVEN** a version-1 reference and version-2 scripted candidate differ only in scheduling assumptions and share seed/index
- **WHEN** their generated inputs are compared and the experiment is saved
- **THEN** demand tapes match, the experiment envelope is version 2, each selected run retains its corresponding version, and differences describe conditional simulated outcomes rather than an observed business effect.

#### Scenario: A random tape makes the script infeasible
- **GIVEN** one requested replication has no eligible cashier order at a scripted time
- **WHEN** the batch is evaluated
- **THEN** that replication's indexed diagnostic is retained and no complete-success experiment hides the failure.

### Requirement: INT-15 Scenario editing preserves explicit scripts and honest status
The Spanish UI SHALL expose interruption policy and schedule editing, explain that times are user-supplied assumptions, retain schedules through valid load/edit/save round trips, and disclose unsupported mode/capacity instead of silently discarding entries. The option SHALL be off for the current demo/defaults. Scenario edits SHALL require a new run; they SHALL NOT alter a saved/completed trace or treat imported observations as a fitted script.

#### Scenario: Edit an existing scheduled scenario
- **GIVEN** a version-2 scenario contains a valid schedule
- **WHEN** the user edits a duration and saves the scenario
- **THEN** the schedule remains present, the result displayed from a previous run keeps its original inputs, and the UI states that the changes have not been executed.

#### Scenario: Change to an unsupported capacity with a saved script
- **GIVEN** a draft contains an interruption schedule
- **WHEN** the user selects two integrated workers or Tuesday mode
- **THEN** a Spanish diagnostic identifies the incompatibility, prevents submitting an invalid scenario and preserves the draft script until the user explicitly resolves the conflict.

### Requirement: INT-16 Replay displays pause charge and resume from authoritative history
Replay SHALL validate both supported versions and project `preparation_paused`, cashier activity, confirmation, paid waiting and resumption solely from the saved trace in `(time_s, seq)` order. The same worker SHALL be shown changing assignment, not duplicated. Seeking, playback speed, reduced motion and graphical fallback SHALL NOT alter metrics or history. Non-3D tables/state inspection SHALL retain the new information when WebGL is unavailable.

#### Scenario: Seek through the core interruption
- **GIVEN** the saved core trace
- **WHEN** the user seeks to 6, then 8, back to 6 and again to 8
- **THEN** at 6 A is paused and the sole worker charges B, at 8 A is preparing and B waits paid, repeated seeks reproduce those states, and the run's metrics remain unchanged.

#### Scenario: Graphics unavailable
- **GIVEN** a version-2 saved run and no usable WebGL
- **WHEN** the result is opened
- **THEN** pause events, worker assignments, active/paused/elapsed metrics and exports remain available in the non-3D interface.

### Requirement: INT-17 Observation provenance and uncertainty remain explicit
The implementation SHALL preserve raw observations, existing import/correction semantics and the limited scope of confirmed joins. It SHALL NOT infer person/group counts, exact pause boundaries, active field preparation, interruption probability or automatic priority from the 2026-10-23 records. Calibration and empirical validation SHALL remain pending until separately supported; the version-2 demonstration and supplied scripts SHALL be labeled hypothetical when they are assumptions.

#### Scenario: Interpret the confirmed regular-day overlap
- **GIVEN** order 6's preparation spans 18:13:13–18:16:16, order 7's cashier window is 18:14:19–18:14:29, and the user confirmed same-worker pause/resume and matching station IDs only for this visit
- **WHEN** the evidence or scenario assumptions are described
- **THEN** the 183 seconds remain preparation elapsed time, 173 seconds is not presented as measured active preparation, Tuesday IDs are not joined automatically, and exact pause boundaries/frequency remain unknown.

### Requirement: INT-18 Engineering acceptance uses independently observed evidence
After implementation is separately authorized, acceptance SHALL require public-boundary tests for critical rules, independent manually solved timelines, relevant Python/contract/frontend/browser checks, actual visual pause/resume inspection and final diff review. Existing tests and version-1 reference bytes SHALL be preserved. Unexecuted or unavailable runtime/visual checks SHALL remain pending; planning validation SHALL NOT be reported as feature execution, calibration or empirical validation.

#### Scenario: Planning artifacts are complete before implementation approval
- **GIVEN** proposal, requirements, design and unchecked tasks validate successfully
- **WHEN** planning status is reported
- **THEN** the Spec is identified as prepared, implementation count remains zero, and no implemented interruption, passing feature test or visual acceptance is claimed.
