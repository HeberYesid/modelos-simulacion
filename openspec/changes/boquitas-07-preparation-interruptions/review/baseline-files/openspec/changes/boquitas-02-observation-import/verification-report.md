# Spec02 independent verification report

Date: 2026-10-22. Implementer: GPT-6 Luna, max effort. Reviewer: main agent. Scope: `boquitas-02-observation-import` only, authorized after the user's explicit approval of spec01.

## Acceptance status

Engineering verification passed for OBS-01 through OBS-07. All 11 engineering tasks are complete, including independent source review and actual checks. User approval of spec02 remains pending; spec03 has not started. No synchronization, archive, commit, push, PR or deployment was performed.

The public boundary is `import_observations(content: bytes, source_name: str, correction_policy: str = 'none') -> ImportReport`. It returns a versioned, immutable report containing raw and normalized observations, explicit corrections/exclusions, quality diagnostics and descriptive station/date summaries. It neither writes source data nor creates simulation inputs or fitted parameters.

## Reviewed change

- Added `src/boquitas/observation_import.py` and its public exports in `src/boquitas/__init__.py`.
- Added `tests/test_observation_import.py`, byte-exact original/reference fixtures and a versioned `tests/fixtures/observation-import/source-manifest.json`.
- Updated spec02 task status and recorded [selective TDD evidence](tdd-evidence.md).
- Updated the shared README and config to record spec01 approval, the current spec02 authorization and the approval gate before spec03.

The repository already had extensive uncommitted and untracked work. Review included direct reading of new files, not only `git diff`, which does not include untracked contents. The existing engine, models, its 37 tests, dependency/tooling files and all 20 artifacts of changes03-06 were compared with pre-implementation SHA-256 snapshots: all 27 protected files were unchanged. No pre-existing work was reverted or committed.

## Independently executed checks

Environment: Windows, project Python 3.13 environment and existing lockfile. Commands used the project-local `.uv-cache` through `UV_CACHE_DIR`.

| Check | Observed result |
| --- | --- |
| Baseline `uv run --frozen --offline pytest -q` | 37 passed before implementation |
| Final `uv run --frozen --offline pytest -q` | Exit 0; 61 passed in 0.50s: 37 original plus 24 importer tests |
| `uv run --frozen --offline ruff check .` | Exit 0; all checks passed |
| `uv run --frozen --offline mypy src/boquitas` | Exit 0; no issues in 4 source files |
| `openspec validate --changes --strict --no-interactive --json` | Exit 0; all 6 changes valid, no issues |
| `git diff --check` | Exit 0; no whitespace errors; existing LF/CRLF conversion notice |
| Source and protected-file SHA-256 comparisons | Original/reference and all 27 protected files unchanged |

There are no pending required executable checks. OpenSpec validation checks planning structure; it does not establish runtime or visual correctness. No API, browser or graphics implementation belongs to this change, so no visual QA is claimed.

## Requirement and evidence map

| Requirement | Reviewed and independently checked behavior |
| --- | --- |
| OBS-01 | Original input accounts for 120 rows, 61 caja and 59 entrega; BOM, repeated/prefixed headers and physical lines preserved; bad encoding, headers, malformed lines and unexpected preambles have actionable diagnostics and retained provenance |
| OBS-02 | Named profile produces 119 included rows, changes only caja35 end time and excludes entrega26; originals remain accessible; corrected input is `already_reflected` without a fabricated missing row; changed values/order or added malformed content are rejected under the profile |
| OBS-03 | Date/station/local-ID keys distinguish station records; no cross-station join, inferred people count or end-to-end person duration; group size is null with `not_observed` |
| OBS-04 | Caja16/19/49 remain withdrawals with unknown group sizes and causes and no service duration; incomplete times remain null and completeness is retained |
| OBS-05 | Strict dates/clocks, impossible chronology including partial rows, contradictory outcomes, duplicate keys and zero-length intervals have diagnostics; invalid and duplicate rows remain visible and are excluded from summaries; zero duration is a warning rather than automatic invalidation |
| OBS-06 | Half-open sweep handles ties and empty intervals; comparable incomplete intervals participate; summaries remain separate by station/date; six delivery intervals at 17:00:10 identify IDs6-11 against reported staff4; mixed staff prevents an asserted constant capacity; cashier overlap is information about transaction windows |
| OBS-07 | Counts, seconds, min/mean/max, per-metric eligibility and exact excluded row references are exposed; valid pairs from incomplete rows contribute only to the corresponding metric; errors/duplicates are excluded; JSON round trip preserves the report |

## Independent numerical and boundary probes

The reviewer calculated reference totals separately using standard-library CSV and direct clock arithmetic before inspecting the importer's summaries. The importer then matched these literal totals:

| Corrected station | Rows | Eligible waits/intervals | Wait total (seconds) | Interval total (seconds) |
| --- | ---: | ---: | ---: | ---: |
| Caja | 61 | 58 / 58 | 6353 | 4816 |
| Entrega | 58 | 58 / 58 | 1331 | 16532 |

- Five profile probes: original and BOM/blank-line wrapper variants accepted; changed data, extra unapproved text and reordered rows rejected with no accepted normalized view.
- Corrected reference retained 119 raw/included rows and matched the original-with-profile summaries. The six delivery row identities at 17:00:10 were verified independently.
- Empty `[t,t)` intervals and touching `[a,b)`, `[b,c)` intervals did not create overlap; identical local IDs on different dates remained separate.
- A manual partial-row example produced wait total40 over2 rows, interval total40 over2 rows, exact complementary exclusions and delivery peak2. Missing values stayed null and the rows stayed incomplete.
- `ImportReport.model_validate_json(report.model_dump_json()) == report` passed.
- Independently reproduced chronology and oversized-integer failures were rerun after correction and passed.

## Review findings addressed

1. Available negative time pairs were ignored when a third time was missing. Focused regressions now cover start-before-arrival and end-before-start in incomplete rows.
2. A 4400-digit staff value raised `ValueError`. It now returns a retained invalid row and `invalid_reported_staff` diagnostic.
3. Metric exclusions originally identified counts/reasons only. Each duration summary now identifies the excluded row key, physical line and reason.
4. Valid measured pairs and intervals from incomplete rows were initially omitted. Per-metric summaries and the overlap sweep now use the comparable known times without inventing missing times.
5. End-before-arrival with a missing service start was initially undiagnosed. A separate regression now verifies `end_before_arrival`.

The implementer also fixed pre-header provenance loss through an observed failing test. Selected RED/GREEN cycles and tests that passed against existing generalized behavior are distinguished in `tdd-evidence.md`; the review does not relabel acceptance checks as test-first development. One intermediate reviewer probe ran during an unfinished edit and saw a temporary undefined helper; completed-product probes and the final suite were subsequently rerun successfully.

## Source integrity and limits

Original SHA-256: `845f8c6e56a7af120754ab0a5a789f318b65214e11f91737fd25032b7e51573d`.

Corrected-reference SHA-256: `480ade881fd14bc88d8c94f037cea9ef4c2869b7ba400cbffda772f6f470caea`.

Both match the before-implementation values and the copied fixtures. Canonical fingerprints ignore approved wrappers while retaining field values and row order. Source files were read only.

The adapter targets the agreed observation text layout with one record per physical line; quoted multiline fields receive malformed-input diagnostics. Spreadsheet/OCR support is outside this change. Counts describe station observations/order attempts, not observed people. Descriptive intervals and conflicts do not establish active resource utilization, worker assignments, calibrated parameters or empirical validity of the simulation. The six-over-four delivery conflict remains visible and unresolved as field evidence.
