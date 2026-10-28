# Boquitas

Local academic discrete-event simulation of an ice cream shop. The Python backend runs scenarios and experiments; the TypeScript web interface displays results and trace-driven 3D replay. Default inputs are synthetic teaching examples. Software verification does not establish calibration or empirical validation.

## Start here

- [Spanish quick guide](docs/user/guia-de-uso.md)
- [Spanish user manual](docs/user/MANUAL_USUARIO.md)
- [Technical guide: installation, startup and verification](docs/technical/technical-guide.md)
- [Documentation index](docs/README.md)
- [Requirements and implementation roadmap](openspec/README.md)
- [Verification evidence index](docs/verification/README.md)

## Local setup and startup

For a Windows 10/11 x64 presentation computer, use the self-contained ZIP described
in the [Spanish portable guide](docs/user/guia-portable.md). It includes its Python
runtime and built web assets; the destination needs only a compatible browser.
Build it on Windows x64 with `./build-portable.ps1`. Build tooling and initial
dependency downloads are needed only on the build computer. Extract the complete
ZIP before opening `INICIAR_BOQUITAS.cmd`.

Run from the repository root with Python 3.13, uv and pnpm available. See the technical guide for the supported environment and troubleshooting. Installation can require internet access; the built application operates locally afterward.

```powershell
uv --cache-dir .uv-cache sync --frozen
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
.\start-boquitas.ps1
```

The launcher serves the application at <http://127.0.0.1:8000>. Stop it with Ctrl+C. Use `-NoBrowser` to suppress browser opening. These are existing project commands; the documentation reorganization did not rerun installation, builds or runtime tests.

## Repository layout

| Location | Responsibility |
| --- | --- |
| `src/boquitas/` | Python simulation, observations, experiments, metrics, exports and API |
| `tests/` | Python tests and fixtures |
| `web/` | Browser interface, 3D replay, contracts, frontend tests and build configuration |
| `scripts/` | Contract export and empirical-readiness utilities |
| `docs/user/` | Spanish user guides |
| `docs/technical/` | Technical operation and verification commands |
| `docs/academic/` | Academic document and its provenance/verification records |
| `docs/field-kit/` | Measurement templates and existing-visit evidence |
| `docs/verification/` | Navigation to preserved acceptance/review evidence and organization record |
| `openspec/` | Requirements, designs, tasks and historical change evidence |
| `plans/` | Proposals, descriptive comparisons and supporting evidence |
| `.tmp/` | Ignored scratch space for future disposable local output |
| `AGENTS.md` | Project working instructions |
| `pyproject.toml`, `uv.lock`, `.python-version` | Python configuration and dependency resolution |
| `start-boquitas.ps1` | Local launcher |
| `.gitignore` | Git exclusions |
| `.codex/`, `.opencode/` | Local assistant resources |

`.git/` stores version-control metadata. `.venv/` is the installed Python environment. `.uv-cache/`, `.pnpm-store/`, `.mypy_cache/` and `.ruff_cache/` are local dependency/tool caches. They remain in their existing locations. The 21 legacy root test/temporary directories were inspected and removed on 2026-10-28 with user authorization; see the [organization and cleanup record](docs/verification/root-organization-2026-10-28.md). Historical evidence inside documentation and OpenSpec remains in place.

## Evidence and document ownership

The [Spec07 report](openspec/changes/boquitas-07-preparation-interruptions/verification-report.md) records historical engineering acceptance. Calibration and independent empirical validation remain separate work.

Academic files already inside this repository remain in `docs/academic/`. The separate OneDrive `MODELOS` folder was not moved or synchronized. No single authoritative academic version was selected across those two locations.

Historical evidence stays at its original paths. The former guide paths under `docs/` contain compatibility links. Future temporary output should use a dedicated subdirectory of `.tmp/` when the tool supports an explicit output path; capture evidence that needs retention outside `.tmp/` before cleanup. Existing runner configuration has not been changed.
