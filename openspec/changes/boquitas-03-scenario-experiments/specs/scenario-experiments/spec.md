## ADDED Requirements

### Requirement: EXP-01 Explicit hypothetical scenario inputs
The experiment layer SHALL support constant, triangular and exponential time distributions, manually weighted positive group sizes, transfer probability, staffing, initial state, patience and finite opening hours. It SHALL load the shared demonstration defaults with visible synthetic provenance and SHALL NOT estimate parameters automatically from observation imports.

#### Scenario: Load demonstration
- **WHEN** the demonstration scenario is loaded
- **THEN** its root seed is 20261020, horizon is 23400 seconds, default staffing is Tuesday 1+4, interarrivals have mean 180 seconds, groups have weights 0.6/0.4 for sizes 1/2, payment and preparation use the baseline triangular parameters, transfer probability is 0.25, and abandonment is disabled.

### Requirement: EXP-02 Demand is reproducible and independent of resource dispatch
The layer SHALL generate complete order tapes before simulation using independent streams per replication and input category. Staff-only comparisons SHALL reuse identical identities, arrivals, group sizes, durations, transfers and patience within each replication.

#### Scenario: Staffing change preserves the demand tape
- **GIVEN** two scenarios differ only in staffing and share seed and replication index
- **WHEN** their tapes are generated
- **THEN** every generated order input is identical while their resulting waiting times can differ.

#### Scenario: Replication order does not change results
- **GIVEN** replication 5 is requested before replication 0
- **WHEN** the same replication 5 is requested again
- **THEN** its generated tape matches exactly without relying on prior calls or a global RNG.

### Requirement: EXP-03 Metrics distinguish people, orders and outcomes
The layer SHALL report order and person counts, their respective waiting/permanence summaries, withdrawals, initial versus newly admitted cohorts, and completion times. Unknown timestamps SHALL remain unavailable; completed-only statistics SHALL NOT silently include withdrawals as zero-duration services.

#### Scenario: Person weighting in shared orders
- **GIVEN** a one-person order waits 0 seconds and a two-person order waits 6 seconds
- **WHEN** waiting summaries are computed
- **THEN** mean order wait is 3 seconds and mean person wait is 4 seconds, with denominators 2 orders and 3 people.

### Requirement: EXP-04 Temporal queues exclude active work and pending transfers
The layer SHALL calculate temporal queue means as integrated waiting counts divided by the declared window length, separately for payment/preparation and persons/orders. Active service and external pending transactions SHALL be distinct states. Queue maxima SHALL use settled timestamp states without artificial zero-time queue spikes.

#### Scenario: Hand-calculated queue area
- **GIVEN** one order waits from time 1 to 5 during a 10-second window and nobody else waits
- **WHEN** mean order queue length is computed
- **THEN** it is 0.4 orders and the maximum settled queue is 1.

### Requirement: EXP-05 Active utilization differs from worker reservation
The layer SHALL compute active and reserved fractions from worker intervals clipped to `[0,H)`, divided by worker availability in that window. External confirmation in regular mode SHALL increase reservation without increasing active utilization; Tuesday pending confirmation SHALL occupy no cashier.

#### Scenario: Reserved inactive interval
- **GIVEN** a regular worker performs payment for 2 seconds, waits externally for 6, and prepares for 2 in a 10-second window
- **WHEN** utilization is calculated
- **THEN** active utilization is 0.4 and reservation is 1.0.

### Requirement: EXP-06 Closing-window and completed-cohort metrics are distinct
Window throughput, utilization and queue areas SHALL use `[0,H)`. Completion and permanence for admitted orders SHALL include drain beyond H. Initialized orders SHALL be a separate cohort; summaries SHALL expose which cohorts contribute.

#### Scenario: Completion after closing
- **GIVEN** an order arrives at 9 and completes at 14 for H=10
- **WHEN** results are summarized
- **THEN** its completed-cohort permanence is 5 seconds, window throughput excludes its delivery, and overtime is 4 seconds.

### Requirement: EXP-07 Replication-level confidence and paired comparisons
Experiments SHALL default to 30 independent replications and two-sided 95 percent Student-t intervals on replication summaries. Comparisons SHALL use within-replication paired differences, not differences between unrelated draws. Intervals SHALL disclose their valid replication count and describe simulation variability conditional on the chosen inputs.

#### Scenario: Known interval oracle
- **GIVEN** independent replication summaries 1, 2 and 3
- **WHEN** a 95 percent mean interval is computed
- **THEN** mean is 2 and endpoints are approximately -0.484138 and 4.484138, without clamping endpoints to the observed minimum/maximum.

#### Scenario: Missing or constant estimates
- **GIVEN** fewer than two valid replication summaries for a metric, or at least two identical summaries
- **WHEN** intervals are produced
- **THEN** the former has an unavailable interval with a reason and the latter has a zero-width interval explicitly indicating no observed replication variability.

### Requirement: EXP-08 Portable versioned exports preserve reproducibility
Scenario, run and experiment JSON SHALL include contract version, assumptions, input distributions, seed/replication identity and metric units/denominators. A saved replayable run SHALL retain its explicit tape and trace; CSV exports SHALL be rectangular tables with explicit people/order units and unavailable values.

#### Scenario: Reopen a saved run
- **GIVEN** a run is exported and read back
- **WHEN** its trace is replayed or its metrics inspected
- **THEN** events, identities, numeric values and assumptions match without random regeneration or source-file availability.

### Requirement: EXP-09 Invalid or unbounded generation fails explicitly
The layer SHALL reject invalid distribution parameters, probability weights, unavailable active pools and excessive bounded requests before accepting a result. A failed replication SHALL NOT silently disappear from an experiment presented as complete.

#### Scenario: Zero interarrival or incomplete experiment
- **GIVEN** constant zero interarrival or a replication that fails input validation
- **WHEN** execution is requested
- **THEN** the generation error or failed replication is identified and no complete-success experiment is returned.
