# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


project_root = Path(SPECPATH).resolve().parent
entry_point = project_root / "scripts" / "portable_entry.py"
frontend_dist = project_root / "web" / "dist"

if not entry_point.is_file():
    raise FileNotFoundError(f"Portable entry point not found: {entry_point}")
if not (frontend_dist / "index.html").is_file():
    raise FileNotFoundError(
        f"Built frontend is missing at {frontend_dist}. Run 'pnpm --dir web build' first."
    )

hidden_imports = collect_submodules("boquitas") + [
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.lifespan.on",
]

analysis = Analysis(
    [str(entry_point)],
    pathex=[str(project_root / "src")],
    binaries=[],
    datas=[(str(frontend_dist), "web/dist")],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(analysis.pure)
executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="Boquitas",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
)
bundle = COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name="Boquitas",
)
