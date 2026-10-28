[CmdletBinding()]
param(
    [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $outputRoot = Join-Path $projectRoot "dist"
}
else {
    $outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
}

$releaseName = "Boquitas-Windows-x64"
$finalBundle = Join-Path $outputRoot $releaseName
$finalZip = Join-Path $outputRoot "$releaseName.zip"
$guidePath = Join-Path $projectRoot "docs\user\guia-portable.md"
$pythonExe = Join-Path $projectRoot ".venv\Scripts\python.exe"
$uvCache = Join-Path $projectRoot ".uv-cache"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Operation
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw $Operation
    }
}

function Copy-RequiredFile {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        throw "Falta $Description. Complete la instalación o generación indicada en la guía y vuelva a ejecutar el empaquetado."
    }
    Copy-Item -LiteralPath $Source -Destination $Destination
}

if (
    $env:OS -ne "Windows_NT" -or
    -not [System.Environment]::Is64BitOperatingSystem -or
    $env:PROCESSOR_ARCHITECTURE -notin @("AMD64", "x86") -and $env:PROCESSOR_ARCHITEW6432 -ne "AMD64"
) {
    [Console]::Error.WriteLine("Este paquete debe construirse en Windows de 64 bits.")
    exit 1
}
if (Test-Path -LiteralPath $outputRoot -PathType Leaf) {
    [Console]::Error.WriteLine("La ruta de salida existe y no es una carpeta: $outputRoot")
    exit 1
}
if ((Test-Path -LiteralPath $finalBundle) -or (Test-Path -LiteralPath $finalZip)) {
    [Console]::Error.WriteLine(
        "Ya existe $releaseName o su ZIP en '$outputRoot'. El script conserva los paquetes existentes; use otra ruta con -OutputDirectory."
    )
    exit 1
}
if (-not (Test-Path -LiteralPath $guidePath -PathType Leaf)) {
    [Console]::Error.WriteLine("Falta docs/user/guia-portable.md. Complete primero la guía portable.")
    exit 1
}

$uvCommand = Get-Command "uv" -ErrorAction SilentlyContinue
$pnpmCommand = Get-Command "pnpm.cmd" -ErrorAction SilentlyContinue
if ($null -eq $pnpmCommand) {
    $pnpmCommand = Get-Command "pnpm" -ErrorAction SilentlyContinue
}
if ($null -eq $uvCommand -or $null -eq $pnpmCommand) {
    [Console]::Error.WriteLine("Se requieren uv y pnpm en el equipo de construcción. Instálelos y vuelva a intentarlo.")
    exit 1
}

$stageName = ".Boquitas-build-" + [guid]::NewGuid().ToString("N")
$stageRoot = Join-Path $outputRoot $stageName
$bundlePath = Join-Path $stageRoot $releaseName
$pyInstallerDist = Join-Path $stageRoot "pyinstaller-dist"
$pyInstallerWork = Join-Path $stageRoot "pyinstaller-work"
$stagedZip = Join-Path $stageRoot "$releaseName.zip"

