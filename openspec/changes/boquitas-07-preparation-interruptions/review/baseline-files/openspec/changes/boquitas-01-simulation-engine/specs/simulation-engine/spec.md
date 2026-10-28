## ADDED Requirements

### Requirement: ENG-01 Deterministic validated public boundary
The engine SHALL accept validated explicit order timings, configuration and initial state through `simulate`, SHALL operate in simulation seconds without UI or random sampling, and SHALL reject invalid inputs before emitting a partial trace.

#### Scenario: Repeating explicit inputs
- **GIVEN** identical valid configuration, demand and initial state
- **WHEN** `simulate` is called twice
- **THEN** both calls return identical ordered domain events and final entity states without wall-clock waits.

#### Scenario: Invalid resource or duration
- **GIVEN** a negative duration, duplicate person identity, nonfinite time or zero capacity in an active worker pool
- **WHEN** simulation is requested
- **THEN** validation identifies the field and no partial run is returned.

### Requirement: ENG-02 Shared orders retain people without duplicate work
The engine SHALL retain each person linked to exactly one order and SHALL execute payment and preparation once per order. Group members SHALL arrive, complete or abandon together in v1.

#### Scenario: Two-person shared order
- **GIVEN** one order for people P1 and P2 with payment duration 2 and preparation duration 3, arriving at 0 with no transfer wait
- **WHEN** an idle worker serves it
- **THEN** there is one payment start, one preparation start, one delivery at 5 and two completed people linked to that delivery.

### Requirement: ENG-03 Tuesday resource separation and capacity
Tuesday mode SHALL use separate cashier and preparer pools, defaulting to one and four, and SHALL assign one complete order to each preparer until delivery. A worker SHALL NOT prepare two simultaneous orders.

#### Scenario: Independently solved Tuesday sequence
- **GIVEN** orders A and B arrive at 0 and 1, each with payment 2, preparation 3, no transfer wait and one person, with one cashier and four preparers
- **WHEN** the engine runs
- **THEN** A pays from 0 to 2 and prepares from 2 to 5, while B pays from 2 to 4 and prepares from 4 to 7.

#### Scenario: Four preparers already occupied
- **GIVEN** four orders are preparing and a fifth completes payment
- **WHEN** the fifth becomes eligible for preparation
- **THEN** it waits until a preparer is released and no fifth preparation overlaps the four occupied preparers.

### Requirement: ENG-04 Regular mode retains one integrated worker per order
Regular mode SHALL reserve an integrated worker from payment start through final delivery before that worker takes another order, defaulting to one worker. External confirmation SHALL count as reserved but inactive time.

#### Scenario: Independently solved regular sequence
- **GIVEN** the same A and B inputs as ENG-03 and one integrated worker
- **WHEN** regular mode runs
- **THEN** A finishes at 5, B begins payment at 5 and finishes at 10.

### Requirement: ENG-05 Queue disciplines are stable
Initial payment service SHALL start FIFO by order arrival and input sequence for ties. Tuesday preparation SHALL start FIFO by payment completion, then payment event sequence for ties. Simultaneously free workers SHALL be assigned by stable worker ID.

#### Scenario: Later arrival completes payment first
- **GIVEN** A begins payment at 0, finishes active payment at 1 and waits externally until 11, while B arrives at 1 and completes payment at 2
- **WHEN** preparers are available
- **THEN** B starts preparation before A without changing FIFO initial payment service.

### Requirement: ENG-06 External transfer confirmation is distinct from active work
Payment SHALL consist of active work followed by configured external waiting. Tuesday SHALL release the cashier after active work and enqueue preparation only after full confirmation; regular mode SHALL retain its worker. Confirmation SHALL be automatic with no second active verification stage.

#### Scenario: Transfer overlaps another transaction
- **GIVEN** A has active payment from 0 to 2 and external wait 10, and B arrives at 1 with active payment 2 and external wait 0 in Tuesday mode
- **WHEN** the engine runs
- **THEN** B begins active payment at 2 and completes payment at 4, A completes payment at 12, and A's external wait adds no cashier active interval.

### Requirement: ENG-07 Optional group patience before payment
The engine SHALL support optional patience while waiting for first payment service, withdraw the whole order/group on expiry, cancel its pending service eligibility and never prepare an abandoned order. Once payment starts, patience SHALL no longer apply. Service at the exact deadline SHALL win over abandonment.

#### Scenario: Group leaves a busy regular queue
- **GIVEN** a regular worker is occupied until 5 and a two-person order arrives at 1 with patience 2
- **WHEN** time reaches 3
- **THEN** both people abandon once and the order never starts payment or preparation.

#### Scenario: Release exactly at patience deadline
- **GIVEN** the same order has patience 4 and the worker becomes free at 5
- **WHEN** release and expiry occur at 5
- **THEN** the order starts payment at 5 and does not abandon.

### Requirement: ENG-08 Admission closes and admitted work drains
The engine SHALL admit new orders only in `[0,H)`, stop new admissions at H, and complete all admitted or initialized orders, including confirmation waits after H. The statistical window SHALL remain `[0,H)` even when final completion is later.

#### Scenario: Last accepted and excluded arrivals
- **GIVEN** H is 10, an order arrives at 9 with total required work 5, and another arrives exactly at 10
- **WHEN** the run ends
- **THEN** the first order completes at 14, the second is not admitted, and the trace distinguishes window end 10 from drain end 14.

### Requirement: ENG-09 Explicit initial state without fabricated history
The engine SHALL support initialized orders waiting for payment, waiting for confirmation, waiting for preparation or already preparing, with compatible worker assignments and remaining times for work in progress. Unknown historical timestamps SHALL remain unknown. Initialized people SHALL be distinguished from new admissions.

#### Scenario: Initial preparation occupies a worker
- **GIVEN** a Tuesday preparer is initially preparing A with remaining duration 3 and another paid order waits, with all other preparers occupied
- **WHEN** time reaches 3
- **THEN** A completes and that worker becomes eligible for the waiting order, without replaying A's earlier payment or full preparation duration.

#### Scenario: Impossible initial occupancy
- **GIVEN** two initial orders name the same preparing worker, or regular mode has an order waiting independently for preparation
- **WHEN** input validation runs
- **THEN** the initial state is rejected with an explicit incompatible-assignment error.

### Requirement: ENG-10 Versioned public trace drives downstream behavior
The engine SHALL emit ordered, immutable domain events with contract version 1, stable sequence, simulation time, order/person links and worker identity when applicable. The trace SHALL expose active versus reserved resource changes and enough information to reconstruct queue and entity states without private SimPy access.

#### Scenario: Simultaneous transitions
- **GIVEN** a zero-duration active stage or several transitions share one timestamp
- **WHEN** the trace is consumed in `(time_s, seq)` order
- **THEN** each transition is applied once and final queues, active work and worker assignments remain coherent.

### Requirement: ENG-11 No unobserved operational effects
The engine SHALL use an unbounded logical queue and the provided per-order durations. Day labels SHALL NOT change demand, products or durations automatically, and v1 SHALL NOT add partial deliveries, walking delays, pauses, inventory shortages or pre-queue rejection.

#### Scenario: Same demand under different staffing modes
- **GIVEN** the same explicit orders and durations are used in Tuesday and regular mode
- **WHEN** both are run
- **THEN** their workloads and person/order identities match and differences come from their configured resource rules.
