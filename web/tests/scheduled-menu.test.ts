import { describe, expect, it } from "vitest";
import demoScenario from "../contracts/fixtures/demo-scenario.json";
import type { Scenario, ScenarioDraft } from "../src/api/types";
import {
  collectScenarioDraft,
  disableArrivalSchedule,
  disableMenu,
  enableArrivalSchedule,
  enableMenu,
  renderScenarioView,
  scenarioConfigurationIssues,
  scenarioDraftToWire,
  scenarioToDraft,
} from "../src/components/scenario-editor";

function render(scenario: ScenarioDraft): HTMLFormElement {
  document.body.innerHTML = renderScenarioView({
    scenario,
    scenarios: [scenario],
    activeScenarioIndex: 0,
    replications: 30,
    advancedOpen: true,
    comparisonOpen: false,
    helpOpen: false,
    pending: false,
    error: null,
    failedFields: [],
  });
  return document.querySelector<HTMLFormElement>("#scenario-form") as HTMLFormElement;
}

describe("arrival schedule and menu scenario drafts", () => {
  it("keeps the existing demonstration configuration disabled by default", () => {
    const scenario = scenarioToDraft(structuredClone(demoScenario) as unknown as Scenario);
    const form = render(scenario);

    expect(form.querySelector<HTMLInputElement>("#arrival-schedule-enabled")?.checked).toBe(false);
    expect(form.querySelector<HTMLInputElement>("#menu-enabled")?.checked).toBe(false);
    expect(form.querySelectorAll("[data-arrival-window]")).toHaveLength(0);
    expect(form.querySelectorAll("[data-menu-product]")).toHaveLength(0);
    const interarrival = form.querySelector<HTMLSelectElement>('[data-distribution-kind="interarrival"]');
    if (interarrival) interarrival.value = scenario.interarrival.kind;

    const collected = collectScenarioDraft(form, scenario).scenario;
    expect(collected.interarrival).toEqual({ kind: "exponential", mean_s: 180 });
    expect(collected.arrival_schedule_enabled).toBe(false);
    expect(collected.menu_enabled).toBe(false);
  });

  it("round-trips scheduled order rates and mixed menu basket quantities", () => {
    const scenario = {
      ...structuredClone(demoScenario),
      arrival_schedule: [
        { start_s: 0, end_s: 11_700, orders_per_hour: 20 },
        { start_s: 11_700, end_s: 23_400, orders_per_hour: 12.5 },
      ],
      menu: {
        products: [
          { product_id: "fruit", display_name: "Ensalada de frutas", visual_kind: "fruit_salad", preparation_s: 180 },
          { product_id: "ice", display_name: "Helado", visual_kind: "ice_cream", preparation_s: 60 },
        ],
        baskets: [
          { probability: 1, items: [{ product_id: "fruit", quantity: 2 }, { product_id: "ice", quantity: 1 }] },
        ],
      },
    } as unknown as Scenario;
    const draft = scenarioToDraft(scenario);
    const form = render(draft);

    expect(form.querySelector<HTMLInputElement>("#arrival-schedule-enabled")?.checked).toBe(true);
    expect(form.querySelectorAll("[data-arrival-window]")).toHaveLength(2);
    expect(form.querySelector<HTMLInputElement>("#menu-enabled")?.checked).toBe(true);
    expect(form.querySelectorAll("[data-menu-product]")).toHaveLength(2);
    expect(form.querySelectorAll("[data-menu-basket]")).toHaveLength(1);

    const rate = form.querySelector<HTMLInputElement>('[data-arrival-orders-per-hour="1"]');
    if (rate) rate.value = "14.25";
    const fruitQuantity = form.querySelector<HTMLInputElement>('[data-menu-quantity="fruit"]');
    if (fruitQuantity) fruitQuantity.value = "2";
    const iceQuantity = form.querySelector<HTMLInputElement>('[data-menu-quantity="ice"]');
    if (iceQuantity) iceQuantity.value = "1";

    const collected = collectScenarioDraft(form, draft).scenario;
    expect(collected.arrival_schedule).toEqual([
      { start_s: 0, end_s: 11_700, orders_per_hour: 20 },
      { start_s: 11_700, end_s: 23_400, orders_per_hour: 14.25 },
    ]);
    expect(collected.menu?.baskets).toEqual([
      { probability: 1, items: [{ product_id: "fruit", quantity: 2 }, { product_id: "ice", quantity: 1 }] },
    ]);
  });

  it("retains menu quantities, base preparation, and schedule when toggled off and on", () => {
    const scenario = scenarioToDraft(structuredClone(demoScenario) as unknown as Scenario);
    scenario.arrival_schedule_enabled = true;
    scenario.arrival_schedule = [
      { start_s: 0, end_s: 300, orders_per_hour: 18 },
      { start_s: 300, end_s: scenario.engine_config.horizon_s, orders_per_hour: 0 },
    ];
    scenario.menu_enabled = true;
    scenario.menu = {
      products: [
        { product_id: "fruit", display_name: "Ensalada de frutas", visual_kind: "fruit_salad", preparation_s: 37 },
        { product_id: "ice", display_name: "Helado", visual_kind: "ice_cream", preparation_s: 23 },
      ],
      baskets: [
        { probability: 1, items: [{ product_id: "fruit", quantity: 2 }, { product_id: "ice", quantity: 1 }] },
      ],
    };
    scenario.preparation = { kind: "triangular", low_s: 31, mode_s: 47, high_s: 59 };

    const menuOff = disableMenu(scenario);
    expect(menuOff.menu).toEqual(scenario.menu);
    const scheduleOff = disableArrivalSchedule(menuOff);
    expect(scheduleOff.arrival_schedule).toEqual(scenario.arrival_schedule);

    const reenabled = enableMenu(enableArrivalSchedule(scheduleOff));
    const form = render(reenabled);
    expect(form.querySelector<HTMLInputElement>("#menu-enabled")?.checked).toBe(true);
    expect(form.querySelector<HTMLInputElement>("#arrival-schedule-enabled")?.checked).toBe(true);
    const interarrival = form.querySelector<HTMLSelectElement>('[data-distribution-kind="interarrival"]');
    if (interarrival) interarrival.value = reenabled.interarrival.kind;
    const collected = collectScenarioDraft(form, reenabled).scenario;
    expect(collected.menu).toEqual(scenario.menu);
    expect(collected.arrival_schedule).toEqual(scenario.arrival_schedule);
    expect(collected.preparation).toEqual(scenario.preparation);

    const wire = scenarioDraftToWire(collected);
    expect(wire, JSON.stringify({ issues: scenarioConfigurationIssues(collected), collected })).not.toBeNull();
    expect(wire?.menu).toEqual(scenario.menu);
    expect(wire?.arrival_schedule).toEqual(scenario.arrival_schedule);
    expect(wire?.preparation).toEqual(scenario.preparation);
    expect(wire).not.toHaveProperty("menu_enabled");
    expect(wire).not.toHaveProperty("arrival_schedule_enabled");
  });

  it("retains registered product items on an initial order when another field is edited", () => {
    const scenario = {
      ...structuredClone(demoScenario),
      initial_state: [{
        order_id: "initial-fruit-order",
        person_ids: ["person-initial"],
        arrival_s: null,
        stage: "waiting_payment",
        queue_rank: 0,
        worker_id: null,
        remaining_s: null,
        patience_remaining_s: null,
        payment_active_s: 30,
        transfer_wait_s: 0,
        preparation_s: 420,
        items: [
          { product_id: "fruit", display_name: "Ensalada de frutas", visual_kind: "fruit_salad", quantity: 2 },
          { product_id: "ice", display_name: "Helado", visual_kind: "ice_cream", quantity: 1 },
        ],
      }],
    } as unknown as Scenario;
    const draft = scenarioToDraft(scenario);
    const form = render(draft);
    form.querySelector<HTMLInputElement>("#scenario-name")!.value = "Edited scenario name";

    const collected = collectScenarioDraft(form, draft).scenario;
    const initialItems = (collected.initial_state[0] as unknown as { items?: unknown[] } | undefined)?.items;
    expect(initialItems).toEqual([
      { product_id: "fruit", display_name: "Ensalada de frutas", visual_kind: "fruit_salad", quantity: 2 },
      { product_id: "ice", display_name: "Helado", visual_kind: "ice_cream", quantity: 1 },
    ]);
  });

  it("retains blank basket quantities as invalid drafts instead of removing those products", () => {
    const draft = scenarioToDraft(structuredClone(demoScenario) as unknown as Scenario);
    draft.menu_enabled = true;
    draft.menu = {
      products: [
        { product_id: "fruit", display_name: "Ensalada de frutas", visual_kind: "fruit_salad", preparation_s: 180 },
        { product_id: "ice", display_name: "Helado", visual_kind: "ice_cream", preparation_s: 60 },
      ],
      baskets: [{ probability: 1, items: [{ product_id: "fruit", quantity: 2 }, { product_id: "ice", quantity: 1 }] }],
    };
    const form = render(draft);
    form.querySelector<HTMLInputElement>('[data-menu-quantity="fruit"]')!.value = "";

    const collected = collectScenarioDraft(form, draft).scenario;
    expect(collected.menu?.baskets[0]?.items).toEqual([
      { product_id: "fruit", quantity: null },
      { product_id: "ice", quantity: 1 },
    ]);
    expect(scenarioConfigurationIssues(collected)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "menu.baskets[0].items" }),
    ]));
    const rerendered = render(collected);
    expect(rerendered.querySelector<HTMLInputElement>('[data-menu-quantity="fruit"]')?.value).toBe("");
  });

  it("retains negative basket quantities as invalid drafts instead of removing those products", () => {
    const draft = scenarioToDraft(structuredClone(demoScenario) as unknown as Scenario);
    draft.menu_enabled = true;
    draft.menu = {
      products: [
        { product_id: "fruit", display_name: "Ensalada de frutas", visual_kind: "fruit_salad", preparation_s: 180 },
        { product_id: "ice", display_name: "Helado", visual_kind: "ice_cream", preparation_s: 60 },
      ],
      baskets: [{ probability: 1, items: [{ product_id: "fruit", quantity: 2 }, { product_id: "ice", quantity: 1 }] }],
    };
    const form = render(draft);
    form.querySelector<HTMLInputElement>('[data-menu-quantity="fruit"]')!.value = "-1";

    const collected = collectScenarioDraft(form, draft).scenario;
    expect(collected.menu?.baskets[0]?.items).toEqual([
      { product_id: "fruit", quantity: -1 },
      { product_id: "ice", quantity: 1 },
    ]);
    expect(scenarioConfigurationIssues(collected)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "menu.baskets[0].items" }),
    ]));
    const rerendered = render(collected);
    expect(rerendered.querySelector<HTMLInputElement>('[data-menu-quantity="fruit"]')?.value).toBe("-1");
  });
});
