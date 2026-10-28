# Independent implementation baseline

Date: 2026-10-24. The user approved Spec07 implementation in bounded Luna blocks with main-agent review, preserving version 1 and its tests. No commit, remote operation or main-spec synchronization/archiving is included.

## Observed baseline before source edits

- `uv --cache-dir .uv-cache run --frozen --offline pytest --basetemp <fresh review directory>`: **131 passed**, one existing Starlette/httpx deprecation warning, 14.18 s. This full run was executed outside the sandbox because the initial sandbox run hit filesystem permissions in pytest temp setup and the launcher's `TemporaryDirectory` test; that initial run had 129 pass, one failure and one setup error. No test or application fix was used to address those environment restrictions.
- `pnpm --dir web test --run`: **21 passed in 9 files**, outside the sandbox. The initial sandbox attempt failed before tests at Vite child-process startup with `spawn EPERM`.
- `pnpm --dir web typecheck`: passed.
- `uv --cache-dir .uv-cache run --frozen --offline ruff check .`: passed.
- `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas`: passed, 14 source files.
- The generated version-1 Tuesday demo matched the existing scientific reference byte for byte: SHA-256 `8bbe6b117f59dde367816d8ed63bb013b0ad624d916a57159c084fcff4051dd7`.
- A same-seed/index regular-mode demo was saved as `legacy-regular-before.json`: 976770 bytes, SHA-256 `d0093084b4e99e59000725ae99c8cab2603bb3f7a666c986f731b06b5c157e69`. It is a synthetic preservation reference, not a field estimate.
- `implementation-baseline.json` records 223 existing file hashes and the external corrected Tuesday source hash before implementation. Original Python/frontend tests, observation files, scientific fixtures and lockfiles must be preserved.

This baseline establishes current software behavior and runner availability; it does not validate the new feature or the real business model. Task1.1 is accepted by the main agent. Subsequent task checkmarks require their own independently observed evidence.
