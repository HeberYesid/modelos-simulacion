## ADDED Requirements

### Requirement: OBS-01 Parse the supplied text format with provenance
The importer SHALL parse UTF-8 CSV/TXT with the agreed header, BOM if present, blank lines, repeated headers and message prefixes attached to headers. It SHALL preserve source identity, physical line number and original field values for every data row and report malformed lines instead of silently losing them.

#### Scenario: Original pasted message source
- **GIVEN** the original 2026-10-20 file with message labels and two header blocks
- **WHEN** it is imported without corrections
- **THEN** 120 observation rows are accounted for, comprising 61 cashier and 59 delivery rows, and message labels are not interpreted as observations.

### Requirement: OBS-02 Apply only explicit auditable corrections
The importer SHALL preserve raw observations and support the named approved correction profile separately from no-correction import. It SHALL record the cashier 35 end-time change and delivery 26 exclusion, reject profile application to conflicting datasets and be idempotent on the approved corrected reference.

#### Scenario: Apply the approved profile to the original
- **GIVEN** the original file and profile `boquitas-2026-10-20-v1`
- **WHEN** normalization completes
- **THEN** the corrected view contains 119 rows, cashier 35 ends at 17:46:20, delivery 26 is excluded with a reason, and original values remain accessible.

#### Scenario: Already corrected source
- **GIVEN** the 119-row corrected reference and the same profile
- **WHEN** it is imported
- **THEN** it still contains 119 included rows and records the profile as already reflected rather than applying another removal or inventing a missing raw row.

#### Scenario: Unapproved changed values
- **GIVEN** a dataset that differs from both approved canonical source views
- **WHEN** the named profile is requested
- **THEN** the result identifies profile mismatch and does not overwrite values under the approved-profile label.

### Requirement: OBS-03 Preserve station-local order observations
Observation identity SHALL be qualified by date, station and local ID. Station rows SHALL remain order/payment observations with unknown person/group counts unless separately observed. The importer SHALL NOT pair station IDs or invent individual trajectories.

#### Scenario: Equal local identifiers
- **GIVEN** cashier ID 1 and delivery ID 1 on the same date
- **WHEN** the report is produced
- **THEN** they remain distinct observations with no asserted shared order or person identity and no end-to-end duration.

### Requirement: OBS-04 Retain withdrawals and incomplete observations distinctly
The importer SHALL classify an arrival and departure without service start/end as a recorded withdrawal, preserve incomplete observations separately, and never turn missing times into zero-duration service or a fitted patience distribution.

#### Scenario: The three recorded cashier departures
- **GIVEN** cashier IDs 16, 19 and 49 in the supplied data
- **WHEN** outcomes are classified
- **THEN** all three remain withdrawals, with unknown reasons and group sizes, and no service duration is attributed to them.

### Requirement: OBS-05 Diagnose impossible chronology and identities
The importer SHALL report invalid dates/times, negative elapsed durations, contradictory service/departure outcomes, duplicate station/date/ID keys and zero-duration observations. Invalid rows SHALL remain visible with validity flags rather than silently entering descriptive summaries.

#### Scenario: Chronology error
- **GIVEN** a row whose service end precedes its start on the recorded date
- **WHEN** validation runs
- **THEN** a row/field diagnostic is returned, original values remain available and that row is excluded from the affected duration summary.

### Requirement: OBS-06 Audit interval concurrency without inferring resources
The importer SHALL compute station interval overlap using `[start,end)` and SHALL label delivery concurrency exceeding reported preparation capacity as a consistency conflict. Overlapping payment windows SHALL NOT be interpreted as simultaneous active cashier occupation.

#### Scenario: Corrected delivery overlap
- **GIVEN** the corrected 58 delivery observations and reported preparation staff 4
- **WHEN** concurrency is audited
- **THEN** the report includes six concurrent intervals at 17:00:10 and identifies delivery rows 6, 7, 8, 9, 10 and 11 without changing their times or staff count.

### Requirement: OBS-07 Descriptive results disclose their units and eligibility
Reports SHALL identify record counts, valid per-station waiting/transaction/preparation intervals and the subset excluded from each calculation. They SHALL NOT expose inferred full-system person times, active utilization, calibrated model parameters or inferred worker assignments from this sample.

#### Scenario: Shared payment with unknown group size
- **GIVEN** a valid cashier observation with arrival, start and end and no group size
- **WHEN** its elapsed times are displayed
- **THEN** they are labeled as the observed cashier order/payment attempt, person count is unknown and transaction duration is not called active cashier work.
