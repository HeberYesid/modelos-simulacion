import { describe, expect, it } from "vitest";
import { preloadedVisitReport, renderVisitDataPicker } from "../src/components/visit-data";

describe("preloaded visit audit", () => {
  it("offers both visits and preserves their independent native reports", () => {
    const tuesday = preloadedVisitReport("visit_2026-10-20_tuesday_promotion");
    const friday = preloadedVisitReport("visit_2026-10-23_regular");
    expect(tuesday?.normalized_rows).toHaveLength(119);
    expect(friday?.normalized_rows).toHaveLength(16);
    expect(tuesday?.policy_status).toBe("already_reflected");
    expect(tuesday?.normalized_rows.filter(row => row.outcome === "withdrawn")).toHaveLength(3);
    const root = document.createElement("div");
    root.innerHTML = renderVisitDataPicker("visit_2026-10-20_tuesday_promotion", false);
    expect(root.querySelectorAll("[data-visit-report]")).toHaveLength(2);
    expect(root.querySelector('[aria-pressed="true"]')?.textContent).toContain("Martes 20/10");
    expect(root.textContent).toContain("119");
    expect(root.textContent).toContain("16");
    tuesday!.normalized_rows.length = 0;
    expect(preloadedVisitReport("visit_2026-10-20_tuesday_promotion")?.normalized_rows).toHaveLength(119);
    expect(preloadedVisitReport("missing")).toBeNull();
  });
});
