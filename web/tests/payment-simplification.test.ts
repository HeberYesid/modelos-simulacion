import { describe, expect, it } from "vitest";
import demoScenario from "../contracts/fixtures/demo-scenario.json";
import type { Scenario } from "../src/api/types";
import { collectScenarioDraft, renderScenarioView, scenarioToDraft, scenarioDraftToWire } from "../src/components/scenario-editor";

describe("simple payment editing", () => {
  it("edits only the payment method and removes confirmation waits from new scenario files", () => {
    const saved = structuredClone(demoScenario) as unknown as Scenario;
    saved.initial_state = [{
      order_id: "opening-order", person_ids: ["opening-person"], stage: "waiting_payment",
      arrival_s: null, queue_rank: 0, worker_id: null, remaining_s: null,
      patience_remaining_s: null, payment_active_s: 2, transfer_wait_s: 60, preparation_s: 3,
    }];
    const draft = scenarioToDraft(saved);
    document.body.innerHTML = renderScenarioView({
      scenario: draft, scenarios: [draft], activeScenarioIndex: 0, replications: 1,
      pending: false, error: null, failedFields: [],
    });
    const form = document.querySelector<HTMLFormElement>("#scenario-form")!;
    expect(form.querySelector('[data-distribution-row="transfer_confirmation"]')).toBeNull();
    expect(form.querySelector('[data-initial-field="0.transfer_wait_s"]')).toBeNull();
    const method = form.querySelector<HTMLSelectElement>('[data-initial-field="0.payment_method"]');
    expect(method).not.toBeNull();
    method!.value = "transfer";
    for (const control of form.querySelectorAll<HTMLSelectElement>("[data-distribution-kind]")) {
      const key = control.dataset.distributionKind as "interarrival" | "payment_active" | "preparation";
      control.value = draft[key].kind;
    }
    const wire = scenarioDraftToWire(collectScenarioDraft(form, draft).scenario)!;
    expect(wire.transfer_confirmation).toEqual({ kind: "constant", value_s: 0 });
    expect(wire.initial_state[0]).toMatchObject({ transfer_wait_s: 0, payment_method: "transfer" });
    expect(saved.initial_state[0]?.transfer_wait_s).toBe(60);
  });
});
