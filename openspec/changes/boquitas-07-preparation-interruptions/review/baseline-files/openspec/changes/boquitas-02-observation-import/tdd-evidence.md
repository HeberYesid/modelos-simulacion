# Selective TDD evidence

Tests exercise the public `import_observations` API with immutable source fixtures or explicit in-memory CSV examples. RED records below are failures observed before the corresponding behavior change; later integration assertions are identified separately.

| Behavior | Observed RED | GREEN |
| --- | --- | --- |
| Public import and original source | The first focused pytest collection failed with `ImportError: cannot import name 'import_observations'`. | The original-file correction example passed after adding the public API and parser. |
| Preamble provenance | The preamble example returned the first observation instead of retaining the unrecognized pre-header row (`5 passed, 1 failed, 1 passed`). | The row is now retained as invalid with its physical line and issue; the focused import suite reported 7 passed. |
| Chronology and correction recomputation | An end-before-start row was returned as `served`; a later correction probe found the cashier-35 included interval still at 0 seconds instead of 60. | The row is invalid with a field diagnostic and signed duration; raw cashier-35 remains 0 seconds while the corrected view is 60 seconds. |
| Duplicate identities | The duplicate-key example left both same-station/date occurrences served. | Both rows are invalidated and individually listed in the interval metric exclusions; other stations and dates remain distinct. |
| Partial chronology and oversized integer | Partial arrival/start and start/end pairs were not checked; a 4,400-digit staff value raised Python's integer-conversion `ValueError`. | Each supplied time pair is checked; an unparseable staff count becomes a row diagnostic. The two focused regressions pass. |
| Half-open concurrency | Both sweep examples failed because the public report had no station summaries. | The delivery report identifies six active rows at 17:00:10; equal-time end/start boundaries and empty intervals do not create phantom overlap. |
| Exclusion provenance | A duplicate-summary assertion failed because duration metrics exposed only a count, with no row references. | Each metric includes excluded row key, physical line and reason; literal station denominators pass. |
| Partial measures and end-before-arrival | Incomplete rows with a valid wait or interval were omitted, and a known end before arrival with no start was classified as incomplete. | Available error-free pairs contribute only to their own metrics and overlap sweep; the impossible end-before-arrival row is invalid. |

The idempotence/mismatch examples, strict formats, withdrawal outcomes, capacity segmentation, zero-duration warning, fixture hashes, literal source summaries and serialization were added as block acceptance coverage. They are not described as test-first cycles when their behavior already existed.

The final local checks after these slices were `uv run --frozen --offline pytest -q` (61 passed), `uv run --frozen --offline ruff check .` (all checks passed), and `uv run --frozen --offline mypy src/boquitas` (no issues in 4 files). At implementer handoff, main-agent acceptance task 4.1 remained unchecked. The subsequent [independent review](verification-report.md) reran those checks, reviewed the final source and completed task 4.1. User approval before spec03 remains pending.
