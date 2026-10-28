Implementation authorized for this change only. Owner: GPT-6 Luna (max effort); reviewer: main agent. No upstream implementation dependency. Apply the confirmed simulation boundary and [selective TDD policy](../../README.md#selective-tdd-policy): new uncovered critical rules and defect fixes are test-first; existing covered behavior can be verified per coherent block. Preserve the 37 baseline tests and actual chronology. Check tasks only after observed evidence. Stop for user approval before implementing any later change; do not archive or synchronize this change yet.

## 1. Tooling and first public behavior

- [x] 1.1 Establish Python 3.13/uv package, locked dependencies, pytest, Ruff and mypy commands; verify runner availability without inventing behavior-test failures.
- [x] 1.2 Implement ENG-01's empty deterministic run through `simulate`; verify repeated trace equality, declared window and final empty state.
- [x] 1.3 Implement ENG-01 validation in successive failing-example slices for invalid capacity/time/identity; verify field errors and no partial trace.

## 2. Orders and resource rules

- [x] 2.1 Implement ENG-02's two-person shared order; verify one payment, one preparation and two completions at 5.
- [x] 2.2 Implement ENG-03's Tuesday A/B fixture; verify stage times and delivery at 5/7 through public events.
- [x] 2.3 Implement ENG-03's fifth eligible order; verify four-preparer maximum and exclusive worker identity.
- [x] 2.4 Implement ENG-04's regular A/B fixture; verify B starts at 5 and delivers at 10.
- [x] 2.5 Implement ENG-05 stable arrival/completion/worker tie rules; verify initial service FIFO and paid-order reordering from a transfer.
- [x] 2.6 Implement ENG-06 confirmation stages in separate Tuesday and regular slices; verify released versus reserved-inactive worker intervals.

## 3. Boundary conditions and state history

- [x] 3.1 Implement ENG-07 optional whole-group withdrawal before payment; verify no later service and no abandonment after payment starts.
- [x] 3.2 Implement ENG-07 exact deadline service priority; verify release/expiry at 5 starts service once.
- [x] 3.3 Implement ENG-08 closing/drain; verify arrival 9 delivers at 14 with H=10 and arrival at 10 is not admitted.
- [x] 3.4 Implement ENG-09 initial waiting queues, remaining patience and in-progress active/pending/preparation stages; verify remaining times, known/null history, pool compatibility and no duplicate admission under the selective TDD policy.

Policy resolution on 2026-10-22: the user adopted selective TDD. Existing implementation, 37 tests and independent review supply the functional acceptance evidence, so the earlier blanket-TDD blocker is removed and this engineering task is complete. Historical evidence still records which initial-stage tests were added after implementation; no retroactive RED/GREEN claim is made. See `tdd-evidence.md` and `verification-report.md`.

- [x] 3.5 Complete ENG-10 versioned event/resource history; verify reconstruction from trace, same-time ordering and zero-duration stages at the public boundary.
- [x] 3.6 Verify ENG-11 using identical explicit workload in both modes; ensure no implicit promotion, walking, inventory or duplicated group work.

## 4. Main-agent acceptance

- [x] 4.1 Run `uv run pytest`, `uv run ruff check .` and `uv run mypy src/boquitas`; inspect the full diff and capture actual results mapped to ENG-01 through ENG-11 before accepting or marking implementation complete.

Main-agent review completed on 2026-10-22: 37 tests passed; Ruff and mypy passed using the frozen lockfile offline. Functional probes also passed. The later explicit selective-TDD decision resolves the process-only blocker on 3.4. All 16 engineering tasks are checked; user approval before advancing remains required, and no later spec is authorized by these check results or this policy update.
