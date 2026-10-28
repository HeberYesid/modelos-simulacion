import { describe, expect, it } from "vitest";
import runFixture from "../contracts/fixtures/sample-run.json";
import type { RunResult } from "../src/api/types";
import { renderResultsView } from "../src/components/results";

describe("payment method display", () => {
  it("shows a transfer with no confirmation-time breakdown in the order table", () => {
    const run = structuredClone(runFixture) as unknown as RunResult;
    run.scenario.transfer_confirmation = { kind: "constant", value_s: 0 };
    run.demand_tape = [{
      order_id: "paid-order", person_ids: ["person"], arrival_s: 1,
      payment_active_s: 2, preparation_s: 3, transfer_wait_s: 0,
      ...{ payment_method: "transfer" },
    }];
    run.metrics.orders = [{
      order_id: "paid-order", person_ids: ["person"], cohort: "new", state: "delivered",
      arrival_s: 1, payment_started_s: 1, payment_active_ended_s: 3, payment_completed_s: 3,
      preparation_started_s: 3, delivery_s: 6, abandonment_s: null,
      permanence_s: 5, payment_wait_s: 0, preparation_wait_s: 0, unavailable_fields: [],
    }];
    const markup = renderResultsView({
      completed: { kind: "run", value: run, jsonText: JSON.stringify(run), label: "Réplica" },
      selectedRun: run, selection: null, observations: null, pending: null, pendingMessage: null,
      error: null, partialExperiment: null, editsNotRun: false, csvFiles: [], csvLabel: null,
    });
    document.body.innerHTML = markup;
    const table = document.querySelector(".result-orders")!;
    expect(table.textContent).toContain("Medio de pago");
    expect(table.textContent).toContain("Transferencia");
    expect(markup).not.toContain("<dt>Confirmación externa</dt>");
  });
});
