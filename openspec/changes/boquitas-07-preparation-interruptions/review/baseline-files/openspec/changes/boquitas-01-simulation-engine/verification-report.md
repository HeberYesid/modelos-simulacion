# Spec01 independent verification report

Original review: 2026-10-22. Selective-TDD policy revision: 2026-10-22. Implementer: GPT-6 Luna, max effort. Reviewer: main agent. Scope: `boquitas-01-simulation-engine` only.

## Acceptance status

Functional verification passed in the reviewed scope. No unresolved actionable code defects were found in the final review. The user explicitly adopted selective TDD on 2026-10-22, resolving the former blanket-TDD process blocker on task3.4. Its behavior and existing acceptance checks were already independently verified; the task is now complete under the current policy, with 16/16 engineering tasks checked. Historical test order remains recorded accurately. Separate user approval is still required before spec02, synchronization or archiving; no commit or deployment is authorized by this policy revision.

## Scope and reviewed files

The implementation adds `.python-version`, `.gitignore`, `pyproject.toml`, `uv.lock`, `src/boquitas/__init__.py`, `src/boquitas/models.py`, `src/boquitas/engine.py` and `tests/test_simulation_engine.py`. The reviewer inspected these new-file contents and the relevant specification/task updates. Eight product/tooling file hashes were captured after the passing checks to detect subsequent changes.

The public boundary is `simulate(config, demand, initial_state) -> SimulationTrace`, with typed immutable inputs/events/results and structured `InputValidationError`. No importer, random-demand generator, experiment statistics, API, interface or 3D implementation was added. At the original implementation review, all 25 existing files belonging to changes02-06 matched their before-implementation SHA-256 snapshots. The subsequent selective-TDD revision updates their workflow documentation only. Main specs remain unsynchronized.

## Checks independently executed by the main agent

Environment: Windows, Python 3.13.7, SimPy 4.1.2, Pydantic 2.14.1, pytest 9.1.1, Ruff 0.17.1 and mypy 2.4.0. The lockfile contains the resolved dependency versions. `UV_CACHE_DIR` points to the ignored project-local `.uv-cache`.

| Command | Observed result |
| --- | --- |
| `uv run --frozen --offline pytest` | Exit 0; 37 passed in 0.31s |
| `uv run --frozen --offline ruff check .` | Exit 0; All checks passed |
| `uv run --frozen --offline mypy src/boquitas` | Exit 0; no issues in 3 source files |
| `git diff --check` | Exit 0; Git reported the existing LF/CRLF conversion notice, no whitespace errors |

Pytest's cache provider is disabled because workspace permissions caused its optional cache creation to fail. Tests and warnings are not globally disabled. Ruff excludes dependency/tool/planning/cache directories, not the product or test directories. Mypy uses strict project checks and ignores unavailable import typing; passing mypy is not proof that the untyped external SimPy API is fully type-checked.

No browser, graphics or real-business calibration check is applicable to this motor-only implementation. Passing these checks does not establish empirical validity of Boquitas parameters.

## Requirement and evidence map

| Requirement | Public checks reviewed and independently executed |
| --- | --- |
| ENG-01 | Empty-run repeatability; invalid capacity, nonfinite time, empty members, opening-clock validation and global identities; additional 19-case invalid-input matrix |
| ENG-02 | `test_two_people_share_one_payment_and_one_preparation`; one shared delivery completes both linked people |
| ENG-03 | Tuesday solved timeline and fifth-paid-order capacity test; main-agent numeric worker ordering probe with 12 cashiers |
| ENG-04 | Regular solved timeline; independent two-integrated-worker FIFO/release probe |
| ENG-05 | Arrival/input FIFO, payment-completion reorder, confirmation tie and worker ID fixtures; reversed initial paid ranks before a new time-zero order |
| ENG-06 | Tuesday released cashier versus regular reserved/inactive confirmation; independent initialized active/pending residual-work probes |
| ENG-07 | Whole-group withdrawal, service/expiry tie, cancelled deadline; independent queued group plus new-arrival zero-time cascade |
| ENG-08 | Arrival at 9 finishing at 14 for H=10; arrival exactly at H excluded; unused patience does not extend drain |
| ENG-09 | Waiting payment, active payment, pending confirmation, waiting preparation and preparation initial forms; explicit ranks, residual patience, null/known historical arrivals and invalid assignments |
| ENG-10 | Public stage/resource details, same-time event sequence, consumer reconstruction, nested immutability and JSON round trip |
| ENG-11 | Same explicit workload preserves order/person identities and operation counts across modes; no stochastic, product, walking or inventory effects |

