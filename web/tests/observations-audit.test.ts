import { describe, expect, it } from "vitest";
import type { ImportIssue, ImportReport, ObservationRow } from "../src/api/types";
import { renderObservationsView } from "../src/components/observations";

function duplicateRow(lineNumber: number): ObservationRow {
  return {
    line_number: lineNumber,
    qualified_key: "entrega:2026-10-22:duplicate-id",
    local_id: "duplicate-id",
    station: "entrega",
    outcome: "served",
    group_size_reason: "not_observed",
    validity_flags: [],
    quality_flags: [],
    raw_fields: [],
  };
}

describe("observation audit rendering", () => {
  it("keeps distinct source lines with the same qualified key in a duplicate-key issue", () => {
    const rowFive = duplicateRow(5);
    const rowSeven = duplicateRow(7);
    const issue: ImportIssue = {
      affected_view: "both",
      code: "duplicate_qualified_key",
      fields: [],
      line_numbers: [5, 7],
      message: "Duplicate qualified key.",
      row_keys: ["entrega:2026-10-22:duplicate-id"],
      severity: "warning",
    };
    const report: ImportReport = {
      contract_version: 1,
      correction_policy: "none",
      corrections: [],
      excluded_rows: [],
      fatal_error: false,
      issues: [issue],
      normalized_rows: [rowFive, rowSeven],
      policy_status: "none",
      raw_rows: [rowFive, rowSeven],
      source_name: "duplicate.csv",
      source_sha256: "a".repeat(64),
      station_summaries: [],
    };

    const rendered = document.createElement("div");
    rendered.innerHTML = renderObservationsView({
      report,
      failureReport: null,
      mode: "file",
      pending: false,
      error: null,
    });
    const lines = [...rendered.querySelectorAll('[data-issue-code="duplicate_qualified_key"] tbody tr')]
      .map((row) => row.querySelector("td")?.textContent?.trim());

    expect(lines).toEqual(["5", "7"]);
  });
});
