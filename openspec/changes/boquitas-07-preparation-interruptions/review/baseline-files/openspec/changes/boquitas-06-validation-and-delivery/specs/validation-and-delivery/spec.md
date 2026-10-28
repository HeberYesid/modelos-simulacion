## ADDED Requirements

### Requirement: REL-01 Repeatable local startup and shutdown
Delivery SHALL document Windows dependency installation and provide a local launcher using the installed environment and built assets. Startup SHALL use loopback, identify missing setup or an occupied port clearly and support a documented shutdown without leaving unintended background services.

#### Scenario: Start twice after installation
- **GIVEN** the application is installed and built
- **WHEN** the user starts, stops and starts it again
- **THEN** the demo opens both times on the documented local address without rebuilding or downloading dependencies at runtime.

### Requirement: REL-02 Offline runtime is observed
The installed/built application SHALL complete the agreed local workflows without internet access. Initial dependency installation MAY require internet, but that requirement SHALL be distinguished from runtime.

#### Scenario: Offline complete workflow
- **GIVEN** Python/frontend dependencies and browser assets are installed
- **WHEN** external network access is unavailable
- **THEN** import, simulation, comparison, saved-file reopening and 3D replay use local resources successfully.

### Requirement: REL-03 End-to-end acceptance uses actual evidence
Acceptance SHALL include actual import, scenario execution, comparison, export/reopen and replay workflows, applicable static/test/build checks and direct diff review. A delegated completion report or OpenSpec structural validation alone SHALL NOT be accepted as runtime or visual proof.

#### Scenario: Missing visual inspection
- **GIVEN** unit tests and build pass but no actual 3D browser inspection occurred
- **WHEN** the acceptance report is written
- **THEN** visual verification remains pending and the report does not claim complete graphical acceptance.

### Requirement: REL-04 Guides support use and reproduction
Delivery SHALL include an English technical guide and Spanish user guide explaining installation, scenarios, observations, metrics, assumptions, repeatable seeds, saved files, timeline controls, errors and shutdown. Technical documentation SHALL identify commands, dependency locks and public contracts.

#### Scenario: Another team member follows the guide
- **WHEN** a team member uses the documented demo settings and seed after installation
- **THEN** the saved scientific outputs match the reference run within the stated locked environment and the guide explains which values are synthetic.

### Requirement: REL-05 Software verification is distinct from empirical validation
Documentation SHALL state that the first release verifies software behavior and hypothetical scenarios, not calibrated Boquitas predictions. It SHALL describe the additional measurements and independent comparison protocol needed before claiming empirical validity or operational recommendations.

#### Scenario: Validation status is reported
- **GIVEN** only current preliminary observations and synthetic acceptance runs
- **WHEN** a release summary is generated
- **THEN** empirical calibration/validation are marked pending and no generated improvement percentage is attributed to the real business.

### Requirement: REL-06 Acceptance status is traceable and honest
The acceptance report SHALL map requirement/scenario IDs to observed checks, commands, environment and outcomes, including failed/skipped/pending work. Implementation tasks SHALL only be completed after their required evidence exists; source observations SHALL remain unmodified.

#### Scenario: A required runner is unavailable
- **WHEN** the responsible task cannot execute its relevant checks
- **THEN** affected implementation pauses, the blocker and pending checks are recorded and no RED/GREEN or passing result is invented.
