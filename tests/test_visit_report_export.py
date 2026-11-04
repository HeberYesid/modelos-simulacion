from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_export_preloads_both_visits_with_native_audit_reports(tmp_path: Path) -> None:
    reports_path = tmp_path / "reports.json"
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/export_observed_visits.py"),
            "--output", str(tmp_path / "archive.json"),
            "--reports-output", str(reports_path),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    visits = json.loads(reports_path.read_text(encoding="utf-8"))["visits"]
    assert len(visits) == 2
    tuesday, friday = [visit["report"] for visit in visits]
    assert len(tuesday["normalized_rows"]) == 119
    assert tuesday["policy_status"] == "already_reflected"
    assert sum(row["outcome"] == "withdrawn" for row in tuesday["normalized_rows"]) == 3
    assert len(friday["normalized_rows"]) == 16
    assert {(s["station"], s["row_count"]) for s in friday["station_summaries"]} == {
        ("caja", 8), ("entrega", 8),
    }
    delivery = next(s for s in tuesday["station_summaries"] if s["station"] == "entrega")
    assert delivery["concurrency"]["peak_concurrency"] == 6
    assert delivery["concurrency"]["exceeds_capacity"] is True
    for report in (tuesday, friday):
        assert report["fatal_error"] is False
        assert all(row["group_size"] is None for row in report["normalized_rows"])
