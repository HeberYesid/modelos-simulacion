# Boquitas implementation roadmap

Planning baseline: 2026-10-22. Approved interview decisions are captured here and in the change packages. The engine, observation importer, scenario experiments, local API/UI, three-dimensional replay and local delivery are implemented under specs01–06. Spec07 implementation is authorized and has been built in bounded Luna blocks, preserving version 1. All 28 tasks have passed independent engineering acceptance; no calibrated model or empirical validation is claimed.

## Current implementation status

The user subsequently approved Spec07 implementation on 2026-10-24, explicitly requesting bounded Luna work with independent main-agent review and preservation of version 1/tests. [Independent baseline verification](changes/boquitas-07-preparation-interruptions/review/baseline-verification.md) passed 131 Python and 21 frontend tests, TypeScript, Ruff and mypy and reproduced the version-1 scientific reference. The current working tree contains the V2 engine, metrics, typed contracts, API/file support, editor, non-3D results, and replay. A focused [browser evidence record](changes/boquitas-07-preparation-interruptions/review/browser-acceptance.json) covers the actual V2 editor, run, save/reopen, exports, replay, fallback, and mixed-version selection. The [final Spec07 verification report](changes/boquitas-07-preparation-interruptions/verification-report.md) records 28/28 tasks accepted, 259 Python tests, 37 frontend tests, full applicable type/contract/build checks and actual browser/visual acceptance. Task checkmarks reflect accepted evidence only. No commit, remote operation or main-spec synchronization/archiving is authorized.

The initial 2026-10-24 approval of [plan 001](../plans/001-scripted-preparation-interruptions.md) authorized preparation of [Spec07](changes/boquitas-07-preparation-interruptions/proposal.md), not implementation. The user later approved bounded implementation blocks with independent review. The capability is opt-in V2 scripted pause/cashier/resume behavior for one integrated worker, including metrics, versioned files/API and replay. The version-1 behavior and historical packages remain unchanged. This later authorization does not approve main-spec synchronization/archiving, commits, pushes, pull requests or deployment.

At the planning checkpoint, the [Spec07 planning verification](changes/boquitas-07-preparation-interruptions/planning-verification.md) recorded 18 requirements, 32 scenarios, 28 unchecked implementation tasks, all four planning artifacts complete and strict validation of all seven packages. Those documentary checks are not runtime acceptance of version 2; see the current implementation status above and `tasks.md` for later evidence.

The user approved specs01–05 and on 2026-10-23 authorized spec06. GPT-6 Luna implemented bounded launcher, guide and browser-check blocks at max effort; the main agent independently reviewed them, corrected an observed staffing/first-click defect and an inactive network-check fixture, and executed final acceptance. Spec06 has 10/10 engineering tasks complete and awaits user review. Final checks passed:131 Python tests,21 frontend unit tests,12 existing browser workflows,6 production workflows with external requests denied, Ruff, mypy, both TypeScript checks, contract checks, production build and all 6 OpenSpec packages. See the [release acceptance report](../docs/acceptance-report.md), [Spanish quick guide](../docs/guia-de-uso.md) and [technical guide](../docs/technical-guide.md). The [spec05](changes/boquitas-05-three-dimensional-replay/verification-report.md), [spec04](changes/boquitas-04-local-web-app/verification-report.md), [spec03](changes/boquitas-03-scenario-experiments/verification-report.md), [spec02](changes/boquitas-02-observation-import/verification-report.md) and [spec01](changes/boquitas-01-simulation-engine/verification-report.md) reports retain their historical results.

The user adopted selective TDD on 2026-10-22. The former blanket-TDD process blocker on task3.4 is resolved by that explicit policy decision and the existing functional verification; its recorded chronology is preserved. Spec06 retains observed test-first launcher and first-click regression evidence and all existing tests. Engineering completion does not authorize archiving, synchronization, commits, pushes, PRs or deployment. Calibration and empirical validation remain pending; the prospective measurement protocol supplies no invented thresholds or fitted inputs. No commits or deployment were made.

## Changes and ownership

