## ADDED Requirements

### Requirement: WEB-01 Typed local operations reuse domain contracts
The application SHALL expose versioned observation-import, single-run and experiment HTTP operations using upstream contracts, explicit inputs and structured validation errors. Invalid payloads SHALL NOT start a run or produce a success result.

#### Scenario: Invalid staffing input
- **GIVEN** a scenario has zero preparers in Tuesday mode
- **WHEN** it is submitted to `POST /api/v1/runs`
- **THEN** HTTP 422 identifies the invalid field and the UI keeps the editable scenario without a new accepted result.

### Requirement: WEB-02 Observe data quality before interpretation
The UI SHALL allow CSV/TXT upload or pasted text with explicit correction-policy selection and SHALL display counts, exclusions, corrections and affected rows for diagnostics. It SHALL keep observations separate from simulated results and SHALL NOT silently convert an import into scenario parameters.

#### Scenario: Import approved corrected observations
- **WHEN** the corrected reference is imported with the named profile
- **THEN** the screen shows 119 included rows, three withdrawals, the already-reflected profile and the six-versus-four delivery overlap conflict, with person counts unavailable.

### Requirement: WEB-03 Configure the complete approved scenario
The UI SHALL edit mode, staffing, opening/closing, explicit initial state, distribution parameters, group weights, transfer assumptions, patience, root seed and replication count. It SHALL begin with a labeled synthetic demo and display model simplifications beside affected parameters.

#### Scenario: Switch to regular mode
- **WHEN** the user selects regular mode
- **THEN** integrated workers default to one, separate pool controls are inapplicable, confirmation reservation is explained and no demand parameter is automatically changed.

### Requirement: WEB-04 Results correspond to an immutable submitted configuration
The UI SHALL show the submitted configuration and assumptions for each result, distinguish edits from the completed run and require a new request for changed parameters. Running or failed states SHALL prevent a stale result from being represented as the current edited scenario.

#### Scenario: Edit after running
- **GIVEN** a run is displayed
- **WHEN** the user changes preparation duration
- **THEN** the previous run remains labeled with its original duration and the interface indicates the edits have not been executed.

### Requirement: WEB-05 Compare replicated scenarios transparently
The UI SHALL show per-scenario metrics, units, cohorts, valid-replication counts, 95 percent intervals and paired candidate-minus-reference differences. It SHALL identify shared versus changed demand assumptions and enable selection of one scenario/replication for replay.

#### Scenario: Select a batch member
- **GIVEN** a completed comparison with seed S
- **WHEN** scenario B and replication 4 are selected for inspection
- **THEN** the application requests that exact single run and its metrics match the corresponding stored replication summary.

### Requirement: WEB-06 Save and reopen exact results
The application SHALL download and reopen versioned scenario and run/experiment JSON and download the defined CSV tables. It SHALL validate imported JSON and preserve event history without rerunning a saved run.

#### Scenario: Reopen an incompatible file
- **GIVEN** a JSON file has an unsupported contract version
- **WHEN** the user tries to open it
- **THEN** an actionable format error is displayed and the existing valid result remains available.

### Requirement: WEB-07 Core results remain usable without 3D
The application SHALL present tables and queue/metric charts independently of a 3D renderer and provide an embedded host for the later replay. Network/validation failures, empty samples and unavailable indicators SHALL receive explicit Spanish states rather than misleading zero values.

#### Scenario: Browser has no usable WebGL
- **WHEN** a valid run is opened on that browser
- **THEN** its metrics, tables, export and non-3D timeline/state inspection remain usable with a clear renderer-unavailable message.

### Requirement: WEB-08 Local bundled operation and accessible controls
The application SHALL bind to loopback by default, serve production frontend/assets locally and avoid runtime CDN/font dependencies. Forms and controls SHALL support keyboard navigation, visible focus, readable labels, error identification and reduced-motion preferences.

#### Scenario: Offline runtime
- **GIVEN** installation and production build have completed
- **WHEN** the computer has no internet and the local service starts
- **THEN** configuration, execution, charts and locally installed visual assets load without external requests.
