import { describe, expect, it } from "vitest";
import demoScenario from "../contracts/fixtures/demo-scenario.json";
import scenarioV2Fixture from "../contracts/fixtures/sample-scenario-v2.json";
import type { ScenarioDraft, ScenarioV1, ScenarioV2 } from "../src/api/types";
import {
  clearInterruptionSchedule,
  collectScenarioDraft,
  disableInterruptionPolicy,
  enableInterruptionPolicy,
  renderScenarioView,
  scenarioDraftToWire,
  scenarioToDraft,
} from "../src/components/scenario-editor";

function scriptedScenario(): ScenarioDraft {
  return scenarioToDraft(structuredClone(scenarioV2Fixture) as unknown as ScenarioV2);
}

describe("scripted preparation interruption editing", () => {
  it("shows the explicit schedule with labeled controls and its user-assumption scope", () => {
    const scenario = scriptedScenario();
    const markup = renderScenarioView({
      scenario,
      scenarios: [scenario],
      activeScenarioIndex: 0,
      replications: 3,
      pending: false,
      error: null,
      failedFields: [],
    });

    expect(markup).toContain("Pausas programadas para cobrar");
    expect(markup).toContain('data-interruption-schedule');
    expect(markup).toContain('data-interruption-at="0"');
    expect(markup).toContain('data-suspended-order-id="0"');
    expect(markup).toContain('data-cashier-order-id="0"');
    expect(markup).toContain("Supuesto explícito del usuario");
  });

  it("preserves the V2 script while the draft temporarily selects an unsupported mode or blank row", () => {
    const scenario = scriptedScenario();
    document.body.innerHTML = renderScenarioView({
      scenario,
      scenarios: [scenario],
      activeScenarioIndex: 0,
      replications: 3,
      pending: false,
      error: null,
      failedFields: [],
    });
    const form = document.querySelector<HTMLFormElement>("#scenario-form");
    expect(form).not.toBeNull();

    const tuesday = form?.querySelector<HTMLInputElement>('[data-mode="tuesday"]');
    const atTime = form?.querySelector<HTMLInputElement>('[data-interruption-at="0"]');
    const suspended = form?.querySelector<HTMLInputElement>('[data-suspended-order-id="0"]');
    const cashier = form?.querySelector<HTMLInputElement>('[data-cashier-order-id="0"]');
    expect(tuesday).not.toBeNull();
    expect(atTime).not.toBeNull();
    expect(suspended).not.toBeNull();
    expect(cashier).not.toBeNull();
    if (!form || !tuesday || !atTime || !suspended || !cashier) return;

    tuesday.checked = true;
    atTime.value = "";
    suspended.value = "";
    cashier.value = "";
    const draft = collectScenarioDraft(form, scenario);
    const v2Draft = draft.scenario;

    expect(v2Draft.contract_version).toBe("2");
    expect(v2Draft.engine_config.mode).toBe("tuesday");
    expect(v2Draft.engine_config.cashier_interruptions).toEqual([
      { at_s: null, suspended_order_id: "", cashier_order_id: "" },
    ]);
  });

  it("enables V2 explicitly and clears or disables scripts only through explicit actions", () => {
    const legacy = scenarioToDraft(structuredClone(demoScenario) as unknown as ScenarioV1);
    const enabled = enableInterruptionPolicy(legacy);
    expect(enabled.contract_version).toBe("2");
    expect(enabled.engine_config.mode).toBe("tuesday");
    expect(enabled.engine_config.cashier_interruptions).toEqual([]);

    enabled.engine_config.cashier_interruptions = [
      { at_s: 5, suspended_order_id: "A", cashier_order_id: "B" },
    ];
    const cleared = clearInterruptionSchedule(enabled);
    expect(cleared.contract_version).toBe("2");
    expect(cleared.engine_config.cashier_interruptions).toEqual([]);
    expect(enabled.engine_config.cashier_interruptions).toHaveLength(1);

    const disabled = disableInterruptionPolicy(enabled);
    expect(disabled.contract_version).toBe("1");
    expect("cashier_interruptions" in disabled.engine_config).toBe(false);
    expect(enabled.engine_config.cashier_interruptions).toHaveLength(1);
  });

  it("round-trips a numeric V2 wire scenario and rejects invalid drafts without deleting rows", () => {
    const draft = scriptedScenario();
    const wire = scenarioDraftToWire(draft);

    expect(wire?.contract_version).toBe(2);
    if (wire?.contract_version === 2) {
      expect(wire.engine_config.contract_version).toBe(2);
      expect(wire.engine_config.cashier_interruptions).toEqual([
        { at_s: 5, suspended_order_id: "A", cashier_order_id: "B" },
      ]);
    }

    const incompatibleCapacity = structuredClone(draft);
    incompatibleCapacity.engine_config.integrated_workers = 2;
    expect(scenarioDraftToWire(incompatibleCapacity)).toBeNull();
    expect(incompatibleCapacity.engine_config.cashier_interruptions).toEqual(draft.engine_config.cashier_interruptions);

    const incompleteRow = structuredClone(draft);
    incompleteRow.engine_config.cashier_interruptions = [
      { at_s: null, suspended_order_id: "", cashier_order_id: "" },
    ];
    expect(scenarioDraftToWire(incompleteRow)).toBeNull();
    expect(incompleteRow.engine_config.cashier_interruptions).toEqual([
      { at_s: null, suspended_order_id: "", cashier_order_id: "" },
    ]);
  });
});
