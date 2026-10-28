[CmdletBinding()]
param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"
$frontendIndex = Join-Path $projectRoot "web\dist\index.html"
$appUrl = "http://127.0.0.1:8000"
$healthUrl = "$appUrl/api/v1/health"

if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    [Console]::Error.WriteLine(
        "No se encontró el entorno Python local en '$pythonPath'. Ejecuta 'uv --cache-dir .uv-cache sync --frozen' desde la raíz del proyecto."
    )
    exit 1
}

if (-not (Test-Path -LiteralPath $frontendIndex -PathType Leaf)) {
    [Console]::Error.WriteLine(
        "No se encontró el frontend compilado en '$frontendIndex'. Ejecuta 'pnpm --dir web install --frozen-lockfile' y luego 'pnpm --dir web build' desde la raíz del proyecto."
    )
    exit 1
}

$portProbe = New-Object System.Net.Sockets.TcpClient
try {
    $connectAttempt = $portProbe.BeginConnect([System.Net.IPAddress]::Loopback, 8000, $null, $null)
    $connected = $connectAttempt.AsyncWaitHandle.WaitOne(250)
    if ($connected) {
        try {
            $portProbe.EndConnect($connectAttempt)
            if ($portProbe.Connected) {
                [Console]::Error.WriteLine(
                    "El puerto 8000 de 127.0.0.1 ya está ocupado. Cierra normalmente el servicio local que lo usa antes de iniciar Boquitas."
                )
                exit 1
            }
        }
        catch {
            # A refused connection means no service currently owns the port.
        }
    }
}
finally {
    if ($null -ne $connectAttempt) {
        $connectAttempt.AsyncWaitHandle.Close()
    }
    $portProbe.Close()
}

$serverProcess = $null
$exitCode = 0

try {
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $pythonPath
    $startInfo.Arguments = "-m boquitas"
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $false

    $serverProcess = New-Object System.Diagnostics.Process
    $serverProcess.StartInfo = $startInfo
    if (-not $serverProcess.Start()) {
        throw "No se pudo iniciar el Python local del proyecto."
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $healthy = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        $serverProcess.Refresh()
        if ($serverProcess.HasExited) {
            throw "El servidor terminó antes de responder. Revisa el mensaje de Python mostrado arriba."
        }

        try {
            $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 1
            if ($health.status -eq "ok" -and [int]$health.contract_version -eq 1) {
                $serverProcess.Refresh()
                if ($serverProcess.HasExited) {
                    throw "El proceso local terminó durante la comprobación de salud."
                }
                $healthy = $true
                break
            }
        }
        catch {
            # Keep polling while Uvicorn binds and starts serving.
        }

        Start-Sleep -Milliseconds 200
    }

    if (-not $healthy) {
        throw "Boquitas no respondió en 30 segundos en 127.0.0.1:8000. Revisa el mensaje de Python mostrado arriba."
    }

    if (-not $NoBrowser) {
        try {
            Start-Process -FilePath $appUrl | Out-Null
        }
        catch {
            [Console]::Error.WriteLine(
                "Boquitas está lista en $appUrl, pero no se pudo abrir el navegador automáticamente: $($_.Exception.Message)"
            )
        }
    }

    Write-Host "Boquitas está lista en $appUrl. Mantén esta consola abierta; Ctrl+C detiene el servidor."
    $serverProcess.WaitForExit()
    $serverProcess.Refresh()
    if ($serverProcess.ExitCode -ne 0) {
        $exitCode = $serverProcess.ExitCode
    }
}
catch {
    $exitCode = 1
    [Console]::Error.WriteLine("Boquitas no pudo continuar: $($_.Exception.Message)")
}
finally {
    if ($null -ne $serverProcess) {
        $serverProcess.Refresh()
        if (-not $serverProcess.HasExited) {
            try {
                $serverProcess.Kill()
                $serverStopped = $serverProcess.WaitForExit(5000)
                if (-not $serverStopped) {
                    [Console]::Error.WriteLine(
                        "El proceso local de Boquitas sigue activo después de solicitar su cierre."
                    )
                    $exitCode = 1
                }
            }
            catch {
                [Console]::Error.WriteLine(
                    "No se pudo cerrar el proceso local de Boquitas: $($_.Exception.Message)"
                )
                $exitCode = 1
            }
        }
        $serverProcess.Dispose()
    }
}

exit $exitCode
