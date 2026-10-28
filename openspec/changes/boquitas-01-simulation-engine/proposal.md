## Why

The project has conceptual descriptions and observations but no executable model. A deterministic, independently testable engine must establish the agreed resource and person/order rules before importing measurements or building visuals.

## What Changes

- Define versioned domain inputs and a public virtual-time simulation interface with an auditable event trace.
- Model Tuesday and regular staffing, shared orders, active payment versus external confirmation, FIFO, optional patience, explicit initial state and finite admission with drain-to-completion.
- Establish Python tooling and the already-approved engine TDD boundary; use manually solved examples as acceptance oracles.
- Dependencies: none. This change owns the contracts consumed by 02 through 05.
- Non-goals: random input generation, aggregate experiment statistics, calibration, imported-observation reconstruction, API and graphics.

## Capabilities

### New Capabilities

- `simulation-engine`: deterministic person/order simulation and complete resource-state history.

### Modified Capabilities

None.

## Impact

Future Python domain/engine modules, tests and Python dependency configuration. Introduces `simulate(config, demand, initial_state)` and trace contract version 1. No existing code or public API exists to break. This proposal does not authorize implementation.
