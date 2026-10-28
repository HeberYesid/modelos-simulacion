"""Check a Windows release through its executable and HTTP API, with no dev PATH.

Run with the build computer's Python, not with a Python on the destination:
    python scripts/check_portable.py PATH_TO_EXTRACTED_BUNDLE
This is an integration check, not evidence of a second physical machine.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import signal
import socket
import subprocess
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import ProxyHandler, Request, build_opener

REFERENCE_SHA256 = "8bbe6b117f59dde367816d8ed63bb013b0ad624d916a57159c084fcff4051dd7"
REFERENCE_API_SHA256 = "f854666a3bec3133f772a01292f514dfa6ab6b8716d65f654c9830f3b784053c"
HTTP = build_opener(ProxyHandler({}))


def request(url: str, payload: object | None = None) -> bytes:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {} if data is None else {"Content-Type": "application/json"}
    with HTTP.open(Request(url, data=data, headers=headers), timeout=60) as response:
        assert response.status == 200, f"Unexpected HTTP status for {url}"
        return response.read()


def upload(url: str, filename: str, content: bytes) -> dict:
    boundary = "boquitas-portable-check-boundary"
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
        f'filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    with HTTP.open(Request(url, data=body, headers=headers), timeout=60) as response:
        assert response.status == 200
        return json.loads(response.read())


def clean_environment() -> dict[str, str]:
    # Keep Windows process/browser requirements, but exclude all developer tools,
    # Python settings and proxy configuration from the executable's environment.
    names = {"systemroot", "windir", "comspec", "temp", "tmp", "userprofile", "localappdata"}
    environment = {key: value for key, value in os.environ.items() if key.lower() in names}
    environment["PATH"] = str(Path(os.environ["SystemRoot"]) / "System32")
    return environment


def verify_manifest(bundle: Path) -> int:
    checked: set[str] = set()
    for line in (bundle / "MANIFEST-SHA256.txt").read_text(encoding="utf-8-sig").splitlines():
        match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
        if match is None:
            continue
        expected, relative = match.groups()
        file = (bundle / relative).resolve()
        assert file.is_relative_to(bundle), f"Manifest path outside release: {relative}"
        assert relative not in checked, f"Duplicate manifest path: {relative}"
        assert hashlib.sha256(file.read_bytes()).hexdigest() == expected, relative
        checked.add(relative)
    actual = {
        file.relative_to(bundle).as_posix()
        for file in bundle.rglob("*")
        if file.is_file() and file.name != "MANIFEST-SHA256.txt"
    }
    assert checked and checked == actual, "Manifest must cover every release file"
    return len(checked)


def stop(process: subprocess.Popen) -> None:
    if process.poll() is None:
        process.send_signal(signal.CTRL_BREAK_EVENT)
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
            raise AssertionError("Portable server did not stop after Ctrl+Break") from None


def verify_http(base: str, bundle: Path) -> dict:
    index = request(base + "/").decode("utf-8")
    assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', index)
    assert assets, "Built frontend has no local assets"
    for asset in assets:
        assert request(base + asset), asset

    demo = json.loads(request(base + "/api/v1/demo"))
    payload = {"scenario": demo["scenario"], "root_seed": 20261020, "replication_index": 0}
    run_bytes = request(base + "/api/v1/runs", payload)
    digest = hashlib.sha256(run_bytes).hexdigest()
    # The HTTP adapter uses compact JSON; the historical export is indented.
    # Verify both the API bytes and equality with the preserved export's values.
    assert digest == REFERENCE_API_SHA256, "Frozen V1 HTTP bytes changed"
    run = json.loads(run_bytes)
    reference = (
        Path(__file__).resolve().parents[1] / "openspec" / "changes"
        / "boquitas-06-validation-and-delivery" / "reference-demo-run.json"
    ).read_bytes()
    assert hashlib.sha256(reference).hexdigest() == REFERENCE_SHA256
    assert run == json.loads(reference), "Frozen V1 run changed the scientific reference"
    reopened = upload(base + "/api/v1/files/validate", "synthetic-run.json", run_bytes)
    assert reopened["kind"] == "run" and reopened["value"] == run
    tables = json.loads(request(base + "/api/v1/exports/csv", {"result": run}))["tables"]
    assert {"orders.csv", "people.csv", "events.csv", "metrics.csv"} <= set(tables)

    v2 = json.loads((bundle / "ejemplos" / "pausa-programada-v2.json").read_bytes())
    v2_result = json.loads(request(base + "/api/v1/runs", {**payload, "scenario": v2}))
    assert v2_result["contract_version"] == 2
    events = v2_result["trace"]["events"]
    assert any(event["type"] == "preparation_paused" for event in events)
    assert any(event["type"] == "preparation_resumed" for event in events)
    v2_reopened = upload(
        base + "/api/v1/files/validate", "synthetic-v2.json", json.dumps(v2_result).encode()
    )
    assert v2_reopened["value"] == v2_result

    regular = json.loads(json.dumps(demo["scenario"]))
    regular["scenario_id"] = "portable-regular-check"
    regular["engine_config"]["mode"] = "regular"
    regular["engine_config"]["cashiers"] = 0
    regular["engine_config"]["preparers"] = 0
    regular["engine_config"]["integrated_workers"] = 1
    regular["engine_config"]["horizon_s"] = 1800
    regular_run = json.loads(request(base + "/api/v1/runs", {**payload, "scenario": regular}))
    assert regular_run["scenario"]["engine_config"]["mode"] == "regular"
    candidate = json.loads(json.dumps(regular))
    candidate["scenario_id"] = "portable-two-workers-check"
    candidate["engine_config"]["integrated_workers"] = 2
    experiment = json.loads(request(base + "/api/v1/experiments", {
        "scenarios": [regular, candidate], "root_seed": 20261020, "replications": 30,
    }))
    assert experiment["status"] == "complete" and experiment["n_requested"] == 30
    assert len(experiment["replication_results"]) == 60

    observations = (
        b"lugar,fecha,tipo_dia,personal,id,hora_llegada,hora_inicio,hora_fin,hora_se_fue\n"
        b"caja,2026-10-20,Ejemplo,1,1,15:00:00,15:00:10,15:00:40,\n"
        b"entrega,2026-10-20,Ejemplo,4,1,15:01:00,15:01:15,15:03:00,\n"
    )
    imported = upload(base + "/api/v1/observations/import", "synthetic.csv", observations)
    assert len(imported["raw_rows"]) == 2 and imported["policy_status"] == "none"
    return {
        "local_assets": len(assets), "v1_api_sha256": digest,
        "v1_reference_sha256": REFERENCE_SHA256,
        "v1_v2_save_reopen": "passed", "regular_run": "passed",
        "experiment_replications": 60, "csv_export": "passed",
        "synthetic_observation_import": "passed",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--report", type=Path)
    arguments = parser.parse_args()
    assert os.name == "nt", "This release check requires Windows"
    bundle = arguments.bundle.resolve(strict=True)
    executable = bundle / "Boquitas.exe"
    assert executable.is_file(), executable
    environment = clean_environment()
    command = [str(executable), "--no-browser"]
    report = {"manifest_files": verify_manifest(bundle), "developer_tools_on_path": False}
    with socket.socket() as available:
        available.bind(("127.0.0.1", 0))
        port = available.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    # Launch outside the release directory: all resources must resolve from the bundle.
    log_path = bundle.parent / "portable-check.log"
    for cycle in range(2):
        with log_path.open("ab") as log:
            process = subprocess.Popen(
                [*command, "--port", str(port)], cwd=bundle.parent,
                env=environment, stdout=log, stderr=log,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
            )
            try:
                deadline = time.monotonic() + 60
                while time.monotonic() < deadline:
                    assert process.poll() is None, f"Portable server exited; inspect {log_path}"
                    try:
                        health = json.loads(request(base + "/api/v1/health"))
                        assert health == {"status": "ok", "contract_version": 1}
                        break
                    except (OSError, URLError):
                        time.sleep(0.1)
                else:
                    raise AssertionError(f"Portable server startup timed out; inspect {log_path}")
                if cycle == 0:
                    report.update(verify_http(base, bundle))
            finally:
                stop(process)
        with socket.socket() as available:
            available.bind(("127.0.0.1", port))
    report["start_stop_cycles"] = 2
    with socket.socket() as occupied:
        occupied.bind(("127.0.0.1", port))
        occupied.listen()
        result = subprocess.run(
            [*command, "--port", str(port)], cwd=bundle.parent, env=environment,
            capture_output=True, timeout=30, check=False,
        )
        assert result.returncode != 0
        assert b"ocup" in (result.stdout + result.stderr).lower()
        assert occupied.getsockname() == ("127.0.0.1", port)
    report["occupied_port_preserved"] = True
    report["status"] = "passed"
    report["limitation"] = "Relocated bundle on build host; destination hardware not tested."
    if arguments.report:
        arguments.report.parent.mkdir(parents=True, exist_ok=True)
        arguments.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
