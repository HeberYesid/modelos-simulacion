# GitHub publication verification — 2026-10-30

The user authorized reviewing the pending work, running the checks, and committing
and pushing it if verification succeeds. The starting local and remote `main`
were both `295c9c72188e12ccfc3ea9c390131f7ad1bd4106`. The initial working tree had
33 modified tracked files and 125 untracked files, with no staged changes.

## Review and scope

- Reviewed the pending engine/API execution limits, cancellation, scheduled
  arrivals, menu metadata, resource totals, generated contracts, scenario editor,
  result analysis, queue references, theme and simulated/measured replay changes.
- Verified the measured replay export against its original sources: 135 records.
  The browser bundle contains station records and source hashes, without absolute
  source paths, credentials or retrospective conversation statements.
- Scanned pending text files for common private-key and access-token signatures;
  no matches were found. This is a focused publication check, not a security audit.
- Retained existing reports and curated screenshots. Excluded per-run browser
  `.last-run.json` metadata through `.gitignore`; caches, builds, portable bundles
  and new runner output remain local.

## Fresh verification

| Check | Observed result |
| --- | --- |
| `uv --cache-dir .uv-cache run --frozen --offline pytest --basetemp .tmp/github-final-python-20261030` | 299 passed, no failures or skips; existing FastAPI TestClient deprecation warning. |
| `uv --cache-dir .uv-cache run --frozen --offline ruff check .` | Passed; restricted traversal warned about an inaccessible temporary directory. A focused `ruff check src tests scripts` also passed without that warning. |
| `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas` | Passed, 17 source files. |
| `uv --cache-dir .uv-cache run --frozen --offline python scripts/export_web_contracts.py --check` | All 8 generated files match. |
| `uv --cache-dir .uv-cache run --frozen --offline python scripts/export_observed_visits.py --check` | 135 original source records and browser export verified. |
| `pnpm.cmd --dir web test --run` | 122 passed across 25 files. |
| `pnpm.cmd --dir web typecheck` | Passed. |
| `pnpm.cmd --dir web exec tsc --noEmit -p tsconfig.release.json` | Passed again after the release-harness corrections. |
| `pnpm.cmd --dir web contracts:check` | Generated OpenAPI types match. |
| `pnpm.cmd --dir web build` | Passed; existing main-chunk size advisory (897.55 kB before gzip). |
| `pnpm.cmd --dir web test:e2e --workers=1 --output=../.tmp/github-publication-e2e` | 49 passed, no failures. |
| `pnpm.cmd --dir web exec playwright test --config playwright.release.config.ts --output=../.tmp/github-publication-release-final` | All 6 compiled-app acceptance tests passed in 33.5 seconds after the harness corrections, with external HTTP(S) attempts blocked and asserted absent. |
| `openspec validate --changes --strict --no-interactive` | All 7 existing packages passed. |

Initial restricted test attempts encountered temporary-directory permissions and
Node process-spawning restrictions. Approved local process permissions resolved
those restrictions. A verified existing Boquitas server occupied port 8000 and
prevented two launcher checks; temporarily stopping it allowed all three launcher
tests and then the complete 299-test suite to pass. The local server was restored.

## Release-harness findings

The initial compiled-app acceptance run passed 4 tests and failed 2. The full JSON
reference predates the approved payment simplification and per-pool resource-total
correction. An exact recursive comparison found only the payment-method metadata,
two explanatory assumptions, the zero-confirmation scenario setting and corrected
cashier/inactive-integrated totals and their derived summary fractions. The other
test tried to edit the removed transfer-confirmation control.

The runner also wrote new artifacts into its historical OpenSpec review folder.
Those files were clean at the task baseline: the newly generated output was first
preserved under `.tmp/github-release-generated-before-restore/`, then only those
15 overwritten historical files were restored. The historical reference remains
unchanged. Release checks must use isolated per-run output for future evidence.

The corrected harness strictly reads both fixed references, verifies their full
SHA-256 values, and compares the current full JSON with an explicit transformation
of the historical result. Pool totals use the unchanged historical component
seconds; the demand-tape sum independently cross-checks cashier time within
floating-point precision. Historical events and simulation times remain exact.
The current fixture is `web/contracts/fixtures/release-reproducibility-v2.json`
(reference format version 2, with a version-1 simulation contract). Tests never
create a passing reference automatically.

The replay acceptance now opens the existing saved legacy transfer fixture and
checks its pending confirmation/reserved worker. New transfer runs separately
require zero confirmation wait, the transfer payment method and no obsolete
confirmation editor. Screenshots, downloads and network audits use per-test
output paths. The release configuration defaults to ignored
`.tmp/release-playwright-results`, preserving the historical review directory.
The staged whitespace review also removed one extra final blank line from each
of two new test files; all non-newline bytes and test statements were preserved.

## Runtime review and limits

Inspected fresh desktop measured-replay and mobile observation-import screenshots
from the full browser run, and opened the compiled local editor in an isolated
browser session. Existing theme, cancellation, JSON/CSV, legacy transfer, menu,
camera, context-loss and measured-playback cases passed in the full E2E suite.

This publication concerns source code, tests and documentation. Portable EXE/ZIP
packages were not rebuilt; deployment, empirical calibration, business validation,
target-hardware certification and OpenSpec synchronization/archiving are outside
this task.
