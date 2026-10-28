Implementation authorized after spec01 contracts. Owner: GPT-6 Luna; reviewer: main agent. Test the confirmed import boundary using raw/reference fixtures and unchanged-source hashes. Apply the [selective TDD policy](../../README.md#selective-tdd-policy): define representative input/output examples up front; use test-first for correction/data-integrity rules and bug regressions, and verify ordinary parsing integration per coherent block. Preserve existing tests and concise actual evidence.

## 1. Parsing and provenance

- [x] 1.1 Record read-only canonical source fixtures and original/reference hashes; verify 120 raw rows and the 119-row corrected reference without changing either source.
- [x] 1.2 Implement OBS-01 parsing from a failing original-file example; verify headers/message prefixes, physical lines, optional BOM, field values and 61/59 raw station counts.
- [x] 1.3 Implement OBS-01 malformed-header, encoding and malformed-line diagnostics in separate public examples; verify rows are never silently discarded.

## 2. Corrected views and measurement limits

- [x] 2.1 Implement OBS-02 approved correction manifest and original profile application; verify only cashier 35 and delivery 26 change and 119 rows remain included.
- [x] 2.2 Implement OBS-02 already-corrected idempotence and mismatched-profile rejection; verify no fabricated missing row or unauthorized overwrite.
- [x] 2.3 Implement OBS-03 qualified station/date identity and unknown group sizes; verify equal station-local IDs do not create a join or person time.
- [x] 2.4 Implement OBS-04 withdrawal/incomplete outcomes; verify cashier 16/19/49 remain three recorded withdrawal attempts with unknown causes/group sizes.

## 3. Quality and descriptive reporting

- [x] 3.1 Implement OBS-05 chronological, duplicate-key, contradictory-outcome and zero-duration diagnostics as successive slices; verify affected-summary exclusion and retained raw evidence.
- [x] 3.2 Implement OBS-06 half-open interval sweep; verify delivery IDs 6/7/8/9/10/11 overlap at 17:00:10 and payment overlap is not utilization.
- [x] 3.3 Implement OBS-07 station/unit-qualified descriptive summaries and ImportReport serialization; verify eligibility denominators and unavailable person/system metrics.

## 4. Main-agent acceptance

- [x] 4.1 Run the applicable Python tests, Ruff and mypy; inspect source hashes and full diff, and map actual results to OBS-01 through OBS-07 before acceptance.

Engineering verification is complete; see [independent review](verification-report.md) and [selective TDD evidence](tdd-evidence.md). User approval is pending before spec03 or any synchronization/archive action.
