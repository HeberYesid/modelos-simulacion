Implementation authorized on 2026-10-24: after approving the proposal and planning package, the user explicitly approved Spec07 implementation in bounded Luna blocks with main-agent review and preservation of version 1. Check tasks only after independently observed evidence. The main agent owns orchestration/review; implementation follows the repository's delegation and [selective TDD policy](../../README.md#selective-tdd-policy). Preserve existing work, the baseline 37 tests and all subsequent coverage; never fabricate RED/GREEN evidence. A missing required runner pauses affected implementation.

Requirement IDs refer to [preparation-interruptions](specs/preparation-interruptions/spec.md); use the solved examples and version matrix in [design.md](design.md). Each task requires observed public-boundary evidence, not private-method assertions or structural validation alone.

## 1. Versioned contracts and execution baseline

- [x] 1.1 After implementation authorization, record a fresh working-tree/source/reference baseline, confirm required runners, and verify legacy regular/Tuesday behavior through existing public tests without modifying inputs to manufacture a failure (INT-01, INT-18).
- [x] 1.2 Test-first the version-2 configuration and immutable script validation, including empty scripts, explicit times/IDs, incompatible modes/capacities, duplicate/nonfinite/boolean times and excluded-at-H references; implement field-level diagnostics while preserving version-1 defaults (INT-01, INT-02).
- [x] 1.3 Define typed version-2 config/scenario/trace/metric/run/experiment payloads and their discriminated compatibility rules, including a mixed version-1 reference/version-2 candidate experiment; verify inconsistent versions fail and legacy models remain valid (INT-10, INT-13, INT-14).
- [x] 1.4 Define the public pause/resume event data and internal remaining-work/resume-obligation states with focused contract tests; retain legacy-valid initial states and reject new initially paused/independent paid-queue snapshots (INT-04, INT-09, INT-10).

## 2. Scripted pause cashier and resume transitions

- [x] 2.1 Observe a failing public test for the core INT-04 timeline, implement coordinator pause/deadline removal/payment/resume, and verify A delivers at 14 and B at 17 with one initial preparation start and no stale delivery at 12 (INT-04, INT-05, INT-10).
- [x] 2.2 Test-first paid regular preparation FIFO, resumption precedence and the repeated-interruption oracle; verify A/B/C deliveries at 15/18/19, no auto-trigger at arrival and no nested reservation (INT-02, INT-05).
- [x] 2.3 Test-first the interrupting payment's external confirmation; verify active payment at 5–7, reserved inactivity at 7–10, resumption at 10 and final deliveries at 17/20 (INT-06).
- [x] 2.4 Test-first dynamic applicability errors for FIFO violations, wrong/completed/abandoned/already-paid targets, an occupied non-preparation worker, nested attempts and dangling entries; retain structured indexed failures with no accepted partial run (INT-03).
- [x] 2.5 Test-first deterministic exact-time ordering, completion-versus-script conflict and zero-duration payment/confirmation; verify a valid timestamp settles once, with no duplicate events or infinite loop (INT-07).

## 3. Remaining-work and lifecycle boundaries

- [x] 3.1 Test-first preservation of positive `5e-10` residual preparation and repeated progress accounting; verify no epsilon erases work and all paused deadlines are inactive (INT-04).
- [x] 3.2 Test-first pre-payment patience expiry and service at the exact scripted deadline; verify abandoned targets are not served and exact-deadline service wins once (INT-08).
- [x] 3.3 Test-first the H=4 drain oracle with B arriving at 3 and a valid script at 5; verify deliveries at 14/17, admission only before H, unchanged window length and explicit failure for an unconsumed script (INT-03, INT-08).
- [x] 3.4 Test-first interrupted initial residual preparation and shared multi-person orders; verify residual segments 0–2/3–11, one workload/payment/delivery per order and unknown historical starts retained (INT-09, INT-10).

## 4. Metrics and resource accounting

- [x] 4.1 Test-first active/paused/elapsed preparation seconds and pause count using the core, confirmation and repeated-pause oracles; verify the first start is not overwritten and full observed elapsed equals active plus paused (INT-11).
- [x] 4.2 Test-first the version-2 paid regular queue and single-worker utilization projection; verify core paid queue mean 0.35 and active utilization 0.85, with no paused-order double count and confirmation reservation distinct from activity (INT-12).
- [x] 4.3 Verify order/person weighting, initialized/new cohorts, unknown initial full history, window clipping and post-H completion metrics; preserve version-1 regular preparation-queue unavailability instead of changing it to an invented zero (INT-08, INT-09, INT-11, INT-12).

