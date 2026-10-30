import { describe, expect, it } from "vitest";
import demoScenario from "../contracts/fixtures/demo-scenario.json";
import workLimits from "../contracts/work-limits.json";
import type { Scenario } from "../src/api/types";
import { newInitialOrder, renderScenarioView, validateInitialPersonLimits } from "../src/components/scenario-editor";
import { ServiceError } from "../src/services/api";

function editorOptions(scenario: Scenario) {
  return {
    scenario,
    scenarios: [scenario],
    activeScenarioIndex: 0,
    replications: 30,
    pending: false,
    error: null,
    failedFields: [],
  };
}

describe("simulation work limits in the scenario editor", () => {
  it("keeps oversized staffing visible without allocating an oversized worker list", () => {
    const scenario = structuredClone(demoScenario) as unknown as Scenario;
    scenario.engine_config.mode = "regular";
    scenario.engine_config.integrated_workers = 4_294_967_296;
    scenario.engine_config.cashiers = 0;
    scenario.engine_config.preparers = 0;
    scenario.initial_state = [{
      order_id: "opening-order",
      person_ids: ["person-1"],
      arrival_s: null,
      stage: "preparing",
      queue_rank: null,
      worker_id: null,
      remaining_s: 10,
      patience_remaining_s: null,
      payment_active_s: null,
      transfer_wait_s: null,
      preparation_s: 10,
    }];

    expect(() => renderScenarioView(editorOptions(scenario))).not.toThrow();
    document.body.innerHTML = renderScenarioView(editorOptions(scenario));

    const staffing = document.querySelector<HTMLInputElement>("#integrated-workers");
    const worker = document.querySelector<HTMLSelectElement>('[data-initial-field="0.worker_id"]');
    expect(staffing?.value).toBe("4294967296");
    expect(staffing?.max).toBe(String(workLimits.max_workers_per_pool));
    expect(worker?.options).toHaveLength(1);
  });

  it("keeps an oversized group draft intact while showing its explicit maximum", () => {
    const scenario = structuredClone(demoScenario) as unknown as Scenario;
    scenario.group_sizes = [{ size: 51, probability: 1 }];

    document.body.innerHTML = renderScenarioView(editorOptions(scenario));

    const groupSize = document.querySelector<HTMLInputElement>("[data-group-field='size']");
    expect(groupSize?.value).toBe("51");
    expect(groupSize?.max).toBe(String(workLimits.max_group_size));
  });

  it("stops adding group-size options at the declared limit", () => {
    const scenario = structuredClone(demoScenario) as unknown as Scenario;
    scenario.group_sizes = Array.from({ length: workLimits.max_group_size }, (_, index) => ({
      size: index + 1,
      probability: 1 / workLimits.max_group_size,
    }));

    document.body.innerHTML = renderScenarioView(editorOptions(scenario));

    expect(document.querySelector<HTMLButtonElement>("[data-add-group]")?.disabled).toBe(true);
    expect(document.querySelectorAll("[data-group-row]")).toHaveLength(workLimits.max_group_size);
  });

  it("stops adding initial orders at the declared limit", () => {
    const scenario = structuredClone(demoScenario) as unknown as Scenario;
    scenario.initial_state = Array.from({ length: workLimits.max_initial_orders }, (_, index) => ({
      ...newInitialOrder(),
      order_id: `opening-${index + 1}`,
      person_ids: [`person-${index + 1}`],
      queue_rank: index,
    }));

    document.body.innerHTML = renderScenarioView(editorOptions(scenario));

    expect(document.querySelector<HTMLButtonElement>("[data-add-initial]")?.disabled).toBe(true);
    expect(document.querySelectorAll("[data-initial-order]")).toHaveLength(workLimits.max_initial_orders);
  });

  it("marks excess initial people without removing their identifiers", () => {
    const form = document.createElement("form");
    const identifiers = Array.from({ length: 51 }, (_, index) => `person-${index + 1}`).join("\n");
    form.innerHTML = `<textarea data-initial-field="0.person_ids">${identifiers}</textarea>`;

    const invalid = validateInitialPersonLimits(form);

    expect(invalid?.validity.valid).toBe(false);
    expect(invalid?.validationMessage).toContain(`${workLimits.max_group_size} personas`);
    expect(invalid?.value.split("\n")).toHaveLength(51);
  });

  it("marks the total initial-person limit across orders", () => {
    const form = document.createElement("form");
    const oneOrder = Array.from({ length: 50 }, (_, index) => `person-${index + 1}`).join("\n");
    form.innerHTML = Array.from({ length: 201 }, (_, index) =>
      `<textarea data-initial-field="${index}.person_ids">${oneOrder}</textarea>`,
    ).join("");

    const invalid = validateInitialPersonLimits(form);

    expect(invalid).toBe(form.querySelectorAll("textarea")[200]);
    expect(invalid?.validationMessage).toMatch(/10[.,]000 personas/);
  });

  it("explains cancellation, timeout, busy, and experiment-budget errors in Spanish", () => {
    expect(new ServiceError(409, { code: "execution_cancelled" }).message).toContain("resultado anterior");
    expect(new ServiceError(408, { code: "execution_timed_out" }).message).toContain("Reduce la carga");
    expect(new ServiceError(409, { code: "execution_busy" }).message).toContain("Espera a que termine");
    expect(new ServiceError(422, { code: "experiment_workload_limit_exceeded" }).message).toContain("Reduce la cantidad");
  });
});
