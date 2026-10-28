# Plan 002: Record the existing application in incremental atomic commits

## Status and authorization

- Status: EXECUTED LOCALLY on 2026-10-28 following the user's approval. No push, PR or deployment performed. See the [execution record](../docs/verification/incremental-commits-2026-10-28.md).
- Prepared: 2026-10-28, branch `main`, HEAD `bdb7591c65d6ec045b50f32ed2c3a1ff2f266ea6`.
- Scope: organize the existing working-tree content into reviewable local commits after explicit authorization. Remote publication requires separate authorization specifying the destination and branch.
- Category: repository organization. No new application behavior or historical reconstruction.

The sections below retain the approved planning baseline. Execution moved the two existing scripted-demo JSON fixtures into commit 2 because its tests read them, and added scoped `.gitattributes` rules to preserve original bytes. Current authorization covers the seven local commits only; remote publication remains pending.

## Current state and rationale

Git currently tracks only assistant/OpenSpec resources and the original `openspec/config.yaml`. The working tree modifies that configuration and contains almost the entire application as untracked content. A read-only enumeration found 616 readable untracked paths before creating this plan, including 459 OpenSpec paths. Enumeration also warned about six inaccessible pytest directories inside the Spec07 review folder; the inventory is not complete for those directories.

The Python package cannot safely be divided into historical Spec01–07 commits using its current files. `src/boquitas/__init__.py` eagerly imports demand, experiments, exports, metrics, models, observations, scenarios and statistics. Those modules already contain V1 and V2 behavior. For example, `exports.py` imports experiment results and observation models; `experiments.py` imports demand, engine, metrics and scenarios. Keep that dependency closure together without fabricating past versions or weakening tests.

The frontend also couples results and replay: `web/src/replay/host.ts` imports results components and the scene, while `main.ts` wires the complete interface. Keep the current UI and replay together. Atomic means a coherent, verifiable change; it does not require equal-sized commits.

## Preconditions before executing this plan

1. Obtain authorization to create local commits. This plan alone grants none. Preserve the existing branch/history; any new branch or checkout must follow the user's selected workflow.
2. Record a fresh inventory and SHA-256 baseline of source, tests, documents, evidence and lockfiles. Check existing staged changes separately and preserve them. Review changes since the HEAD above, including untracked files: a commit hash alone does not capture this baseline.
3. Prepare an explicit path manifest for each commit. Each eligible file must have exactly one owner. Record intentional exclusions. Do not use blanket staging such as `git add .` or `git add -A`.
4. Inspect the six `openspec/changes/boquitas-07-preparation-interruptions/review/pytest-*` directories before classifying them. Do not include unreadable directories or delete them based on their names. Preserve actual historical evidence and its paths.
5. Review candidate text, JSON, manifests, observation fixtures and Word documents for credentials, personal information and local absolute paths before eventual publication. Record locations and decisions without copying sensitive values into logs. Do not rewrite source observations, historical hashes or evidence to make publication easier. If something cannot be published intact, retain it locally and resolve its publication treatment before push.
6. Exclude installed environments, dependency caches, `.tmp/`, bytecode, generated `web/dist/`, ordinary test output and browser traces unless an artifact is explicitly classified as retained evidence. Existing `.gitignore` excludes `docs/audit-remediation-2026-10-24/playwright-results/`, which contains retained evidence: preserve it locally and make an explicit per-file publication decision, rather than assuming ignored means disposable or automatically force-adding it.

## Commit sequence

All messages use Conventional Commits, in English, without attribution trailers. Dependencies are sequential unless stated otherwise. Add each behavior's existing tests in the same commit as its implementation. Do not manufacture RED/GREEN history for code already implemented.

### 1. `chore(repo): define generated-file exclusions`

Include only the root `.gitignore` and `web/.gitignore`, with any narrowly scoped adjustments justified by the reviewed inventory. Existing assistant resources remain untouched.

Gate: read back the exclusions and inspect the explicit candidate file list. Confirm code, lockfiles, fixtures and retained evidence have the intended treatment. No runtime test is needed.

### 2. `feat(simulation): add versioned engine and experiment APIs`

Include:

