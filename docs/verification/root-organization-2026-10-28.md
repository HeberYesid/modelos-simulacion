# Root organization — 2026-10-28

## Applied changes

- Added the root README and documentation/evidence navigation indexes.
- Relocated the quick guide and user manual to `docs/user/`, and the technical guide to `docs/technical/`. Rebased their relative links. Their old paths remain compatibility entries.
- Updated the active frontend README to use the new guide paths.
- Corrected stale Spec07 status in the quick guide and plan index using the existing final report; historical proposals, acceptance reports and evidence were not rewritten.
- Added ignored `.tmp/` scratch space for future output, and Git exclusions for legacy Spec07/test temporary directories. No runner configuration changed; existing commands do not automatically redirect their output there.
- Retained source, tests, runtime configuration, lockfiles, environments, caches, academic documents, field observations and OpenSpec evidence in place. The separate OneDrive academic folder was not changed.

## Preservation verification

- Before editing, SHA-256 fingerprints were captured for 632 readable project files, excluding dependency installations, standard tool caches and Git internals.
- After editing, 626 baseline files match byte for byte. Exactly six original paths changed: three guide compatibility entries, `.gitignore`, `web/README.md` and `plans/README.md`. No baseline file is missing. Relocated guides retain their content apart from relative links and the explicitly noted quick-guide status correction.
- All baseline-readable source/test files, evidence, academic artifacts and the pre-existing `openspec/config.yaml` modifications retain their hashes. HEAD remains `bdb7591c65d6ec045b50f32ed2c3a1ff2f266ea6`; no commit was made.
- The scan encountered 27 inaccessible directories, including legacy root temporaries and nested historical test directories. Their contents could not be fingerprinted and are not covered by the byte-preservation claim. They were not modified.

## Temporary directory review

All 21 candidate root directories rejected directory listing under current permissions. Their contents could not be classified safely; all remain at their existing paths. No file or directory was deleted, moved to scratch space, or granted new permissions.

- `.pytest-spec07-closure-20261024`: access denied; retained.
- `.pytest-spec07-closure-elevated-20261024`: access denied; retained.
- `.pytest-spec07-final-20261024`: access denied; retained.
- `.pytest-tmp-empirical-compact-20261024`: access denied; retained.
- `.pytest-tmp-empirical-final-20261024`: access denied; retained.
- `.pytest-tmp-empirical-final-compact-20261024`: access denied; retained.
- `.pytest-tmp-empirical-final-pass-20261024`: access denied; retained.
- `.pytest-tmp-empirical-final-verified-20261024`: access denied; retained.
- `.pytest-tmp-empirical-focused-20261024`: access denied; retained.
- `.pytest-tmp-empirical-green-20261024`: access denied; retained.
- `.pytest-tmp-empirical-red-20261024`: access denied; retained.
- `.pytest-tmp-empirical-red-elevated-20261024`: access denied; retained.
- `.pytest-tmp-empirical-review-20261024`: access denied; retained.
- `.pytest-tmp-empirical-review2-final-20261024`: access denied; retained.
- `.pytest-tmp-empirical-review3-final-20261024`: access denied; retained.
- `.pytest-tmp-luna-api-20261024-01`: access denied; retained.
- `pytest-cache-files-atjvre46`: access denied; retained.
- `pytest-cache-files-jscpow0v`: access denied; retained.
- `pytest-cache-files-ldrorzhz`: access denied; retained.
- `tmpm7xvndl0`: access denied; retained.
- `tmpy12zwatd`: access denied; retained.

## Check scope

This is a documentation and layout change. Runtime tests, lint, type checks, builds and browser tests were not rerun because source, tests and runtime configuration were unchanged. Preservation hashing, guide/index readback, local Markdown target checks and Git metadata comparison verify this task; they are not runtime or visual acceptance.

Local Markdown target check: 66 relative link targets across 12 current/compatibility documents exist. External URLs and anchor fragments were not validated.

## Subsequent authorized cleanup — 2026-10-28

The user subsequently requested temporary-file cleanup. An approved command outside the sandbox could inspect all 21 root candidates without changing filesystem permissions. Eight were empty and thirteen contained pytest-generated CSV/JSON fixtures and exports. Their `test_*` directories correspond to the existing tests, including empirical-readiness cases and CSV writer tests; they were not source observations or acceptance reports.

Before removal, all target paths were resolved and verified to be direct children of the exact project root; top-level reparse points, tracked content, unexpected child names and links outside each candidate were rejected. All candidates passed these checks. The 21 directories listed in the earlier historical section were then deleted using PowerShell `Remove-Item -LiteralPath ... -Recurse -Force`. The inventory contained 1,011 files totaling 574,171 logical bytes. Post-deletion checks found zero remaining candidate paths.

Before updating this record and the two scratch/layout descriptions, SHA-256 verification confirmed all 640 readable protected project files unchanged and HEAD unchanged. Code, tests, academic artifacts, field observations, acceptance evidence and existing user changes were preserved. The six inaccessible nested historical evidence directories were not targeted or modified. Dependency environments/caches, `.tmp/README.md`, and evidence under `docs/` and `openspec/` were retained. No commits or runtime changes were made; no software test run was necessary for deletion of disposable test fixtures. Statements above about retained root temporaries describe the earlier organization step and are superseded by this cleanup record.