try {
    if (-not (Test-Path -LiteralPath $outputRoot -PathType Container)) {
        New-Item -ItemType Directory -Path $outputRoot | Out-Null
    }
    New-Item -ItemType Directory -Path $stageRoot | Out-Null

    Push-Location $projectRoot
    try {
        Invoke-CheckedCommand `
            -Command $uvCommand.Source `
            -Arguments @("--cache-dir", ".uv-cache", "sync", "--frozen", "--group", "release") `
            -Operation "No se pudieron sincronizar las dependencias Python bloqueadas."
        Invoke-CheckedCommand `
            -Command $pnpmCommand.Source `
            -Arguments @("--dir", "web", "install", "--frozen-lockfile") `
            -Operation "No se pudieron instalar las dependencias bloqueadas del frontend."
        Invoke-CheckedCommand `
            -Command $pnpmCommand.Source `
            -Arguments @("--dir", "web", "build") `
            -Operation "No se pudo compilar el frontend."
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "web\dist\index.html") -PathType Leaf)) {
            throw "La compilación no produjo web/dist/index.html."
        }

        Invoke-CheckedCommand `
            -Command $uvCommand.Source `
            -Arguments @(
                "--cache-dir", ".uv-cache", "run", "--frozen", "--group", "release", "python", "-c",
                "import platform, struct, PyInstaller; assert PyInstaller.__version__ == '6.22.3', PyInstaller.__version__; assert platform.machine() == 'AMD64' and struct.calcsize('P') == 8, 'The build requires an x64 Python runtime'"
            ) `
            -Operation "La herramienta bloqueada requerida es PyInstaller 6.22.3."
        Invoke-CheckedCommand `
            -Command $uvCommand.Source `
            -Arguments @(
                "--cache-dir", ".uv-cache", "run", "--frozen", "--group", "release", "python", "-c",
                "import struct,sys; assert sys.platform == 'win32' and struct.calcsize('P') == 8, 'requiere Python x64 en Windows'"
            ) `
            -Operation "El entorno de Python debe ser Windows x64."
        Invoke-CheckedCommand `
            -Command $uvCommand.Source `
            -Arguments @(
                "--cache-dir", ".uv-cache", "run", "--frozen", "--group", "release", "pyinstaller",
                "--noconfirm", "--distpath", $pyInstallerDist, "--workpath", $pyInstallerWork,
                "packaging\boquitas.spec"
            ) `
            -Operation "PyInstaller no pudo generar la aplicación portable."
    }
    finally {
        Pop-Location
    }

    $generatedApp = Join-Path $pyInstallerDist "Boquitas"
    if (-not (Test-Path -LiteralPath (Join-Path $generatedApp "Boquitas.exe") -PathType Leaf)) {
        throw "PyInstaller no produjo Boquitas.exe en su carpeta de salida."
    }
    New-Item -ItemType Directory -Path $bundlePath | Out-Null
    foreach ($generatedFile in (Get-ChildItem -LiteralPath $generatedApp -Force)) {
        $destination = Join-Path $bundlePath $generatedFile.Name
        Copy-Item -LiteralPath $generatedFile.FullName -Destination $destination -Recurse
    }
    Copy-RequiredFile `
        -Source (Join-Path $projectRoot "packaging\INICIAR_BOQUITAS.cmd") `
        -Destination (Join-Path $bundlePath "INICIAR_BOQUITAS.cmd") `
        -Description "packaging/INICIAR_BOQUITAS.cmd"
    Copy-RequiredFile -Source $guidePath -Destination (Join-Path $bundlePath "LEEME.txt") -Description "la guía portable"

    $examplesDirectory = Join-Path $bundlePath "ejemplos"
    New-Item -ItemType Directory -Path $examplesDirectory | Out-Null
    Copy-RequiredFile `
        -Source (Join-Path $projectRoot "web\contracts\fixtures\demo-scenario.json") `
        -Destination (Join-Path $examplesDirectory "escenario-martes-v1.json") `
        -Description "el escenario sintético de demostración"
    Copy-RequiredFile `
        -Source (Join-Path $projectRoot "web\contracts\fixtures\sample-scenario-v2.json") `
        -Destination (Join-Path $examplesDirectory "pausa-programada-v2.json") `
        -Description "el escenario sintético versionado 2"

    $licenseCollector = @'
from __future__ import annotations

import json
import sys
from importlib.metadata import distributions
from pathlib import Path, PurePosixPath

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

target = Path(sys.argv[1])
web_root = Path(sys.argv[2])
web_modules = web_root / "node_modules"
all_distributions = {
    canonicalize_name(dist.metadata["Name"]): dist
    for dist in distributions()
    if dist.metadata.get("Name")
}
root_name = canonicalize_name("boquitas")
if root_name not in all_distributions:
    raise RuntimeError("The locked Boquitas distribution is not installed.")

python_names: list[str] = []
pending = [root_name]
visited: set[str] = set()
while pending:
    name = canonicalize_name(pending.pop())
    if name in visited or name not in all_distributions:
        continue
    visited.add(name)
    dist = all_distributions[name]
    if name != root_name:
        python_names.append(name)
    for raw_requirement in dist.requires or []:
        requirement = Requirement(raw_requirement)
        if requirement.marker is None or requirement.marker.evaluate({"extra": ""}):
            pending.append(canonicalize_name(requirement.name))

def license_filename(name: str) -> bool:
    lowered = name.lower()
    return lowered.startswith(("license", "copying", "notice", "copyright"))

lines = [
    "BOQUITAS PORTABLE - THIRD-PARTY NOTICES",
    "",
    "Runtime dependency versions and license identifiers come from installed package metadata.",
    "License texts are reproduced from the corresponding installed distributions when present.",
    "",
    "PYTHON RUNTIME DEPENDENCIES",
]
lines.extend(["", "CPython", f"Version: {sys.version.split()[0]}", "License: PSF-2.0"])
python_license = next(
    (
        candidate
        for candidate in (
            Path(sys.base_prefix) / "LICENSE.txt",
            Path(sys.base_prefix) / "LICENSE",
            Path(sys.prefix) / "LICENSE.txt",
        )
        if candidate.is_file()
    ),
    None,
)
if python_license is not None:
    lines.extend(["", "[CPython license file: LICENSE.txt]", ""])
    lines.append(python_license.read_text(encoding="utf-8", errors="replace").rstrip())
for name in sorted(python_names):
    dist = all_distributions[name]
    metadata = dist.metadata
    license_id = metadata.get("License-Expression") or metadata.get("License") or "Not specified"
    lines.extend(["", f"{metadata.get('Name', name)} {dist.version}", f"License: {license_id}"])
    urls = metadata.get_all("Project-URL") or []
    if urls:
        lines.append(f"Project: {urls[0]}")
    license_files = []
    for file in dist.files or []:
        relative = PurePosixPath(file.as_posix())
        if "/licenses/" not in f"/{relative.as_posix().lower()}/" and not license_filename(relative.name):
            continue
        source = Path(dist.locate_file(file))
        if source.is_file() and source.stat().st_size <= 2_000_000:
            license_files.append((relative.as_posix(), source))
    for relative, source in sorted(license_files):
        lines.extend(["", f"[{metadata.get('Name', name)} license file: {PurePosixPath(relative).name}]", ""])
        lines.append(source.read_text(encoding="utf-8", errors="replace").rstrip())

def package_json_path(name: str, requester: Path | None = None) -> Path | None:
    segments = Path(*name.split("/"))
    candidates: list[Path] = []
    if requester is not None:
        candidates.append(requester / "node_modules" / segments / "package.json")
    candidates.append(web_modules / segments / "package.json")
    current = requester
    while current is not None and current != web_root:
        candidates.append(current.parent / "node_modules" / segments / "package.json")
        current = current.parent
    return next((candidate.resolve() for candidate in candidates if candidate.is_file()), None)

web_manifest = json.loads((web_root / "package.json").read_text(encoding="utf-8"))
pending_js = [(name, None) for name in (web_manifest.get("dependencies") or {})]
visited_js: set[tuple[str, str]] = set()
lines.extend(["", "", "FRONTEND RUNTIME DEPENDENCIES"])
while pending_js:
    name, requester = pending_js.pop()
    manifest_path = package_json_path(name, requester)
    if manifest_path is None:
        continue
    package = json.loads(manifest_path.read_text(encoding="utf-8"))
    identity = (package.get("name", name), package.get("version", "unknown"))
    if identity in visited_js:
        continue
    visited_js.add(identity)
    lines.extend(["", f"{identity[0]} {identity[1]}", f"License: {package.get('license', 'Not specified')}"])
    if package.get("repository"):
        lines.append(f"Project: {package['repository']}")
    for candidate in sorted(manifest_path.parent.iterdir()):
        if candidate.is_file() and license_filename(candidate.name):
            lines.extend(["", f"[{identity[0]} license file: {candidate.name}]", ""])
            lines.append(candidate.read_text(encoding="utf-8", errors="replace").rstrip())
    dependencies = dict(package.get("dependencies") or {})
    dependencies.update(package.get("optionalDependencies") or {})
    pending_js.extend((dependency, manifest_path.parent) for dependency in dependencies)

target.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
'@
    $noticesPath = Join-Path $bundlePath "THIRD-PARTY-NOTICES.txt"
    $licenseCollector | & $pythonExe - $noticesPath (Join-Path $projectRoot "web")
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $noticesPath -PathType Leaf)) {
        throw "No se pudieron generar los avisos de licencias a partir de los metadatos instalados."
    }

    $manifestPath = Join-Path $bundlePath "MANIFEST-SHA256.txt"
    $manifestLines = @(
        "SHA-256 checksums for all release files except this manifest.",
        "Paths are relative to the extracted Boquitas-Windows-x64 folder and use forward slashes.",
        ""
    )
    $files = Get-ChildItem -LiteralPath $bundlePath -File -Recurse | Sort-Object FullName
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($bundlePath.Length).TrimStart([char]"\").Replace("\", "/")
        $digest = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $manifestLines += "$digest  $relative"
    }
    [System.IO.File]::WriteAllLines($manifestPath, $manifestLines, [System.Text.UTF8Encoding]::new($false))

    Compress-Archive -LiteralPath $bundlePath -DestinationPath $stagedZip -CompressionLevel Optimal
    if ((Test-Path -LiteralPath $finalBundle) -or (Test-Path -LiteralPath $finalZip)) {
        throw "La salida apareció durante el empaquetado. No se reemplazó ningún archivo existente."
    }
    [System.IO.Directory]::Move($bundlePath, $finalBundle)
    [System.IO.File]::Move($stagedZip, $finalZip)

    $resolvedOutput = [System.IO.Path]::GetFullPath($outputRoot).TrimEnd([char[]]@("\", "/"))
    $resolvedStage = [System.IO.Path]::GetFullPath($stageRoot).TrimEnd([char[]]@("\", "/"))
    $stagePrefix = $resolvedOutput + [System.IO.Path]::DirectorySeparatorChar
    if (
        $resolvedStage.StartsWith($stagePrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
        [System.IO.Path]::GetFileName($resolvedStage) -match '^\.Boquitas-build-[0-9a-f]{32}$'
    ) {
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
    Write-Host "Paquete creado: $finalBundle"
    Write-Host "ZIP creado: $finalZip"
}
catch {
    [Console]::Error.WriteLine("No se pudo crear el paquete portable: $($_.Exception.Message) Revise el staging $stageName antes de volver a intentarlo.")
    exit 1
}
