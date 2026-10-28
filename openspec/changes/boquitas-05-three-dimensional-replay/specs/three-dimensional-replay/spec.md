## ADDED Requirements

### Requirement: VIS-01 Shop and entities are identifiable
The view SHALL show a stylized ice cream shop with entrance, cashier area, paid waiting area, preparation counter and workers. Each person SHALL have a stable visual identity linked to an order, and shared orders SHALL NOT create duplicate worker tasks.

#### Scenario: Shared order at a preparer
- **GIVEN** a two-person order is preparing
- **WHEN** its trace is displayed
- **THEN** both people can be identified, one preparer is linked to the order and there is one preparation action for that order.

### Requirement: VIS-02 Projection is a deterministic function of the trace
Replay state SHALL be derived only from the validated upstream trace and selected simulation time. It SHALL NOT generate arrivals, durations, staffing changes or metric values. At time t it SHALL apply all events with time <= t in sequence order.

#### Scenario: Repeated seek
- **GIVEN** a valid run
- **WHEN** the user seeks to 100, back to 20 and again to 100
- **THEN** entity states, queues and worker assignments at 100 match exactly and the run's metrics remain unchanged.

### Requirement: VIS-03 Playback controls do not change history
The view SHALL support play/pause, restart, fixed playback speeds and seeking through the entire drain period, with simulation-clock labels and an admission-closed marker. Reloading a result SHALL reset playback without modifying that result.

#### Scenario: Accelerated playback
- **GIVEN** the same trace is played at 1x and 60x
- **WHEN** both reach the same selected simulation time
- **THEN** their logical states match, including deliveries after closing.

### Requirement: VIS-04 Worker status separates activity and reservation
The view SHALL distinguish idle workers, active payment, preparation and a regular worker reserved during external confirmation. Tuesday external confirmation SHALL NOT visually occupy the released cashier, and paid waiting orders SHALL be separate from preparing orders.

#### Scenario: Transfer pending in both modes
- **GIVEN** equivalent pending-transfer stages in Tuesday and regular traces
- **WHEN** the stages are inspected
- **THEN** the Tuesday cashier is available for another order while the regular worker is shown reserved/inactive for its current order.

### Requirement: VIS-05 Movement is illustrative and synchronized
Walking and preparation gestures SHALL illustrate existing events without adding service or travel delays. Persons SHALL NOT appear completed before the authoritative delivery event, and illustrative transitions SHALL finish or snap before the next authoritative state requires it.

#### Scenario: Short consecutive stages
- **GIVEN** payment and preparation complete with little or zero time between them
- **WHEN** replay crosses those events
- **THEN** logical states remain correct without waiting for a cosmetic walking animation to finish.

### Requirement: VIS-06 Camera and inspection explain the model
The view SHALL offer orbit, zoom and reset camera controls, entity selection, order/person links and available timestamps. Unknown historical values SHALL remain unknown; the scene SHALL NOT imply a measured shop layout or physical queue-capacity estimate.

#### Scenario: Select initialized person
- **GIVEN** an initial order has no known arrival time
- **WHEN** one of its people is inspected
- **THEN** the inspector shows that arrival as unavailable rather than inventing an elapsed full-system time.

### Requirement: VIS-07 Local resources and graceful graphics handling
The view SHALL use local/procedural assets, support reduced motion, release GPU/event resources when replaced, and preserve non-3D result access when WebGL is unavailable or its context is lost.

#### Scenario: Replace a run repeatedly
- **WHEN** the user loads three different saved runs in sequence
- **THEN** only the current replay loop and selection handlers remain active, old scene resources are disposed, and controls target the current trace.
