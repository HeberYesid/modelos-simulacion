# API implementation evidence

Scope: WEB-01 typed local operations and the JSON/CSV helper routes needed by WEB-06. These checks use the public HTTP boundary and the existing scenario, import, run, experiment, load and export contracts.

## Focused behavior cycles

- Zero Tuesday preparers: the HTTP test first returned 404 against the health-only app. After adding the typed run operation and request-error mapping, it returned 422 with `scenario.engine_config.preparers`, no result, and no echoed input. The recorded response is `web/contracts/fixtures/invalid-staffing-422.json`.
- Observation upload: the focused import test first returned 404. The completed route passes the approved correction policy to `import_observations`, returns fatal reports as structured 422 details, and measures uploaded bytes by reading at most 10 MiB plus one byte. The corrected-reference fixture returns 200 with 119 normalized rows and `already_reflected` policy status.
- Failed experiment: the focused batch test first returned 404. A deterministic workload-limit example now returns 422 with `details.partial_result.status = "failed"` and the upstream issue code retained.
- Saved JSON: the incompatible-version test first returned 404. It now returns an actionable 422 at `contract_version`; supported scenario and run files reopen through existing `load_*_json` functions, retaining the original run trace without executing it.
- Unexpected service failure: the test initially surfaced the intentional test exception because `TestClient` raises server exceptions by default. With exception re-raising disabled, the public response is 500 with a diagnostic reference; neither response nor log includes exception text or traceback.

## Verification

- `uv --cache-dir .uv-cache run --frozen pytest tests/test_api.py -q`: 19 passed. FastAPI's installed Starlette emits a deprecation warning that its current `TestClient` integration recommends `httpx2`; the warning does not affect the requests.
- `uv --cache-dir .uv-cache run --frozen ruff check .`: passed.
- `uv --cache-dir .uv-cache run --frozen mypy src/boquitas`: passed, 13 source files checked.
- `uv --cache-dir .uv-cache run --frozen python scripts/export_web_contracts.py --check`: passed; OpenAPI and three domain fixtures match deterministic output.
- Live startup with `uv --cache-dir .uv-cache run --frozen python -m boquitas.api` bound to `127.0.0.1:8000`; direct loopback requests to `/api/v1/health` and `/api/v1/demo` returned 200. The process was stopped after the check.
- Standard full-suite checkpoint before the final generated-fixture test: 127 passed; one existing CSV-writer test could not set up `tmp_path` because the sandbox denied enumeration of `%LOCALAPPDATA%\\Temp\\pytest-of-HeberYesid` (WinError 5). It was not skipped or changed; a post-fixture full-suite rerun with main-agent escalation is pending.

The API tests verify route behavior and static HTML serving through FastAPI TestClient. They do not provide browser visual QA; that remains part of the frontend and main-agent acceptance work.

## Main-agent acceptance

The temporary-directory checkpoint above is resolved: the main agent independently ran the complete suite with the required process permission and observed 128 passed, including all 19 API tests. Ruff, mypy and deterministic contract checks also passed. The main agent performed the separate production-browser inspection; see the [final independent verification report](verification-report.md). The live loopback service was started for user review after the earlier agent-owned smoke-test process had stopped. Engineering completion does not approve spec05.