| Order | Change | Owned capability | Dependencies |
| --- | --- | --- | --- |
| 1 | [Simulation engine](changes/boquitas-01-simulation-engine/proposal.md) | [simulation-engine](changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | None |
| 2 | [Observation import](changes/boquitas-02-observation-import/proposal.md) | [observation-import](changes/boquitas-02-observation-import/specs/observation-import/spec.md) | 01 contracts |
| 3 | [Scenario experiments](changes/boquitas-03-scenario-experiments/proposal.md) | [scenario-experiments](changes/boquitas-03-scenario-experiments/specs/scenario-experiments/spec.md) | 01 and 02 |
| 4 | [Local web application](changes/boquitas-04-local-web-app/proposal.md) | [local-web-app](changes/boquitas-04-local-web-app/specs/local-web-app/spec.md) | 01, 02 and 03 |
| 5 | [Three-dimensional replay](changes/boquitas-05-three-dimensional-replay/proposal.md) | [three-dimensional-replay](changes/boquitas-05-three-dimensional-replay/specs/three-dimensional-replay/spec.md) | 01, 03 and 04 |
| 6 | [Validation and delivery](changes/boquitas-06-validation-and-delivery/proposal.md) | [validation-and-delivery](changes/boquitas-06-validation-and-delivery/specs/validation-and-delivery/spec.md) | 01 through 05 |
| 7 | [Scripted preparation interruptions — engineering accepted](changes/boquitas-07-preparation-interruptions/proposal.md) | [preparation-interruptions](changes/boquitas-07-preparation-interruptions/specs/preparation-interruptions/spec.md) | Implemented 01 through 06 contracts; approved implementation in reviewed Luna blocks |

Read the proposal, capability spec, design and tasks for a change before implementing it. Follow the numbered order; readiness of artifact files does not mean dependencies are implemented. Each change owns one new capability and references its upstream contracts. Spec07 explicitly scopes its extension to version 2 and preserves the version-1 requirements in the original packages. Keep the empty main `specs/` directory unchanged until synchronization/archiving is separately authorized; do not fabricate MODIFIED deltas against missing main specifications.

The main agent owns orchestration, contracts, review and acceptance. The approved Spec07 implementation uses bounded GPT-6 Luna blocks followed by independent main-agent review. Escalate to GPT-6.1 Sol for unresolved architecture/statistical issues or after two unsuccessful attempts at the same defect. Pass upstream contracts and relevant skill paths with each assignment. Keep implementation within the approved Spec07 scope. Do not synchronize or archive main specs, commit, push, create a PR or deploy without separate authorization.

## Planning verification

On 2026-10-22, `openspec validate --changes --strict --no-interactive --json` passed all six changes with zero issues. Each `openspec status --change <name> --json` reported all four planning artifacts done. Readback checks found 48 requirements, 56 acceptance scenarios, 75 unchecked implementation tasks, valid local document links and task references to all requirement IDs. Source-count/correction/overlap assertions matched the actual original and corrected observation files.

At that planning checkpoint these were documentary and source-evidence checks only: no application code, implementation tests, runtime or visual acceptance had been performed and implementation count was 0/75. The current status is recorded above. Planning artifacts being complete means proposals are ready for ordered implementation, not that their software dependencies have been built.

## Sources and evidence limits

Source directory: `C:/Users/HeberYesid/OneDrive - UNIVERSIDAD DE SANTANDER - UDES/Universidad/8/MODELOS`.

- `Boquitas - Fases 1 y 2 corregidas.docx`: conceptual system, measurement caveats and preliminary observation. Interview confirmations supersede previously pending semantics, without changing the document.
- `etapas modelo simulación (2).pdf`: system definition, formulation, data collection, computer implementation, validation, experimentation, interpretation and documentation. Synthetic software demonstrations do not satisfy empirical validation.
- Original observation: `C:/Users/HeberYesid/.codex/attachments/c6ca76f1-31ba-40f8-ba7f-9651e5fe5b9b/Pasted text.txt`.
- Corrected reference in the source directory: `Datos Boquitas 2026-10-20 corregidos.txt`.

The original has 120 observation rows. The corrected reference has 119: 61 cashier rows, including three withdrawals (IDs 16, 19 and 49), and 58 preparation/delivery rows. Cashier 35 ends at 17:46:20 instead of 17:45:20. Delivery 26 is excluded due to the user-reported recording error. Original files must remain unchanged. The importer must not double-apply corrections to the corrected reference or accept arbitrary unrecorded edits as this approved correction set.

Interview-confirmed semantics for the Tuesday source: each cashier row describes a shared order/payment attempt, not every person; each delivery row describes a complete order, from preparation start until delivery of its last product. Neither station's IDs identify the other station in that source. Group sizes and individual arrivals cannot be inferred from these observations. The three withdrawals have unknown group sizes too.

On 2026-10-24 the user supplied eight cashier and eight delivery rows for the 2026-10-23 normal visit and confirmed matching IDs 1–8 as the same orders, delivery start as preparation start, and the same integrated worker pausing order 6's preparation to charge order 7. The [descriptive comparison and source evidence](../plans/comparacion-martes-vs-normal-2026-10.md) preserve this visit-specific provenance. Exact pause/resume boundaries, active preparation time and a generalized interruption policy remain unknown. The confirmation does not establish Tuesday station links or calibrate the model.

At 17:00:10, delivery rows 6, 7, 8, 9, 10 and 11 overlap under half-open intervals `[start,end)`, despite four reported preparers. Keep this conflict visible. Payment windows also overlap; they are not exclusive cashier work measurements. Neither conflict authorizes changing timestamps or staff counts, reconstructing worker assignments, automatically calibrating the motor, or presenting observed end-to-end person times.

## Approved model simplifications

- People are individual entities linked to one order; one payment and one preparation per order. Groups arrive together, complete together, and withdraw together in v1. No partial deliveries, independent group-member departures, product recipes or menu model.
- `tuesday`: initial attention FIFO by order arrival, separate cashier/preparer pools (defaults 1 and 4); preparation FIFO by completed payment. Each preparer keeps one complete order until delivery.
- `regular` version 1: integrated worker pool (default 1); the assigned worker completes payment and preparation before the next order. Additional staffing is hypothetical and configurable. The Spec07 V2 path is opt-in, permits exactly one integrated worker, and pauses only at explicit user-scripted times, preserving remaining preparation. V2 does not define automatic cashier priority, multiple integrated workers, nested pauses, or Tuesday interruptions; whole-change engineering acceptance is complete.
- Payment has active work followed, when applicable, by external confirmation. Tuesday confirmation releases the cashier; regular mode reserves the integrated worker but records no active work during external confirmation. Confirmation is automatic in v1, with no second cashier verification stage.
- Patience is optional and applies only while waiting for first payment service. A group that already began payment does not abandon. At an exact service/expiry tie, service wins. No post-payment abandonment or pre-queue rejection model.
- Unbounded logical queue; no claim about physical waiting capacity. Day labels do not automatically double demand, products or preparation for the promotion.
- Finite day, default 15:00 to 21:30, no warm-up, empty initial state labeled as an assumption. Explicit initial waiting/in-progress orders are supported with known remaining durations. Admit arrivals in `[0,H)` and finish admitted orders after H. Preserve the difference between observation-window statistics and admitted-cohort completion statistics.
- Configure scenarios before running. New settings require a new run. Replay can pause, change speed and seek; it cannot change the simulated history.

## Shared implementation policy

Planned stack: Python 3.13, SimPy, NumPy, SciPy and FastAPI; TypeScript, Vite and Three.js without an additional frontend framework. Use `uv` for Python and `pnpm` for the frontend. Resolve compatible versions at initial implementation and commit lockfiles only when committing is authorized. For Spec07, update task status only after independent acceptance evidence is observed. Do not synchronize or archive the empty main `specs/` directory without separate authorization.

Code layout: `src/boquitas/` and `tests/` contain the engine, observation importer, scenario/demand generation, metrics, replication statistics, experiments, exports, public models, API, fixtures and tests. `web/` contains the local TypeScript application, generated API contracts and unit/browser tests. The procedural Three.js renderer and replay projection/clock live in `web/src/replay/`; `docs/` contains the release guides, acceptance report and prospective empirical-validation protocol. `start-boquitas.ps1` starts the installed local package without dependency downloads. Technical identifiers and specs are English; application text and user guide are Spanish.

All times are simulation seconds relative to a declared local opening time, not browser wall-clock time. Version 1 remains the default for existing scenarios, demos and scientific references. The current implementation supports explicit version-2 payloads where the new configuration fields or pause/resume events are present, with typed compatibility and no silent migration. Spec07 engineering acceptance is complete. Unknown values are `null` plus a reason, not fabricated zeros. Durations must be finite and nonnegative; arrival distribution parameters must produce strictly positive interarrival times. Capacities are positive integers and identities are unique. Undefined ratios and insufficient-replication intervals are explicitly unavailable.

Approved test boundaries, already confirmed by the user: observation import; deterministic simulation; scenario experiments/metrics; local API; replay/UI. Apply the selective policy below; no renewed confirmation of these same boundaries is needed. Pause affected code work if its required runner cannot work. Structural validation does not replace runtime or visual checks.

Implemented verification commands:

- Python: `uv run pytest`, `uv run ruff check .`, `uv run mypy src/boquitas`.
- Frontend: `pnpm --dir web test --run`, `pnpm --dir web typecheck`, `pnpm --dir web build`, `pnpm --dir web test:e2e`.
- Contract drift: `uv --cache-dir .uv-cache run --frozen python scripts/export_web_contracts.py --check` and `pnpm --dir web contracts:check`.
- Planning: `openspec validate --changes --strict --no-interactive` and `openspec status --change <change-name> --json`.

Each task should fit one implementation session and carry its requirement/scenario identifier and observed checks. Specs01–05 have user approval; spec06 has engineering acceptance and awaits user review. Main-agent acceptance requires direct diff review, actual checks and explicit disclosure of failed/skipped checks and relevant limitations. Structural validation is not runtime or visual QA.

## Selective TDD policy

User decision: 2026-10-22. This replaces mandatory test-first treatment of every behavior/edit. The baseline 37 tests remain intact; meaningful new tests can be added as the software grows. The workflow is a bounded OpenSpec change, clear acceptance examples, small coherent implementation blocks, relevant checks and independent review, followed by user approval before the next spec.

| Area | Required testing approach |
| --- | --- |
| Engine rules and time/resource invariants | Focused test-first cycles for new critical behavior not already covered; retain manual timeline oracles |
| Metrics, sampling and comparisons | Establish manually checkable expected values first; test critical calculation, reproducibility and pairing rules before implementing them |
| Observation import | Define representative valid/invalid/corrected examples up front; test data-integrity/correction invariants first, verify ordinary parsing integration per block |
| API, forms and result workflows | Use test-first for uncovered critical contract/integrity behavior; ordinary wiring can be implemented by block and then checked through public interactions |
| 3D and replay | Test critical trace/time projection rules first; build scene, controls and cosmetic motion by block with integration and actual visual QA |
| Launcher, simple configuration and documentation | Relevant integration/setup checks or native validation/readback; no artificial RED for formatting, prose or simple configuration |

For a defect in testable behavior, first add a focused failing regression, fix it, and verify the relevant suite. A purely visual defect needs actual before/after visual reproduction. For a selected TDD cycle, observe the real failure and successful fix; do not batch speculative tests for imagined internals. Existing passing coverage can support refactoring or acceptance without manufacturing a RED or reimplementing working features. Tests added after a block are honestly labeled as acceptance/regression coverage, never retroactively as test-first.

Use targeted checks during iteration and the applicable full suite at block/change closure. Record concise evidence per block: what behavior was checked, actual commands/results and material gaps. Avoid repetitive per-test ceremony and rerunning broad suites without a new change, failure or concern. Review code and observable behavior independently of the implementing agent. This policy preserves functional requirements and the separate user-approval gate; it does not waive a failing or unavailable required check.

## Demonstration and experiment defaults

These are invented teaching inputs, never estimates from Boquitas. The UI and exported results must say so.

| Parameter | Demonstration default |
| --- | --- |
| Arrival interarrival distribution | Exponential, mean 180 seconds; first arrival sampled after opening |
| Group size | 1 with probability 0.6; 2 with probability 0.4 |
| Active payment | Triangular 15 / 30 / 45 seconds |
| Preparation per order | Triangular 60 / 120 / 180 seconds, independent of group size |
| Transfer probability | 0.25 |
| External transfer confirmation | Triangular 30 / 60 / 90 seconds; zero for other payments |
| Patience | Disabled (`null`) |
| Replications | 30 |
| Confidence | 95 percent |
| Root seed | 20261020 |
| Initial state | Empty |

Allow constant, triangular and exponential positive-time distributions and manually weighted positive integer group sizes. Do not add automatic distribution fitting. Generate complete order tapes with independent NumPy streams per replication and input category before resource processing. Staffing comparisons reuse the same tapes; changed demand parameters use matched streams, with different generated demand disclosed. Confidence intervals use replication summaries; comparisons use paired per-replication differences. Intervals describe Monte Carlo variation conditional on assumptions, not uncertainty about actual Boquitas parameters.

## Documentation consulted

Context7 queries on 2026-10-21 and 2026-10-22 informed the plan. The installed OpenSpec 1.4.1 CLI instructions and validation are authoritative for local artifact format; indexed upstream documentation may describe a later version.

- [OpenSpec concepts](https://github.com/fission-ai/OpenSpec/blob/main/docs/concepts.md): proposal/specs/design/tasks dependencies.
- [SimPy shared resources](https://simpy.readthedocs.io/en/latest/simpy_intro/shared_resources.html): FIFO resource requests and capacity.
- [SimPy environments](https://simpy.readthedocs.io/en/latest/topical_guides/environments.html): virtual-time simulation separated from playback.
- [NumPy random streams](https://numpy.org/doc/stable/reference/random/parallel.html): independent reproducible streams.
- [SciPy standard error](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.sem.html): replicate-level standard error with sample variance.
- [FastAPI request bodies](https://fastapi.tiangolo.com/tutorial/body/): typed request validation.
- [Three.js fundamentals](https://threejs.org/manual/en/fundamentals.html): scene, camera and renderer.
- [Vite production builds](https://vite.dev/guide/build.html): local bundled browser assets.

Before implementation, refresh relevant APIs through Context7 and use applicable installed skills. Before frontend work, execute the installed modern-web-guidance search and read frontend-design; before browser QA, read agent-browser. Do not fetch private field data through documentation tools.
