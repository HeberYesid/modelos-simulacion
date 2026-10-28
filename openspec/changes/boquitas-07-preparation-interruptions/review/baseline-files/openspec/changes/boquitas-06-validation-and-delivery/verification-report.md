# Spec06 independent verification

Date: 2026-10-23. The user approved spec05 and authorized spec06. All 10 engineering tasks are complete after main-agent source/document review, actual startup/shutdown, graphical inspection and independent checks. User acceptance of this delivery remains separate from engineering completion.

The authoritative [release acceptance report](../../../docs/acceptance-report.md) maps all 48 ENG/OBS/EXP/WEB/VIS/REL requirements and56 named scenarios to actual checks and evidence. It records environment, original source/lock hashes, reproducible scientific JSON, warnings, initial failed checks and their corrections.

Independent results:131 Python tests;21 frontend unit tests;12 existing browser workflows;6 production-origin workflows with the automatic network guard active; Ruff, mypy14 files, application/release TypeScript checks, contract drift checks, production build and all 6 OpenSpec validations passed. The six network audits contain49 local requests and zero external attempts. Main-agent literal Ctrl+C released8000; restart/default-browser opening, payment/preparation/transfer/withdrawal/drain and motion were directly observed. Test services and the isolated review browser were stopped.

The launcher uses the installed environment and built assets. No dependency download occurs during launch. Integrated acceptance reproduced and fixed a lost first click after staffing edits. Independent review also corrected an unused network fixture before accepting offline evidence. The existing tests and numerical code remain byte-identical; only the two scoped frontend files changed.

See [launcher evidence](launcher-evidence.md), [browser workflow evidence](workflow-evidence.md), the [technical guide](../../../docs/technical-guide.md), [Spanish guide](../../../docs/guia-de-uso.md) and [future empirical-validation protocol](../../../docs/empirical-validation-protocol.md). Clean installation on another machine and another human's use were not tested. Calibration, field validation and operational recommendations remain pending. There was no synchronization, archive, commit, push, PR or deployment.
