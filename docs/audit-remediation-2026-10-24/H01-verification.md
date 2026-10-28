# H01 — large result reopen and response bounds

Date: 2026-10-24. Implemented and verified in the live checkout after independent staging review. No commit was made.

## Changes

- Kept observation uploads at 10 MiB and retained `boquitas.api.MAX_UPLOAD_BYTES` as a compatibility alias.
- Added a separate 64 MiB bound for saved JSON. The API checks measured `UploadFile.size` before reading, with a bounded `limit + 1` fallback, and returns `saved_file_too_large` with a matching Spanish message.
- Successful run and experiment responses are serialized once as compact UTF-8 JSON. The API checks the encoded byte length; results above 64 MiB return HTTP 422 `result_too_large` with guidance to reduce horizon, demand, or replications. Accepted results return those checked bytes directly as `application/json`; the declared response models and OpenAPI fixture remain unchanged.
- The browser now has distinct observation and saved-result limits and messages. `readExactJsonFile` checks its 64 MiB default before reading; observation text reads remain at 10 MiB. Fresh run/experiment response text is retained in a `WeakMap` by returned-object identity and used for downloads. The existing imported `completedBytes` path remains intact.

## RED evidence

- The phase 1 regression generated a valid 22,959,355-byte comparison file and observed HTTP 413 `upload_too_large` at 10 MiB.
- Before the API implementation, the focused API tests had 19 passes and 4 failures: oversized run and experiment outputs were accepted with 200, the one-byte-over UTF-8 result was accepted, and the 22,959,355-byte saved comparison was rejected.
- Frontend tests were written before the frontend changes. The default Vitest start failed with `spawn EPERM`, so the frontend RED was later confirmed by replaying against copies of the untouched baseline service/format files: 6 failed and 3 passed. This is baseline-replay evidence, not an observed chronological RED-before-GREEN cycle. The shared baseline files were never edited for that replay.

## Live verification

- Python: `tests/test_api.py` and `tests/test_large_result_reopen.py` — 23 passed. This includes the unchanged OpenAPI fixture check, result-size rejection on both response endpoints, inclusive byte-cap behavior with Unicode, and reopening the full-day comparison.
- Frontend Vitest: 3 focused files, 9 passed (`file-size-policy`, `server-response-json`, and `json-precision`). The response-retention fixture uses a safe seed plus Unicode and decimal spelling; unsafe-integer file rejection remains covered by the existing precision test.
- TypeScript: `pnpm --dir web typecheck` passed.
- Ruff on the modified Python files passed; mypy on `src/boquitas/api.py` passed.
- The only warning was the existing Starlette `TestClient` deprecation notice for httpx. No dependency was installed. Broad suites, production build, and browser E2E were not run.

Vitest ran against the live `web/` source using a stage-only config with a cache directory inside the staging tree, `--configLoader native`, and the threads pool. No stage harness/config was added to the live checkout.

## Files integrated

- Modified: `src/boquitas/api.py`, `tests/test_api.py`, `web/src/services/api.ts`, `web/src/domain/format.ts`, `web/src/main.ts`, `web/tests/json-precision.test.ts`.
- Added: `src/boquitas/file_limits.py`, `web/src/domain/file-limits.ts`, `web/tests/file-size-policy.test.ts`, `web/tests/server-response-json.test.ts`.
- `tests/test_large_result_reopen.py` was already added during phase 1 and was included in the focused API run; it was not rewritten in this integration.

The initial live API and test files were patched by hunks rather than copied from staging. That H01 block did not modify OpenAPI schemas, fixtures or Spec07 task files. The subsequent Spec07 integration extended the result types while retaining the H01 output guard and exact JSON handling.

## Independent check after Spec07 API and UI integration

The main agent ran `pnpm --dir web exec playwright test --config playwright.audit.config.ts` against the actual integrated production app on a separately owned loopback server at port 8011. The run used its own output directory in this chat's visualization workspace and passed: **1 browser test in 9.7 seconds**. The staging browser check had separately passed before integration in 24.4 seconds.

The integrated browser workflow:

- Ran the complete default 23,400-second day, with a two-preparer candidate and 30 replications.
- Received and downloaded exactly **14,240,829 bytes**, with 2 scenarios and 60 complete replication records; the file matched the successful HTTP response byte for byte.
- Reloaded the page and reopened the downloaded file through the actual upload control, with exact result equality and no new experiment or single-run POST.
- Rejected an invalid JSON file while retaining the last valid result.
- Captured a full-page image and a readable viewport image; the main agent inspected the reopened result.

Downloaded file SHA-256:

```text
8f400ca7a59bf3381926b4e96cafd0e72f82fa8538e4987467b36156b04d6c58
```

Fresh frontend checks also passed: **36 unit tests in 14 files**, normal/release/audit TypeScript checks, and OpenAPI TypeScript contract drift. Ruff passed on `src`, `tests` and `scripts`; mypy passed on 15 source files; the Python exporter matched 7 API/domain contract files.

A separate public HTTP probe of the supplied synthetic version-2 example produced deliveries A=14 and B=17, pause at 5 and resume at 7, and exact saved-run reopening. The legacy scientific JSON remained byte-identical. These checks do not replace the other chat's remaining version-2 browser/visual acceptance.

The latest whole-Python attempt while the other chat's server occupied port 8000 had 251 passes, one launcher setup failure and one launcher skip. The failure was `WinError 10048` while the test tried to bind that already occupied port; no application assertion failed in that case. No listener was killed and no test was weakened. A coordinated rerun with port 8000 free is pending and must be recorded before claiming a completely passing final Python suite.
