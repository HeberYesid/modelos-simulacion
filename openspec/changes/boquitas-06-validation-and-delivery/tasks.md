The user approved specs01 through05 and authorized this change on 2026-10-23. All 10 engineering tasks were independently verified; see [release acceptance](../../../docs/acceptance-report.md). User approval of this delivery remains separate. Owner: GPT-6 Luna for launcher/docs/checks; main agent owns independent review and release acceptance. Apply the [selective TDD policy](../../README.md#selective-tdd-policy): use focused failing regressions for testable defects/critical launcher failure handling; ordinary delivery tooling uses integration checks per block, and documentation/simple configuration uses readback/native validation. Preserve all existing tests and honest evidence.

## 1. Repeatable local operation

- [x] 1.1 Implement REL-01 Python entry point and Windows launcher from observed startup/port/setup failure cases; verify loopback health before opening the browser and no dependency fetch at runtime.
- [x] 1.2 Verify REL-01 stop/restart and occupied-port behavior in the actual local environment; confirm an unrelated process is never killed and no security setting is weakened.
- [x] 1.3 Verify REL-02 offline runtime using local-only network monitoring/browser restrictions after installation, covering data import, experiments, exported files and procedural 3D.

## 2. Integrated acceptance and guides

- [x] 2.1 Execute REL-03 original/corrected import -> synthetic run -> 30-replica comparison -> selected replay -> export/reopen workflow and all upstream critical edge cases; record observed outcomes.
- [x] 2.2 Perform REL-03 actual 3D motion, seeking, controls and repeated-load inspection; keep unavailable GPU/browser checks explicitly pending rather than inferring visual success.
- [x] 2.3 Write/read back REL-04 English technical guide and Spanish user guide with exact installed commands, defaults, model simplifications, metric units/cohorts, files, errors and shutdown.
- [x] 2.4 Write/read back REL-05 prospective empirical-validation protocol and measurement gaps; verify no unsupported fitted parameters, real-business recommendations or fabricated validation thresholds.

## 3. Main-agent acceptance and handoff

- [x] 3.1 Run all applicable Python tests/static checks, frontend tests/typecheck/build and browser workflows; independently inspect the final diff and unchanged source hashes.
- [x] 3.2 Produce REL-06 acceptance report mapping all ENG/OBS/EXP/WEB/VIS/REL IDs to commands, actual results and evidence, including failures/skips/pending checks and environment details.
- [x] 3.3 Review every requirement, remaining task and limitation with actual evidence; mark only verified implementation work complete, and synchronize/archive specs only when that later action is authorized and appropriate.

## Closure evidence

Main-agent results:131 Python tests,21 frontend unit tests,12 existing browser flows and6 production acceptance flows passed; all static/type/contract/build checks and all 6 OpenSpec changes validated. Six automatic network audits record49 local requests and zero external attempts. Actual PTY Ctrl+C/restart/default-browser and direct graphical review were observed. Source observations, lockfiles and all existing tests retain their hashes; only two preexisting frontend files changed for the reproduced first-click regression. Empirical calibration/validation remain pending. No synchronization, archive, commit, push, PR or deployment was performed.
