## Context

Depends on 01 vocabulary and the [shared baseline](../../README.md). The observations concern station-local orders/payment attempts. They cannot reconstruct the motor's person-linked complete order tape. The original and corrected files are read-only evidence, and corrections must remain auditable.

## Goals / Non-Goals

**Goals:** reliable UTF-8 import, an immutable raw view, a separate included/corrected view, field-level diagnostics and conservative descriptive statistics.

**Non-Goals:** Excel/OCR support, automatic fitting, cross-station joining, occupancy estimation, source editing and filling unknown people counts.

## Decisions

### Public boundary and input

`import_observations(content: bytes, source_name: str, correction_policy: str = 'none') -> ImportReport`. Supported policies are `none` and `boquitas-2026-10-20-v1`. Input content is supplied explicitly; the API will not accept arbitrary server paths. Use standard-library CSV/date/hash tools rather than a dataframe dependency. Decode UTF-8 with optional BOM; report unsupported encoding instead of guessing a lossy conversion.

Recognize exactly `lugar,fecha,tipo_dia,personal,id,hora_llegada,hora_inicio,hora_fin,hora_se_fue`. Accept `caja` and `entrega`; require ISO date, positive integer `personal`, nonempty local ID, and `HH:MM:SS` for supplied times. Empty optional time fields are null. Strip a message prefix only when it precedes the exact recognized header; do not treat arbitrary text as a valid row. Track physical line numbers through prefixes, blank lines and repeated headers. Unknown headers or malformed CSV create diagnostics, not silent coercion.

### Result contract

`ImportReport` has `contract_version=1`, source name and SHA-256, policy and policy status, `raw_rows`, `normalized_rows`, `excluded_rows`, `corrections`, `issues` and station summaries. Each row stores original string fields, typed nullable values, `station`, `date`, `local_id`, qualified key, line number, validity flags and outcome (`served`, `withdrawn`, `incomplete`, `invalid`). Excluded approved observations remain represented in `excluded_rows`, not deleted from provenance.

An issue has `{code, severity, row_keys, line_numbers, fields, message}`. Severity is `error`, `warning` or `information`. Row errors allow the report to continue and exclude the affected values from summaries. Missing required header, unsupported encoding and correction-profile mismatch are fatal import validation errors with no accepted normalized view; the caller still receives actionable diagnostics. Multiple dates are kept separate; do not roll an end time into the next day without an explicit source date.

### Correction profile

During implementation, capture canonical row fingerprints of the exact original and corrected reference into a versioned correction manifest. Canonicalization preserves field values and row order but ignores BOM, message labels, blank lines and repeated headers. Retain file hashes separately. This permits harmless wrapper differences while refusing unapproved edits under the same profile.

For the original fingerprint, update only cashier `(2026-10-20,caja,35).hora_fin` from `17:45:20` to `17:46:20` and exclude only `(2026-10-20,entrega,26)` with the recorded human-error reason. Each applied action stores before, after, row reference, reason and profile. For the corrected fingerprint, report `already_reflected`; do not invent absent delivery 26 raw content or claim to have observed the original cashier value in that upload. Other datasets can still use policy `none` and normal diagnostics. Sources are never written.

### Validation and safe summaries

Require supplied times to follow arrival <= start <= end for served rows and arrival <= departure for withdrawals. Service times together with a withdrawal are contradictory. Partial time sets are incomplete. Duplicate qualified keys are errors; retain all conflicting rows but exclude those keys from numerical summaries. Zero observed service duration is a warning and ineligible as a future positive service parameter, not automatic proof of an error. Qualify every duration by station/unit and report n used/excluded.

For comparable valid rows compute observed station wait (`start-arrival`) and observed interval (`end-start`) in seconds, with count/min/mean/max and completeness information. These are descriptive only. Use a sweep-line with end processed before start at equal times to compute concurrency. Delivery capacity is the reported staff value only when consistent within the observation segment; mixed values produce a diagnostic instead of inventing a constant. Cashier overlap is information about transaction windows, never active-resource utilization.

No `OrderInput` output is produced. An explicit later calibration change with new evidence would be required to bridge observations into parameter estimates.

## Risks / Trade-offs

- Source wrappers can vary -> canonical row fingerprint and physical-line provenance.
- Corrected data cannot recreate missing raw evidence -> report already-reflected corrections without fabricated rows.
- Misleading person counts -> display unknown group size for served and withdrawn attempts.
- Consistency conflicts do not identify which row is wrong -> report affected intervals without automatic repair.

## Migration Plan

Add the adapter and read-only regression fixtures during implementation. Confirm the existing evidence file hashes are unchanged before/after tests. No database or source migration.

## Open Questions

No software-blocking questions. Actual worker IDs, station links, group sizes, active payment intervention and reasons for the delivery overlaps remain unobserved.