- `pyproject.toml`, `uv.lock`, `.python-version`.
- Every current `src/boquitas/*.py` file except `api.py`, `api_models.py` and `__main__.py`.
- `tests/test_demand.py`, `test_experiments.py`, `test_exports.py`, `test_metrics.py`, `test_observation_import.py`, `test_scenarios.py`, `test_simulation_engine.py`, `test_statistics.py`.
- `tests/test_interruption_contracts.py`, `test_interruption_engine.py`, `test_interruption_experiments.py`, `test_interruption_exports.py`, `test_interruption_metrics.py`.
- `tests/fixtures/observation-import/`, including its source manifest, after publication review.

This is the smallest current package-level dependency closure: engine, observations, experiments, metrics, statistics and serialization, including current V1/V2 contracts. Do not split files or alter exports solely to create smaller commits.

Gate: frozen dependency installation in the candidate checkout, public package import, all 13 included Python test modules, Ruff on included source/tests, and mypy on `src/boquitas`. No API, launcher or empirical-readiness tests should be present yet.

### 3. `feat(api): expose local simulation and versioned file contracts`

Include:

- `src/boquitas/api.py`, `api_models.py`, `__main__.py`.
- `scripts/export_web_contracts.py`.
- `tests/test_api.py`, `test_interruption_api.py`, `test_interruption_api_diagnostics.py`, `test_interruption_review.py`, `test_large_result_reopen.py`.
- `tests/fixtures/api-static/`.
- All `web/contracts/` files, including deterministic fixtures, and `web/src/api/schema.d.ts`.

Gate: all Python tests available through this commit, Ruff, mypy and the Python contract-export check. The TypeScript generated-schema check becomes runnable with the frontend tooling in commit 4. Verify the API can serve the test static fixture; production UI is supplied later.

### 4. `feat(web): add scenario workflows and trace-driven replay`

Include all remaining frontend source, styles, HTML, package configuration, `web/pnpm-lock.yaml`, build/type/test configuration, contract-check tooling, unit tests and browser test source under `web/`. Exclude `web/README.md` until commit 7 and exclude all generated/install/test-output directories. Contract fixtures/schema already belong to commit 3.

Include the current complete UI and 3D replay together; do not invent an earlier non-3D UI. Keep `playwright.release.config.ts`, `tsconfig.release.json`, `playwright.audit.config.ts`, `tsconfig.audit.json` and their test source together with their dependencies. Existing release tests are introduced here; execute the production suite after the launcher is introduced in commit 5.

Gate: frontend unit tests, TypeScript checks, both contract checks, production build and development browser suite. Check actual browser workflows and WebGL fallback using the existing acceptance scope. Generated production assets remain ignored.

### 5. `feat(delivery): add the Windows local launcher`

Include `start-boquitas.ps1` and `tests/test_launcher.py` together.

Gate: launcher tests on Windows with port 8000 free, all currently available Python tests, and the production browser suite against the built application started with `-NoBrowser`. Stop the launched service afterward. Do not treat skipped Windows tests as passing launcher verification.

### 6. `feat(research): add empirical-readiness checks and templates`

Include `scripts/check_empirical_readiness.py`, `tests/test_empirical_readiness.py` and all `docs/field-kit/templates/` files together. The test reads `analysis_plan.json` and other templates from that exact directory; omitting the templates breaks the commit.

Gate: the empirical-readiness test module, then the complete Python suite, Ruff and mypy. Header-only templates are intentionally incomplete; do not populate them with invented field data or interpret a structural check as empirical validation.

### 7. `docs(project): preserve specifications evidence and operating guides`

Include the remaining reviewed documentation and evidence as a connected documentation set:

- `README.md`, `AGENTS.md`, `web/README.md`.
- The existing modifications to `openspec/config.yaml`, `openspec/README.md` and eligible files under `openspec/changes/`, preserving proposal/design/spec/tasks/reports and the source snapshots required by retained manifests.
- Remaining `docs/` files: user/technical guides, compatibility entries, navigation, academic Word document and provenance, field-kit guidance/existing-visit evidence, validation protocol, findings, acceptance/audit records and the organization/cleanup record.
- `plans/` proposals, comparison, evidence, verification, this plan and its index entry.