These rows map behavior, not a statement of 100 percent branch coverage. The additional probes below were executed after implementation as independent acceptance checks; they are not represented as test-first development.

## Additional independent probes

- Two orders arriving at 0/1 with active payment 2, preparation 3 and no transfer: Tuesday deliveries A=5/B=7; regular A=5/B=10.
- Regular two-worker case: A arrives0, B/C arrive1, each payment2/preparation3; starts are A0 on worker1, B1 on worker2, C5 on worker1; deliveries are 5/6/10, all workers released.
- Positive payment duration and arrival offset `5e-10` remain positive event times instead of being rounded to zero.
- A regular worker becomes free at5; a waiting two-person order with deadline5 and a new order at5 with patience0 both complete their zero-time stages at5 without abandonment.
- Reversed initial paid ranks X2/Y1 with preparation3/2 and a newly paid Z at0 with preparation4: deliveries Y2/X5/Z9, initial arrival values remain null.
- Initial regular preparation with remaining0, an initialized waiting two-person order with remaining patience0 and zero stages, and a new zero-stage order with patience0 all deliver at0; no artificial abandonment.
- Initial regular pending confirmation remaining5 plus preparation2 at H=1 finishes at7; it emits no fabricated payment start/active-end. A new zero-patience waiter abandons at0.
- Initial Tuesday active payment remaining2, external wait3 and preparation4 finishes at9; known historical arrival -8 is preserved and no historical payment-start event is synthesized.
- Numeric worker allocation with 12 cashiers uses cashier1 through cashier12 before reusing cashier1, rather than lexicographic ordering.
- The combined traces retain monotone time, contiguous event sequence, released final workers and equal JSON round trips.
- Invalid-input matrix: each of arrival, active payment, transfer, preparation and patience rejects -1, infinity and NaN (15 cases); unknown worker, worker on a Tuesday pending transfer, missing required initial future duration and wrong worker pool add four structured rejections.

## Findings corrected during review

1. A due-time epsilon incorrectly erased a genuine `5e-10` positive duration and could admit a nearby future arrival early. Reproduced independently; corrected with a failing regression and independently rechecked.
2. A zero-person order was accepted. Corrected with a public failing regression and independently verified structured rejection.
3. A person could belong to two orders, including scheduled demand excluded by H. Corrected before admission filtering with a public failing regression and independently rechecked.
4. An invalid opening clock `99:99:99` was accepted. Corrected with a public failing regression and independently rechecked.

No feature was removed solely to manufacture RED evidence. Tooling/static-check corrections did not change model semantics.

## TDD process history and current approval gate

At the original implementation, the user's strict-TDD instruction and installed skill required observed relevant failures before behavior implementation. Recorded evidence includes real RED/GREEN cycles for initial public API creation, selected validation changes, shared orders, regular mode, transfers/ties, patience, the time-epsilon regression and trace details. Some additional acceptance tests already passed against existing generalized behavior; the log identifies those honestly.

For task3.4, only waiting-payment initialization had an observed test-first failure. Its implementation edit generalized other initial stages before their stage-specific tests were added. Their passing tests and the main-agent probes establish current behavior, but cannot retroactively establish test-first history. This deviated from the policy then in effect, not from a missing runtime check. See `tdd-evidence.md`, sections `3.4 Initial waiting-payment queue` and `3.4 Remaining initial-state coverage`.

The reviewer originally left task3.4 unchecked, completed the actual review/check task4.1, and stopped for user review. The user's subsequent explicit selective-TDD decision resolves that process-only blocker using the already verified behavior. Task3.4 is now checked; no test was deleted and no historical RED was manufactured. Spec01 is technically complete under the current policy, not retroactively compliant with blanket strict TDD. Authorization to start spec02 or synchronize/archive remains a separate user decision.

## Selective-TDD policy revision

This revision changes instructions and OpenSpec documentation only. It preserves the 37-test baseline, engine source, dependency configuration and lockfile. The updated policy requires focused test-first checks for new uncovered critical rules/calculations and testable bug regressions, and allows coherent integration/UI/tooling blocks with relevant verification before acceptance. The original check results above remain the historical review evidence; this revision does not claim new Ruff, mypy or visual checks for documentation-only edits.

Policy-revision verification on 2026-10-22: `uv run --frozen --offline pytest -q` passed all 37 tests in 0.33s; strict OpenSpec validation passed all six changes. SHA-256 comparison confirmed all eight product/tooling/test files were byte-identical to their pre-revision snapshot. Local document links resolved, spec01 reported 16/16 engineering tasks complete, and specs02-06 retained zero completed implementation tasks. No historical test result was rewritten to claim a different development order.
