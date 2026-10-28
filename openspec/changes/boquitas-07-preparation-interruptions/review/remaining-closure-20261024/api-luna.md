# Luna evidence: Spec 07 task 5.3 API closure

Date: 2026-10-24. Scope: saved-file V2 validation diagnostics and API compatibility only. No OpenSpec task checkbox changed.

## Finding and change

The pre-existing 18-case static V2 request matrix passed. Additional public-boundary probes found that an invalid script field inside a saved V2 run or experiment collapsed to the outer discriminator path `2`, losing the scenario and script indices. A new regression failed on both saved artifacts before the fix (2 failed).

`src/boquitas/api.py` now walks the nested validation error for saved V2 runs/experiments, removes nested union discriminator tags from paths, and formats list indices. It identifies V2 scenario members from the saved payload so errors for V1 members in a mixed V2 experiment keep the ordinary V1 diagnostic. Existing routes and response shapes are reused.

`tests/test_interruption_api_diagnostics.py` adds coverage for saved run/experiment script paths, mixed-version V1 diagnostic preservation, unsupported file versions, an inconsistent V2 run/trace pair, and rejection of an infeasible selected run with its indexed script error. The selected-run failure is 422 and contains no partial result.

## Verification

- RED: the new saved-run and saved-experiment path regression failed twice, each returning only `path: "2"`.
- GREEN: final focused/API/export command passed 59 tests, including `tests/test_api.py` and the existing legacy/V2 API/export coverage: `uv --cache-dir .uv-cache run --frozen --offline pytest -q tests/test_interruption_api_diagnostics.py tests/test_interruption_api.py tests/test_api.py tests/test_interruption_exports.py --basetemp=openspec/changes/boquitas-07-preparation-interruptions/review/remaining-closure-20261024/pytest-api-luna-verified` (59 passed; one Starlette/httpx deprecation warning).
- `ruff check src/boquitas/api.py tests/test_interruption_api_diagnostics.py`: passed.
- `mypy src/boquitas`: passed, 15 source files.
- Included API tests cover the 10 MiB observation upload and 64 MiB saved-file/result limits, version-1 response byte preservation, and versionless legacy scenario defaulting.

Primary agent owns the full suite and independent acceptance checks.

## API hunk delta for independent review

No pre-edit file copy was saved. This reconstructs the exact source hunks changed in `src/boquitas/api.py` from the pre-edit contents and the final file; it is the bounded delta, not a full-file snapshot.

```diff
@@ imports
-from collections.abc import Mapping
+from collections.abc import Mapping, Sequence
@@ after _format_validation_path
+def _strip_nested_version_discriminators(
+    parts: tuple[str | int, ...],
+) -> tuple[str | int, ...]:
+    if len(parts) >= 2 and parts[0] == "scenario" and parts[1] in {1, 2}:
+        return (parts[0], *parts[2:])
+    if (
+        len(parts) >= 3
+        and parts[0] == "scenarios"
+        and type(parts[1]) is int
+        and parts[2] in {1, 2}
+    ):
+        return (*parts[:2], *parts[3:])
+    return parts
@@ after _version_2_input_issues
+def _saved_v2_scenario_prefixes(
+    payload: Mapping[str, object],
+    artifact_kind: Literal["run", "experiment"],
+) -> tuple[tuple[str | int, ...], ...]:
+    if artifact_kind == "run":
+        scenario = payload.get("scenario")
+        if isinstance(scenario, Mapping) and scenario.get("contract_version") == 2:
+            return (("scenario",),)
+        return ()
+
+    scenarios = payload.get("scenarios")
+    if not isinstance(scenarios, (list, tuple)):
+        return ()
+    return tuple(
+        ("scenarios", index)
+        for index, scenario in enumerate(scenarios)
+        if isinstance(scenario, Mapping) and scenario.get("contract_version") == 2
+    )
+
+
+def _saved_v2_nested_issues(
+    issues: Sequence[Mapping[str, object]],
+    *,
+    payload: Mapping[str, object],
+    artifact_kind: Literal["run", "experiment"],
+) -> tuple[ErrorIssue, ...]:
+    v2_prefixes = _saved_v2_scenario_prefixes(payload, artifact_kind)
+    normalized: list[ErrorIssue] = []
+    for item in issues:
+        prefix = _version_2_context_prefix(item.get("loc"), allow_saved_scenario=True)
+        context = item.get("ctx")
+        nested = context.get("error") if isinstance(context, Mapping) else None
+        leaves = _collect_validation_leaves(nested, ()) if prefix is not None else []
+        if not leaves:
+            normalized.append(_validation_issue(item))
+            continue
+
+        for path_parts, code, specific_error in leaves:
+            path_parts = _strip_nested_version_discriminators(path_parts)
+            belongs_to_v2_scenario = any(
+                path_parts[: len(v2_prefix)] == v2_prefix for v2_prefix in v2_prefixes
+            )
+            if belongs_to_v2_scenario:
+                normalized.append(_version_2_error_issue(path_parts, code, specific_error))
+                continue
+
+            generic_issue = _validation_issue(
+                {"loc": path_parts, "type": code, "msg": ""}
+            )
+            normalized.append(
+                ErrorIssue(
+                    path=_format_validation_path(path_parts),
+                    code=generic_issue.code,
+                    message=generic_issue.message,
+                )
+            )
+    return tuple(normalized)
@@ _saved_file_issues
 def _saved_file_issues(
     error: InputValidationError | ValidationError,
     *,
     version: int,
     artifact_kind: Literal["scenario", "run", "experiment"] | None,
+    payload: Mapping[str, object],
 ) -> tuple[ErrorIssue, ...]:
@@ after the saved-scenario branch
+    if version == 2 and artifact_kind in {"run", "experiment"}:
+        return _saved_v2_nested_issues(
+            issues,
+            payload=payload,
+            artifact_kind=artifact_kind,
+        )
@@ sole _saved_file_issues call
                     error,
                     version=version,
                     artifact_kind=artifact_kind,
+                    payload=payload,
                 ),
```
