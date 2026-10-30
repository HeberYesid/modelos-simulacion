from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EVIDENCE = ROOT / "docs/field-kit/existing-visits/evidence.json"
DEFAULT_OUTPUT = ROOT / "web/src/replay/observed-visits.json"
VISIT_PRESENTATION = {
    "visit_2026-10-20_tuesday_promotion": {
        "warning_ids": [
            "tuesday_station_ids_local",
            "tuesday_initial_wait_unknown",
            "timezone_unconfirmed",
            "elapsed_windows_not_active_work",
            "delivery_overlap_conflict",
        ],
    },
    "visit_2026-10-23_regular": {
        "warning_ids": [
            "friday_link_scope",
            "friday_other_initial_work_unknown",
            "timezone_unconfirmed",
            "elapsed_windows_not_active_work",
            "confirmed_pause_boundaries_unknown",
        ],
    },
}
RAW_FIELDS = (
    "lugar",
    "fecha",
    "tipo_dia",
    "personal",
    "id",
    "hora_llegada",
    "hora_inicio",
    "hora_fin",
    "hora_se_fue",
)


def read_and_verify_sources(evidence: dict[str, Any]) -> dict[str, list[dict[str, str]]]:
    sources: dict[str, list[dict[str, str]]] = {}
    for source in evidence["sources"]:
        path = Path(source["path"])
        if not path.is_absolute():
            path = ROOT / path
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if digest != source["sha256"]:
            raise ValueError(f"SHA-256 mismatch for {source['source_id']}: {digest}")
        text = raw.decode("utf-8-sig")
        rows = list(csv.DictReader(text.splitlines()))
        if len(rows) != source["record_count"]:
            raise ValueError(
                f"Row-count mismatch for {source['source_id']}: "
                f"expected {source['record_count']}, got {len(rows)}"
            )
        if any(tuple(row) != RAW_FIELDS for row in rows):
            raise ValueError(f"Unexpected CSV fields in {source['source_id']}")
        sources[source["source_id"]] = rows
    return sources


def build_export(evidence: dict[str, Any]) -> dict[str, Any]:
    source_rows = read_and_verify_sources(evidence)
    evidence_sources = {item["source_id"]: item for item in evidence["sources"]}
    confirmed_links = {
        reference["record_id"]: join["confirmed_order_reference"]
        for join in evidence["confirmed_order_joins"]
        for reference in join["record_references"]
    }
    visits = []
    for source_visit in evidence["visits"]:
        visit_id = source_visit["visit_id"]
        presentation = VISIT_PRESENTATION[visit_id]
        source_manifest = []
        for source_id in source_visit["source_ids"]:
            source = evidence_sources[source_id]
            rows = source_rows[source_id]
            source_manifest.append(
                {
                    "source_id": source_id,
                    "sha256": source["sha256"],
                    "record_count": len(rows),
                }
            )
        records = []
        for record in evidence["records"]:
            if record["visit_id"] != visit_id:
                continue
            source_id = record["source_id"]
            row_index = record["source_line"] - 2
            source_record = source_rows[source_id][row_index]
            raw_fields = {field: record["raw_fields"][field] for field in RAW_FIELDS}
            if source_record != raw_fields:
                raise ValueError(
                    f"Raw-field mismatch for {record['record_id']} at physical line "
                    f"{record['source_line']}"
                )
            portable_record = {
                key: record[key]
                for key in (
                    "record_id",
                    "source_id",
                    "source_line",
                    "station",
                    "station_local_id",
                )
            }
            portable_record["raw_fields"] = raw_fields
            if record["record_id"] in confirmed_links:
                portable_record["confirmed_link_id"] = confirmed_links[record["record_id"]]
            records.append(portable_record)
        expected_count = sum(item["record_count"] for item in source_manifest)
        if len(records) != expected_count:
            raise ValueError(f"Archive record-count mismatch for {visit_id}")
        visits.append(
            {
                "visit_id": visit_id,
                "label": f"{source_visit['day_type_as_recorded']} · visita medida",
                "date": source_visit["visit_date"],
                "start_time": source_visit["actual_observation_start_at"].split("T", 1)[1],
                "end_time": source_visit["actual_observation_end_at"].split("T", 1)[1],
                "duration_s": source_visit["observation_window_elapsed_s"],
                "sources": source_manifest,
                "records": records,
                "warning_ids": presentation["warning_ids"],
            }
        )
    return {"dataset_version": 1, "visits": visits}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify the measured visit sources and export their sanitized replay data."
    )
    parser.add_argument("--evidence", type=Path, default=DEFAULT_EVIDENCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true", help="fail if output differs; do not write")
    args = parser.parse_args()

    evidence = json.loads(args.evidence.read_text(encoding="utf-8"))
    exported = build_export(evidence)
    total_records = sum(len(visit["records"]) for visit in exported["visits"])
    content = json.dumps(exported, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not args.output.exists() or args.output.read_text(encoding="utf-8") != content:
            raise SystemExit(f"Observed replay data is stale: {args.output}")
        print(f"Verified {total_records} source records and {args.output}")
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(content, encoding="utf-8", newline="\n")
    print(f"Exported {total_records} source records to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
