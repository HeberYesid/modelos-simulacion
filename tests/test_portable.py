"""Exercise the portable launcher's public HTTP and process boundaries."""

from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

import pytest

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / "scripts" / "portable_entry.py"


def _free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


@contextmanager
def _running_entry(cwd: Path, port: int):
    process = subprocess.Popen(
        [sys.executable, str(ENTRY), "--no-browser", "--port", str(port)],
        cwd=cwd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )
    try:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            assert process.poll() is None, "Portable entry exited before serving the application"
            try:
                with urlopen(f"http://127.0.0.1:{port}/api/v1/health", timeout=0.5) as response:
                    assert json.loads(response.read()) == {"status": "ok", "contract_version": 1}
                    break
            except (OSError, URLError):
                time.sleep(0.1)
        else:
            pytest.fail("Portable entry did not become healthy within 30 seconds")
        yield process
    finally:
        if process.poll() is None:
            if os.name == "nt":
                process.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
                pytest.fail("Portable entry did not stop after the console signal")


def test_portable_entry_serves_from_another_working_directory_and_restarts(tmp_path: Path) -> None:
    port = _free_port()
    for _ in range(2):
        with _running_entry(tmp_path, port):
            with urlopen(f"http://127.0.0.1:{port}/", timeout=5) as response:
                assert response.status == 200
                assert b"<html" in response.read()
            with urlopen(f"http://127.0.0.1:{port}/api/v1/demo", timeout=5) as response:
                assert json.loads(response.read())["scenario"]["provenance"] == "synthetic_demo"
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", port))


def test_portable_entry_reports_busy_port_and_preserves_its_owner(tmp_path: Path) -> None:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        port = listener.getsockname()[1]
        result = subprocess.run(
            [sys.executable, str(ENTRY), "--no-browser", "--port", str(port)],
            cwd=tmp_path,
            capture_output=True,
            timeout=15,
            check=False,
        )
        assert result.returncode != 0
        assert str(port).encode() in result.stdout + result.stderr
        assert b"ocup" in (result.stdout + result.stderr).lower()
        assert listener.getsockname() == ("127.0.0.1", port)


def test_portable_entry_reports_missing_interface_before_starting(tmp_path: Path) -> None:
    # A relocated entry without its assets must fail rather than serve a bare API.
    entry = tmp_path / "scripts" / "portable_entry.py"
    entry.parent.mkdir()
    entry.write_bytes(ENTRY.read_bytes())
    result = subprocess.run(
        [sys.executable, str(entry), "--no-browser", "--port", str(_free_port())],
        cwd=tmp_path,
        capture_output=True,
        timeout=15,
        check=False,
    )
    assert result.returncode != 0
    assert b"index.html" in result.stdout + result.stderr
