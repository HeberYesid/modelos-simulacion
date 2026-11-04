# Preloaded measured visits and exploratory scenarios

Date: 2026-11-04. Local source and public-profile build verification only; no new
commit, push or deployment was performed.

The application now starts with the Tuesday native audit report and two editable
visit scenarios. Both visits are selectable without uploading files or calling
the import/demo endpoints. Audit selection also selects the measured replay.
Scenario selection preserves edits; the synthetic demo remains available as an
explicit additional scenario. Both build profiles include the measured archive.

| Visit | Station records | Window | Mean cashier arrival gap | Mean cashier window | Mean preparation window |
| --- | ---: | --- | ---: | ---: | ---: |
| Tuesday 2026-10-20 | 119 (61 cashier, 58 delivery) | 16:45:35–18:41:30 | 6436 / 60 s | 4816 / 58 s | 16532 / 58 s |
| Friday 2026-10-23 | 16 (8 cashier, 8 delivery) | 17:20:23–18:21:09 | 3503 / 7 s | 22.5 s | 146 s |

The export verifies field-source hashes and raw fields before invoking the existing
native importer on one reconstructed CSV per visit. Audit line numbers refer to
those reconstructed per-visit CSVs; the measured replay retains original source
IDs and physical line numbers. The Tuesday approved corrections remain already
reflected, with three withdrawals and the six-versus-four preparation overlap.
Original field records and timestamps were not edited.

Scenario means describe elapsed marks, not active work or fitted distributions.
Exponential arrivals, constant service proxies, one person per group, empty initial
state, no abandonment and no transfer delay are explicit exploratory assumptions.
Initial Tuesday waiting work, station links, worker assignments and Friday pause
boundaries are not reconstructed. Simulation windows are observation windows,
not confirmed business opening hours. No empirical validation is claimed.

## Observed verification

- Python: `uv run --frozen --offline pytest -q --tb=short` — 300 passed; one existing
  Starlette/httpx deprecation warning.
- Frontend: `pnpm --dir web test --run` — 132 passed in 28 files.
- TypeScript: `pnpm --dir web typecheck` — passed, including the isolated browser
  configuration. Ruff, mypy and generated API contract checks passed.
- OpenSpec: all seven existing changes passed strict validation.
- Export: `uv run --frozen --offline python scripts/export_observed_visits.py
  --reports-output web/src/replay/visit-import-reports.json --check` — verified
  135 source records and both artifacts.
- Public build: `VITE_PUBLIC_DEMO=true pnpm --dir web build` — passed. The bundle
  is approximately 1.08 MB before gzip (249 KB compressed); Vite emits its chunk
  size warning. No dependencies or size thresholds were changed.
- Public-profile browser workflows: `pnpm --dir web exec playwright test --config
  playwright.visits.config.ts` — five passed. Coverage includes automatic report
  availability, both actual scenario run responses (HTTP 200), edit preservation,
  measured-only replay without simulation requests, context loss/retry, missing
  graphics, and 390-pixel mobile overflow checks. Desktop screenshots were
  inspected; report content appears before measured 3D replay.

Focused test-first evidence: export CLI failed on unsupported `--reports-output`
before implementation, then passed the known 119/16-row and conflict assertions.
The public-profile test first failed because measured visits were excluded, then
passed. New domain/UI modules first failed to import, then passed their literal
worked-example, integrity and rendering assertions. The initial browser workflow
failed because the preloaded visit heading was absent, then passed after startup
wiring. A later test-only timeout was resolved by opening the existing advanced
panel before editing its hidden name field.

The Windows sandbox blocked Vite child processes and pytest temporary-directory
access; installed local runners passed when executed with reviewed escalation.
The separately rejected third-party guidance downloader was not retried or used.
The five browser workflows used an isolated loopback server on port 8013, not
the deployed service. Docker image execution and live-site verification remain
pending for a separately authorized publication.