This documentation set is larger because its guides, requirements, reports and provenance cross-reference one another. Keeping it together avoids publishing broken navigation or acceptance reports detached from their evidence. If a smaller split is desired, derive a link/dependency manifest first and split only closed subsets; do not separate a document from the evidence or source snapshots it requires.

Do not stage `.tmp/README.md`; `.tmp/` is intentionally local. The cleanup itself has no deletion diff because the deleted root temporaries were never tracked. Record it through the existing organization report, without creating a fictitious cleanup commit.

Gate: local documentation-link checks, original-file hash checks for retained evidence/Word artifacts, manifest-target review, full current verification, and strict validation of existing OpenSpec change packages. Do not synchronize or archive OpenSpec as part of committing its existing files. Recorded historical test counts remain historical, not fresh results.

## Verification commands for later execution

Run from the root of the candidate checkout. These commands come from project configuration and guides; they have not been executed for this planning task.

```powershell
uv --cache-dir .uv-cache sync --frozen
uv --cache-dir .uv-cache run --frozen python -c "import boquitas"
uv --cache-dir .uv-cache run --frozen pytest
uv --cache-dir .uv-cache run --frozen ruff check .
uv --cache-dir .uv-cache run --frozen mypy src/boquitas
uv --cache-dir .uv-cache run --frozen python scripts/export_web_contracts.py --check
pnpm --dir web install --frozen-lockfile
pnpm --dir web contracts:check
pnpm --dir web test --run
pnpm --dir web typecheck
pnpm --dir web build
pnpm --dir web test:e2e
pnpm --dir web exec tsc --noEmit -p tsconfig.release.json
pnpm --dir web exec tsc --noEmit -p tsconfig.audit.json
openspec validate --changes --strict --no-interactive
```

For commit 2, `pytest` must discover only the 13 included modules in the candidate snapshot. For commit 3, add its five test modules; commit 5 adds launcher tests and commit 6 completes the suite. Select only applicable checks before their tooling/files exist. Successful checks require exit code 0 and actual passing results; record skips and limitations explicitly.

For production acceptance, start `.\start-boquitas.ps1 -NoBrowser` in a separate terminal and then run:

```powershell
pnpm --dir web exec playwright test --config playwright.release.config.ts
```

## Candidate isolation, review and completion

1. For each step, stage only its manifest after local-commit authorization. Inspect `git diff --cached --name-status`, `git diff --cached --stat`, `git diff --cached --check` and the full staged diff. Include untracked files in the review; ordinary unstaged `git diff` does not show them.
2. Validate an isolated candidate tree containing only the previous commit and that step's selected files. Do not validate solely in the current full working tree: later untracked modules, templates or assets could hide missing dependencies. A separate temporary local checkout can be used once execution is authorized; keep the user's working tree intact.
3. Use only frozen lockfile installations. Do not regenerate fixtures, weaken assertions, modify domain behavior, rewrite historical evidence or disable checks to make a candidate pass. If a dependency is missing, revise the path manifest and retest the candidate before committing.
4. Create the local commit only after its applicable checks and staged-diff review pass. Do not amend existing user commits or change their authorship/date. Keep normal current commit dates; this sequence records today's application snapshot, not a fabricated development chronology.
5. At completion, confirm every eligible initial file has an owner, every exclusion has a reason, the application/evidence hashes match the baseline except separately approved changes, and all seven commits are locally inspectable. A working tree may retain explicitly excluded local artifacts; no eligible file should be silently omitted.
6. Prepare a short review summary containing commit hashes, scopes, actual checks and pending publication decisions. STOP before push. Do not discover/reuse remote sessions, fetch, push, create a PR or deploy under this plan's current authorization.

## Stop conditions

- A candidate requires code changes, new behavior, a weakened test or a dependency/fixture update beyond pure packaging.
- Source/Word/evidence content differs from the approved baseline, or a required evidence artifact is inaccessible or missing.
- A proposed file contains material unsuitable for publication and its treatment is undecided.
- Required runners cannot execute, a check fails, or an intermediate snapshot depends on a later commit.
- Remote destination, target branch, visibility or authorization is unknown when publication is requested. Resolve then; planning does not require remote access now.
