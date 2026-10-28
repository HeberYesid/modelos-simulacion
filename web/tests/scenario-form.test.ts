import { describe, expect, it } from "vitest";
import demoScenario from "../contracts/fixtures/demo-scenario.json";
import type { Scenario } from "../src/api/types";
import { collectScenarioDraft, renderScenarioView } from "../src/components/scenario-editor";

describe("scenario form data round trip", () => {
  it("preserves finite decimal values and group sizes larger than 999", () => {
    const scenario = structuredClone(demoScenario) as unknown as Scenario;
    scenario.interarrival = { kind: "exponential", mean_s: 0.123456789123 };
    scenario.group_sizes = [
      { size: 1000, probability: 0.123456789123 },
      { size: 1, probability: 0.876543210877 },
    ];

    document.body.innerHTML = renderScenarioView({
      scenario,
      scenarios: [scenario],
      activeScenarioIndex: 0,
      replications: 30,
      pending: false,
      error: null,
      failedFields: [],
    });
    const form = document.querySelector<HTMLFormElement>("#scenario-form");
    expect(form).not.toBeNull();
    const distributionKind = form?.querySelector<HTMLSelectElement>('[data-distribution-kind="interarrival"]');
    if (distributionKind) distributionKind.value = "exponential";
    expect(form?.querySelector<HTMLInputElement>('[data-group-field="size"]')?.value).toBe("1000");
    expect(form?.querySelector<HTMLInputElement>("#root-seed")?.value).toBe("20261020");

    const draft = collectScenarioDraft(form as HTMLFormElement, scenario).scenario;

    expect(draft.interarrival).toEqual({ kind: "exponential", mean_s: 0.123456789123 });
    expect(draft.group_sizes).toEqual([
      { size: 1000, probability: 0.123456789123 },
      { size: 1, probability: 0.876543210877 },
    ]);
    expect(draft.default_root_seed).toBe(20261020);
  });
});
