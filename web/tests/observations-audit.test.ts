import { describe, expect, it } from "vitest";
import type { ImportReport } from "../src/api/types";
import { renderObservationsView } from "../src/components/observations";

describe("observation report rendering", () => {
  it("keeps the report focused on the observed summary", () => {
    const report: ImportReport = {
      contract_version: 1,
      correction_policy: "boquitas-2026-10-20-v1",
      corrections: [{
        action: "replace_field",
        after: "17:46:20",
        before: null,
        field: "hora_fin",
        line_number: 94,
        reason: "Correct the recorded cashier end time per the approved 2026-10-20 correction.",
        row_key: "2026-10-20|caja|35",
        status: "already_reflected",
      }],
      excluded_rows: [],
      fatal_error: false,
      issues: [{
        affected_view: "both",
        code: "overlapping_intervals",
        fields: [],
        line_numbers: [62, 63],
        message: "Overlapping intervals.",
        row_keys: [],
        severity: "warning",
      }],
      normalized_rows: [],
      policy_status: "already_reflected",
      raw_rows: [],
      source_name: "visita.csv",
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

    expect(rendered.querySelector("#station-summary-title")?.textContent).toBe("Segmentos observados");
    expect(rendered.querySelector("#corrections-title")).toBeNull();
    expect(rendered.querySelector("#issues-title")).toBeNull();
    expect(rendered.textContent).not.toContain("Correcciones y exclusiones");
    expect(rendered.textContent).not.toContain("Diagnósticos");
    expect(rendered.textContent).not.toContain("Ver filas afectadas");
  });
});
