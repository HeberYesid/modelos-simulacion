# Field-kit implementation evidence

## Scope

Added header-only UTF-8 CSV templates, a pending JSON analysis plan, a Spanish field guide, and an independent acceptance checklist under `docs/field-kit/`. Added the standard-library-only `scripts/check_empirical_readiness.py` and public subprocess tests in `tests/test_empirical_readiness.py`.

The CLI checks template headers, IDs, visit/order/source references, timestamp chronology, visit-level split overlap, calibration-only parameter provenance, scenario references, and required approval/analysis decisions. It reports `INVALID` with exit 1 for structural errors, `NOT_READY` with exit 2 for pending evidence or decisions, and `STRUCTURALLY_READY` with exit 0 when these structural checks have no issues. Every report sets `empirical_validity`, `statistical_adequacy`, and `cross_visit_identity_independence` to `NOT_ASSESSED`. The CLI does not fit parameters, infer global person links, or determine statistical adequacy.

## Focused test-first evidence

The chronology and split-integrity tests were written before the CLI. The first sandboxed pytest attempts could not enumerate pytest's temporary directory during cleanup (`PermissionError: WinError 5`); those runs are not counted as test evidence. A retry using a unique basetemp and the authorized elevated local runner produced the intended initial failure before implementation:

```text
uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_empirical_readiness.py --basetemp .pytest-tmp-empirical-red-elevated-20261024
3 failed in 0.26s
```

The empty-template test received no JSON because the CLI did not yet exist; the chronology and split tests could not invoke the script. This demonstrates the requested public behaviors were uncovered; it was not a failure of an existing validator.

After implementation, the initial three focused tests passed. The suite was then expanded with public cases for explicit unknown group size, source provenance, strict JSON/CSV parsing, timestamp precision, identity markers, and the structural-validity boundary. The final focused run was:

```text
uv --cache-dir .uv-cache run --frozen --offline pytest tests/test_empirical_readiness.py --basetemp .pytest-tmp-empirical-review3-final-20261024
16 passed in 2.30s
```

The targeted lint check also passed:

```text
uv --cache-dir .uv-cache run --frozen --offline ruff check scripts/check_empirical_readiness.py tests/test_empirical_readiness.py
All checks passed!
```

Running the CLI against `docs/field-kit/templates` reports `NOT_READY`, JSON `exit_code: 2`, process exit 2, and `cross_visit_identity_independence: NOT_ASSESSED`. The test subprocess assertions independently confirm exit codes 0, 1, and 2 for structural success, invalid data, and pending templates.

## Limits and pending human work

All populated test rows are explicitly `TEST ONLY` fixtures. The field templates remain header-only and the plan retains null/unset thresholds, precision targets, sample targets, and pending approvals. No field data were collected or copied into the kit. No fitting, calibration, empirical validation, statistical adequacy decision, or independent human acceptance was performed. The full repository suites were not run while Spec07 work is in progress; only the new focused tests and targeted Ruff check were run.

## Independent integrity review follow-up

Focused public-CLI regressions reproduced and fixed the issues found during independent review:

| Issue | RED evidence | GREEN evidence |
| --- | --- | --- |
| Parameter record references could conflict with declared calibration visits or fail to resolve. | `test_parameter_record_reference_must_match_declared_calibration_visits`: 1 failed in 0.36s; CLI returned 0 for a validation-only reference. | Same test: 1 passed in 0.51s after exact `source_id:record-reference` values were mapped to visit IDs. `test_parameter_reference_ambiguous_across_visits_is_invalid`: 1 passed in 0.20s for a reference present in two visits. `test_parameter_record_reference_must_resolve_to_observed_source_row` also passes for a missing source record. |
| Observed group/person IDs could contain unknown markers. | `test_observed_group_link_rejects_unknown_marker` and `test_observed_person_link_rejects_unknown_marker`: 2 failed in 0.44s; CLI returned 0. | Same tests: 2 passed in 0.51s after rejecting `unknown`, `unobserved`, and `not_recorded` in observed IDs. |
| JSON accepted duplicate keys and nonstandard numeric constants. | Duplicate-key and NaN/Infinity tests: 2 failed in 0.39s; no duplicate-key error was reported and numeric constants remained pending. | Same tests: 2 passed in 0.99s with duplicate-key detection and rejection of NaN, Infinity, and -Infinity. |
| Date-only values were accepted as `*_at` timestamps. | `test_observation_boundaries_require_clock_time_not_date_only`: 1 failed in 0.26s; date-only boundaries were accepted. | Same test: 1 passed in 0.16s after requiring an hour and minute. |
| CSV parsing tolerated unclosed quotes and short rows. | Unclosed-quote and short-row tests: 2 failed in 0.36s; neither emitted its structural error. | Same tests: 2 passed in 0.24s with strict parsing and pre-normalization row-width checks. |
| A structural pass did not state that cross-visit identity independence was unassessed. | `test_structural_pass_does_not_claim_empirical_validity`: 1 failed in 0.35s with a missing output field. | Same test: 1 passed in 0.14s with `cross_visit_identity_independence: NOT_ASSESSED`; guide and checklist limit the automated claim to visit-level splits. |