## 5. Experiments API and portable results

- [x] 5.1 Test-first script validation against each generated tape, matched demand when only scheduling changes, mixed-version reference/candidate selection and retention of indexed failed replications/denominators; never fit or retime a script to a random tape (INT-14).
- [x] 5.2 Add meaningful version-2 JSON round-trip/reopen and CSV checks preserving scripts, events, units, active/paused metrics and assumptions; verify legacy files and scientific reference bytes remain unchanged (INT-13).
- [x] 5.3 Extend typed API validation and saved-file operations for supported version unions and indexed script errors, reusing existing routes/error transport; verify unsupported/inconsistent versions and infeasible runs are not accepted (INT-03, INT-13).
- [x] 5.4 Regenerate API/TypeScript contracts through the existing exporter/generator, add version-2 fixtures without rewriting the version-1 reference, and run contract drift/type checks (INT-13, INT-18).

## 6. Editing results and authoritative replay

- [x] 6.1 Add script/policy editing with Spanish assumption/capacity explanations; verify valid load/edit/save round trips retain entries, incompatible drafts are diagnosed without silent deletion and current demos remain off/version 1 (INT-15).
- [x] 6.2 Add pause/resume timeline labels, active/paused/elapsed metrics and non-3D inspection/export; verify edited drafts and immutable completed results remain distinguishable, with explicit unavailable states (INT-11, INT-13, INT-15, INT-16).
- [x] 6.3 Test-first version-2 replay projection at core times 6 and 8 and repeated seeks; implement the same-worker pause/cashier/resume scene and verify legacy projection, playback speed and history preservation (INT-10, INT-16).
- [x] 6.4 Exercise focused real-browser workflows for schedule editing, core execution, JSON/CSV download, reopen without rerunning, seeking and graphics fallback; observe paused/reserved/active states and retain actual visual evidence rather than only projector assertions (INT-13, INT-15, INT-16, INT-18).

## 7. Documentation and independent acceptance

- [x] 7.1 Update English technical and Spanish user guidance with policy/version limits, entry diagnostics, explicit-script provenance and unknown real active/pause parameters; retain observed sources and avoid calibration/empirical-validation claims (INT-17, INT-18).
- [x] 7.2 Run the applicable full Python suite, Ruff, mypy and API export drift checks; preserve all legacy tests/reference hashes and record actual results, failures or pending checks (INT-01, INT-13, INT-18).
- [x] 7.3 Run frontend unit/type/build/contract checks, existing browser workflows and production acceptance with actual graphical pause/resume inspection; record any unavailable check as pending, not as passing (INT-13, INT-15, INT-16, INT-18).
- [x] 7.4 Main agent independently reviews the final diff, requirement/scenario evidence, all solved timelines and unchanged observation/reference hashes; produce a concise implementation acceptance report only after actual checks. Do not synchronize/archive, commit, push, create a PR or deploy without separate authorization (INT-01–INT-18).

## Verification commands

Engineering acceptance on 2026-10-24 completed all 28 tasks. See [the independent verification report](verification-report.md) for actual commands, results, preservation checks and limitations. The original planning and bounded implementation evidence remain historical. Run these commands from the repository root with the existing locked environment when rechecking later changes.

```powershell
uv --cache-dir .uv-cache run --frozen --offline pytest
uv --cache-dir .uv-cache run --frozen --offline ruff check .
uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas
uv --cache-dir .uv-cache run --frozen --offline python scripts/export_web_contracts.py --check
pnpm --dir web contracts:check
pnpm --dir web test --run
pnpm --dir web typecheck
pnpm --dir web exec tsc --noEmit -p tsconfig.release.json
pnpm --dir web build
pnpm --dir web test:e2e
# With the production application already running in a separate console:
pnpm --dir web exec playwright test --config playwright.release.config.ts
openspec validate --changes --strict --no-interactive
git diff --check
```

Observe a relevant failing public-behavior test before implementing uncovered critical rules/calculations/data-integrity behavior. Existing passing coverage is retained and no RED is invented for prose or ordinary wiring. Tests/validation do not substitute for actual saved-file workflows or visual inspection. Check a task only when its evidence exists and the work is within the explicit implementation authorization.
