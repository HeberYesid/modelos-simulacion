# Boquitas project instructions

## Scope and coordination

- Read `openspec/config.yaml`, `openspec/README.md` and the active change's proposal, requirements, design and tasks before work.
- Implement only the change the user has authorized. Main agent orchestrates and independently reviews; GPT-6 Luna implements bounded tasks. Spec01 used max effort. Escalate to GPT-6.1 Sol when needed.
- Stop for explicit user approval before implementing the next spec. Completing tasks does not authorize advancement, synchronization, archiving, commits, pushes, PRs or deployment.
- Preserve existing work and source observations. Do not infer people, station links, worker capacity or calibrated parameters from incomplete data.
- Use English for technical artifacts/code and Spanish for user-facing communication, UI and the user guide.

## Selective TDD

The user adopted selective TDD on 2026-10-22. This replaces the earlier project-wide strict-TDD rule; do not modify globally installed skills to apply it. The detailed policy is in `openspec/README.md#selective-tdd-policy`.

- Write a focused failing public-behavior test first for new, uncovered critical simulation rules, resource/time invariants, numerical/statistical calculations and data-integrity rules. Use manually solved examples where possible.
- Reproduce a defect in testable behavior with a failing regression before fixing it. For a purely visual defect, reproduce and inspect it visually before/after the correction.
- Implement ordinary parsing, API/UI wiring, visual presentation and delivery tooling in small coherent blocks; complete relevant automated/integration/visual checks before accepting the block. A RED for every edit or acceptance example is not required.
- Keep the baseline 37 tests. Add meaningful coverage when required; do not delete tests, weaken assertions or disable checks to make failures disappear.
- Test the confirmed public boundaries: import, deterministic engine, experiments/metrics, API and replay/UI. Do not re-request approval for these same boundaries. Avoid private-method tests, internal mocks and tautological expected values.
- An existing behavior test that already passes is valid coverage, not a missing RED. Never remove working features just to manufacture a failure, and never relabel tests written after implementation as test-first.
- Keep refactoring within the authorized block, preserving behavior with relevant tests green. No tests are needed solely for prose or simple configuration edits; use readback and applicable native validation.

## Verification and evidence

- Use focused checks while iterating and the applicable full suite at block/change completion. Repeat broad checks only for new changes, failures or unresolved concerns.
- Record concise evidence per block: acceptance behavior, checks, actual results and material limitations. For selected TDD cycles, retain the meaningful failure and successful regression; do not duplicate large per-test logs.
- If a required runner is unavailable, report the blocker and pause affected code work. Never replace runtime/visual verification with structural validation or an agent's claim.
- Main-agent acceptance requires direct diff review and independently observed applicable checks. Preserve historical evidence and distinguish engineering completion from user approval to advance.

## Documentation and tools

- For library/framework/SDK/API/CLI-specific questions, use Context7: resolve the library ID, then query the specific concept using minimal sanitized context. General programming, ordinary refactors and code review do not require a documentation query.
- Keep OpenSpec requirements and design proportionate to the change; work from clear acceptance examples and public contracts. The selective testing policy applies even when an older template says every behavior needs a RED.
- Use applicable installed skills. The user's explicit selective-TDD policy takes precedence over their blanket TDD defaults within this project.
- Python: `uv run pytest`, `uv run ruff check .`, `uv run mypy src/boquitas`. Use the lockfile and project-local cache; frozen/offline checks are appropriate when dependencies are already installed.
- OpenSpec: validate existing changes with the installed CLI before reporting readiness. No software implementation is authorized by a documentation-only request.
