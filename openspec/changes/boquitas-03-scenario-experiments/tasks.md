Implementation authorized on 2026-10-22 after user approval of specs 01 and 02. Owner: GPT-6 Luna at max effort; reviewer: main agent, escalating statistical/contract issues to GPT-6.1 Sol when needed. The approved boundary is scenario execution, metrics and comparisons. Apply the [selective TDD policy](../../README.md#selective-tdd-policy): use manually solved oracles and focused test-first cycles for critical calculations, seed/pairing rules and bug regressions; verify ordinary integration/export work by coherent block. Preserve existing tests and concise evidence.

## 1. Inputs and deterministic random generation

- [x] 1.1 Implement EXP-01 typed distributions/scenario validation and the exact synthetic demo defaults; verify labels and that imports never populate fitted parameters.
- [x] 1.2 Implement EXP-02 indexed NumPy streams and complete tapes; verify fixed-seed repeatability independent of call order.
- [x] 1.3 Implement EXP-02 matched staffing comparisons; verify all order/person identities and timings remain equal when only capacity/mode changes.
- [x] 1.4 Implement EXP-09 request/workload bounds and invalid-distribution errors; verify no silent truncation or complete-success result after failure.

## 2. Metrics from the public trace

- [x] 2.1 Implement EXP-03 order/person cohort counts and elapsed-time summaries; verify the 0/6-second group-weighting oracle yields 3 seconds per order and 4 per person.
- [x] 2.2 Implement EXP-04 exact queue integration and settled maxima; verify area 4 over H=10 yields 0.4 and no zero-time spike.
- [x] 2.3 Implement EXP-05 active/reserved pool fractions; verify payment 2 + external 6 + preparation 2 yields active 0.4 and reserved 1.0.
- [x] 2.4 Implement EXP-06 window/cohort/drain and incomplete-initial-history behavior; verify closing at 10, delivery at 14, permanence 5 and overtime 4.
- [x] 2.5 Complete metrics edge cases for no arrivals, all withdrawals and unknown initial timestamps; verify valid zero occupancies versus unavailable elapsed-time denominators.

## 3. Replication statistics and files

- [x] 3.1 Implement EXP-07 replicate summaries and two-sided t intervals; verify the [1,2,3] oracle, n<2 unavailable case and constant-sample zero-width interval.
- [x] 3.2 Implement EXP-07 paired candidate-minus-reference differences and jointly valid counts; verify matched index use and changed-demand disclosure.
- [x] 3.3 Implement EXP-08 RunResult/ExperimentResult and selected-replication reproduction; verify indexed single-run metrics match their batch member.
- [x] 3.4 Implement EXP-08 versioned JSON save/reopen and rectangular CSV tables; verify exact scientific JSON round trip, units/denominators, null handling and safe text cells.

## 4. Main-agent acceptance

- [x] 4.1 Run applicable Python tests, Ruff and mypy; directly review statistics, seed derivation and exports, with actual evidence mapped to EXP-01 through EXP-09.

All 14 engineering tasks are complete; see [independent review](verification-report.md). User approval remains pending before spec04 or synchronization/archiving.
