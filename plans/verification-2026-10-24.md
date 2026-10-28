# Verification of the comparison and proposal

Date: 2026-10-24. Scope: documentation, preserved observation copies and descriptive arithmetic only. The preparation-interruption feature was not implemented or executed.

## Observed results

- Independent CSV/date arithmetic matched the existing importer's counts and totals for both visits. The approved Tuesday correction profile reported `already_reflected`; the regular visit used no corrections.
- A fresh read verified all eight linked regular-day order totals against their raw timestamps and the report table: 281, 164, 237, 293, 159, 257, 279 and 143 seconds. Sum: 1813 seconds; mean: 226.625 seconds.
- All four comparative metric rows, including means, differences and medians, matched `evidence/comparison-calculations.json` after display rounding.
- Source SHA-256 values were checked for the corrected Tuesday file and both new regular-day observation copies.
- All 208 existing protected source, test, documentation, OpenSpec, script, contract and configuration files matched the recorded pre-write fingerprint: `ab0731b8514870fe60c23159bdb98e74b552eacae9d4dc200b5a77e086b563c5`. The already-modified `openspec/config.yaml` and pre-existing untracked application files were preserved.
- The three main Markdown documents passed UTF-8 replacement-character, trailing-whitespace, final-newline, fenced-block and local-link checks; six local links resolved at that check. This verification note was read back after creation.
- The proposed synthetic timelines satisfy their stated arithmetic for active work, pauses and elapsed duration. This checks the examples, not application support for the proposed behavior.
- `openspec validate --changes --strict --no-interactive --json` exited 0: six existing packages passed, zero failed. It validated the existing packages; plan 001 is not a newly accepted OpenSpec package.
- `git diff --check` exited 0. Git also printed an LF/CRLF notice for the pre-existing `openspec/config.yaml` change; its content hash remained unchanged. New untracked planning files were checked separately.

## Not performed

No implementation, new application tests, full regression suite, browser/3D checks, fitted distributions, empirical validation, commit, push, PR or deployment. No application test pass is claimed for this documentation-only task. Automatic cashier-priority rules and exact real pause boundaries remain unestablished.

## Deliverables

See [the Spanish comparison](comparacion-martes-vs-normal-2026-10.md), [technical proposal 001](001-scripted-preparation-interruptions.md), [calculation evidence](evidence/comparison-calculations.json) and [protected working-tree baseline](evidence/preparation-proposal-baseline.json). Implementation remains awaiting approval.
