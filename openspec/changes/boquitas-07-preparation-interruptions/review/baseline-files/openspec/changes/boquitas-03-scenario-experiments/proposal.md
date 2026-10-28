## Why

The engine needs reproducible hypothetical inputs and interpretable outputs to support academic comparisons. Random arrivals and different staffing must not be confounded by changing random draws, and simulated variability must not be presented as validation of real Boquitas parameters.

## What Changes

- Generate complete order tapes from explicitly chosen distributions and the labeled demonstration defaults.
- Derive person/order metrics, temporal queue averages, active utilization and reserved time from engine events.
- Run independent replications with matched random streams across scenarios, including paired differences and 95 percent confidence intervals.
- Export versioned scenario, run and experiment results to JSON and rectangular CSV tables.
- Dependencies: 01 engine/trace contracts; 02 evidence-quality separation.
- Non-goals: automatic fitting, inferred effects of promotion, optimization, forecasting actual business outcomes, interpreting historical unlinked stations as complete person trajectories.

## Capabilities

### New Capabilities

- `scenario-experiments`: reproducible demand, metrics, comparisons and portable result contracts.

### Modified Capabilities

None.

## Impact

Future demand generation, metrics and experiment modules; NumPy and SciPy dependencies; public run/experiment/export boundaries. 04 and 05 consume these contracts without duplicating calculations.
