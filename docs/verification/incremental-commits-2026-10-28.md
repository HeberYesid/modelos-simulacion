# Incremental local commit execution — 2026-10-28

The user approved local execution of [plan 002](../../plans/002-incremental-repository-commits.md). The existing `main` branch and original commit `bdb7591c65d6ec045b50f32ed2c3a1ff2f266ea6` were preserved. No remote operation, push, PR, deployment, OpenSpec synchronization or archiving was performed.

## Commit sequence

| Step | Commit | Scope |
| --- | --- | --- |
| 1 | `48131fb` | Generated-file exclusions; 2 paths |
| 2 | `d865463` | Versioned simulation/observations/experiments, Python setup, tests and required fixtures; 34 paths |
| 3 | `1221819` | API, file contracts, deterministic fixtures and tests; 20 paths |
| 4 | `8839d8c` | Complete web interface/replay, configuration and tests; 51 paths including attribute policy |
| 5 | `382c288` | Windows launcher and its tests; 2 paths |
| 6 | `90c4c96` | Empirical-readiness utility, templates and tests; 12 paths including attribute policy |
| 7 | The commit containing this record | Operating guides, requirements, original evidence, academic artifacts, plans and this execution record |

Messages use Conventional Commits without attribution trailers. These are current snapshot commits, not a reconstruction of past implementation dates.

## Isolation and observed verification

An ignored validation directory was populated initially from the parent Git tree, then incrementally with exactly each manifest's paths. It had its own Python environment and its own frontend dependency installation. No later source modules were supplied to earlier candidates. Frozen offline installations succeeded from existing local caches; no package version or lockfile was changed. The first frontend installation used an incomplete store and failed; pointing to the already-installed environment's actual local store resolved that setup issue with zero downloads.

| Candidate | Actual observed result |
| --- | --- |
| 1 | Explicit two-file staged diff reviewed |
| 2 | 173 Python tests passed; public import resolved inside the candidate; Ruff passed; mypy passed on 12 source files |
| 3 | 240 Python tests passed; Ruff passed; mypy passed on 15 source files; OpenAPI/domain fixture export check matched 7 files |
| 4 | 37 frontend tests passed across 14 files; all three configured TypeScript checks passed; generated OpenAPI types matched; production build passed; 14 development browser tests passed |
| 5 | 243 Python tests passed, including all Windows launcher tests without skips; 6 production browser tests passed against the built local application with external requests denied; controlled launcher shutdown released port 8000 |
| 6 | Complete Python suite: 259 passed, no failures or skips; Ruff passed on source/tests/scripts; mypy passed on all 15 source files |
| 7 | All 7 OpenSpec change packages passed strict validation in the isolated candidate; active documentation link targets and original-file hashes checked |

The browser suites exercise actual keyboard/mobile workflows, saved results, 3D replay, camera interaction, WebGL fallback and context loss. Generated test artifacts stayed inside the ignored validation directory. Later documentation-only additions did not change tested application behavior, dependencies or test inputs, so broad runtime suites were not repeated solely for documentation.

The initial candidate-2 attempt exposed seven missing-fixture failures: tests read `scripted-demo-input.json` and `scripted-demo-legacy-reference.json` from their existing OpenSpec paths. Those two unchanged fixtures were moved from manifest 7 to manifest 2, and the relevant candidate passed afterward. The initial temporary-output parent was also missing; a later sandboxed pytest run could not clean its temporary directory. Successful runs used unique scratch paths and approved local execution outside the sandbox. No assertions, runners or permissions were weakened.

## Preservation and reviewed limitations

- SHA-256 baselines covered all manifest files and the originally tracked resources, including academic documents, source observation fixtures and historical evidence. Application source, test logic, lockfiles, Word content and historical evidence retain their original working-tree bytes.
- Staged blobs were compared with candidate/source bytes for every commit. Scoped `.gitattributes` rules prevent automatic line-ending normalization of fixtures, historical provenance and the empirical-readiness source/tests. `.gitignore` gained a narrow exclusion for the six inspected nested pytest directories.
- Final pre-commit review compared 636 baseline files and checked 71 active local Markdown link targets with no missing destinations. Only the attribute policy and the current plan/documentation indexes changed from that baseline; application and historical artifact bytes were preserved.
- Historical nested evidence paths exceed legacy Windows path limits. Git long-path support is enabled only in this repository's local configuration; evidence was not renamed or flattened, and global Git configuration was not changed.
- Six internal `review/pytest-*` directories contain generated test fixtures. They were excluded from Git, retained locally, and not confused with acceptance reports. Dependency installations/caches, `.tmp/` and ordinary generated test output remain excluded.
- Two explicitly retained audit artifacts, `full-day-comparison.json` and `large-result-reopened.png`, were individually included despite their parent directory being ignored, preserving the historical evidence chain. The ordinary `.last-run.json` marker remains local.
- The initial local credential-pattern scan found no matching private-key blocks or common token formats. This is a limited scan, not comprehensive publication clearance. Six candidate files contain local user paths; academic author metadata and provenance were retained. Review these before any future remote publication; no data was sent to documentation/search tools.
- `git diff --check` reports intentional retained CRLF content as whitespace and existing final blank lines, including the EOF blank lines in `src/boquitas/experiments.py` and `tests/test_exports.py`. These are reviewed formatting findings, not a passing whitespace-check claim. Source/evidence was not reformatted to hide them.
- Python tests emit an existing Starlette/httpx deprecation warning. Vite reports a minified JavaScript chunk above 500 kB. Both checks exit successfully; dependency migration and bundle splitting remain outside this task.
- External documentation URLs, historical absolute source paths and Markdown anchor fragments were not certified by the local link-target check.

## Remaining publication step

All commits are local. Publication still requires explicit authorization for the remote destination and target branch, plus resolution of the local-path/academic-metadata review as appropriate to repository visibility. No remote credentials or sessions were discovered or reused.
