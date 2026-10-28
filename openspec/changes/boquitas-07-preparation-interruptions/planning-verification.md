# Spec07 planning verification

Date: 2026-10-24. Scope: conversion of the approved proposal into a new OpenSpec planning package only. The user explicitly excluded implementation.

## Observed results

- Installed OpenSpec CLI: 1.4.1. The package was created with the installed `openspec new change` command; native instructions and dependency status were read before writing each artifact type.
- `proposal`, `specs`, `design` and `tasks` all report artifact status `done`. This means the planning files exist; it does not mean their implementation tasks were executed.
- The capability contains **18 requirements and 32 scenarios**. Each requirement uses normative language and has GIVEN/WHEN/THEN acceptance examples; the tasks reference all 18 requirement IDs.
- **28 implementation tasks remain unchecked; 0 are completed.** The user-approved scope is explicit scripted pause/cashier/resume for one integrated regular worker, with version-1 compatibility and a version-2 extension.
- `openspec validate boquitas-07-preparation-interruptions --strict --no-interactive --json` passed. Global strict validation passed **7 packages, 0 failed, 0 issues**.
- Seven Markdown files were checked at the consistency pass: the four new planning artifacts and three updated status/index documents. Their 42 local links resolved; UTF-8, final newlines, whitespace and fenced blocks were checked. This note and its evidence file were checked after creation.
- Arithmetic of the core, external-confirmation, repeated-pause, initial-residual and drain examples is consistent. These are planned test oracles, not executed simulations of the proposed feature.
- **212 existing protected files remained byte-identical**, including application code, tests, runtime docs, old capability packages, fixtures and prior observation/evidence files. Three source hashes were rechecked, including the corrected Tuesday source outside the repository.
- Four existing planning/context files were intentionally updated: `openspec/config.yaml`, `openspec/README.md`, `plans/README.md` and `plans/001-scripted-preparation-interruptions.md`. These edits record approval, new Spec status and version-scoped planned semantics; they preserve the existing implementation and historical reports.
- Main `openspec/specs/` remained empty. No predecessor package was rewritten, no missing canonical requirement was fabricated, and no synchronization/archiving was performed.
- `git diff --check` exited 0; Git printed the pre-existing LF/CRLF notice for the already-modified OpenSpec configuration. Protected-file fingerprints were used because most application files are untracked and a tracked diff alone would not prove preservation.

Machine-readable counts and preservation fingerprints are in [planning-evidence.json](planning-evidence.json). The [proposal](proposal.md), [requirements](specs/preparation-interruptions/spec.md), [design](design.md) and [pending tasks](tasks.md) form the reviewable package.

## Limits

No feature implementation, application regression suite, browser/3D acceptance, source correction, fitted parameters, empirical-validation claim, commit, push, PR, deployment or main-spec synchronization/archiving occurred. Implementation still requires an explicit instruction from the user. Structural validation is not evidence that pause/resume runs in the application.
