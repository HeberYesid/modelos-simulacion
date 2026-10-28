## Why

The academic team needs to import observations, configure hypotheses and compare results without editing Python. A local browser application provides that access and a stable host for the later 3D replay.

## What Changes

- Provide typed local API operations for observation import, a single scenario and scenario comparisons.
- Build a Spanish-language interface for data quality, parameters, initial state, results, charts and JSON/CSV files.
- Serve a locally bundled TypeScript application from FastAPI; reserve an embedded replay area for 05.
- Dependencies: completed contracts and implementation of 01, 02 and 03.
- Non-goals: public hosting, accounts, collaboration server, arbitrary local-path browsing, database, live modification of running scenarios and 3D authoring.

## Capabilities

### New Capabilities

- `local-web-app`: local configuration, observation inspection, simulation and comparison workflows.

### Modified Capabilities

None.

## Impact

Future FastAPI adapter and `web/` TypeScript/Vite project. Introduces `/api/v1/observations/import`, `/api/v1/runs` and `/api/v1/experiments`. Payloads reference upstream types. API and UI workflow tests use already-confirmed boundaries.
