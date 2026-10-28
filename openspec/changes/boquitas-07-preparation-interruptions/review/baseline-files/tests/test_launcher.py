from __future__ import annotations

import json
import os
import shutil
import signal
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

import pytest

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "start-boquitas.ps1"
HEALTH_URL = "http://127.0.0.1:8000/api/v1/health"


def _powershell() -> str:
    executable = shutil.which("powershell.exe") or shutil.which("pwsh.exe")
    if os.name != "nt" or executable is None:
        pytest.skip("The local launcher is a Windows PowerShell script.")
    return executable


def _run_launcher(
    script: Path,
    *,
    cwd: Path,
    timeout: float = 10,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [_powershell(), "-NoLogo", "-NoProfile", "-File", str(script), "-NoBrowser"],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _port_is_free() -> bool:
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", 8000))
        except OSError:
            return False
        return True


def _wait_for_health(process: subprocess.Popen[bytes], timeout: float = 30) -> None:
    deadline = time.monotonic() + timeout
    last_error = "server did not answer"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise AssertionError(f"launcher exited before health check ({process.returncode})")
        try:
            with urlopen(HEALTH_URL, timeout=0.5) as response:
                assert response.status == 200
                assert response.headers.get_content_type() == "application/json"
                assert json.loads(response.read()) == {
                    "status": "ok",
                    "contract_version": 1,
                }
                return
        except (OSError, URLError) as error:
            last_error = str(error)
            time.sleep(0.1)
    raise AssertionError(f"launcher did not serve {HEALTH_URL}: {last_error}")


def _stop_launcher(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is None:
        process.send_signal(signal.CTRL_BREAK_EVENT)
        process.wait(timeout=10)


def test_launcher_reports_missing_frontend_build_with_setup_path() -> None:
    with tempfile.TemporaryDirectory(dir=ROOT) as directory:
        project = Path(directory)
        script = project / "start-boquitas.ps1"
        shutil.copyfile(LAUNCHER, script)
        python = project / ".venv" / "Scripts" / "python.exe"
        python.parent.mkdir(parents=True)
        python.touch()

        result = _run_launcher(script, cwd=project)

    assert result.returncode != 0
    message = (result.stdout + result.stderr).replace("\\", "/")
    assert "web/dist/index.html" in message


def test_launcher_reports_busy_port_without_disrupting_listener() -> None:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 8000))
        listener.listen()

        result = _run_launcher(LAUNCHER, cwd=ROOT)

        assert result.returncode != 0
        message = (result.stdout + result.stderr).lower()
        assert "8000" in message
        assert "ocup" in message or "in use" in message or "busy" in message
        assert listener.getsockname() == ("127.0.0.1", 8000)


def test_launcher_serves_health_and_ctrl_c_releases_port() -> None:
    for _ in range(2):
        if not _port_is_free():
            pytest.skip("Port 8000 is already occupied by another local process.")

        process = subprocess.Popen(
            [_powershell(), "-NoLogo", "-NoProfile", "-File", str(LAUNCHER), "-NoBrowser"],
            cwd=ROOT,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        try:
            _wait_for_health(process)
        finally:
            _stop_launcher(process)

        assert _port_is_free()
