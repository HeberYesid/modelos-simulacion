import { describe, expect, it } from "vitest";
import runV1Fixture from "../contracts/fixtures/sample-run.json";
import runV2Fixture from "../contracts/fixtures/sample-run-v2.json";
import type { ApiSchema, RunResult, RunResultV1 } from "../src/api/types";
import { renderResultsView, updateReplayTimeline } from "../src/components/results";

function resultsMarkup(run: RunResult, editsNotRun = false): string {
  return renderResultsView({
    completed: { kind: "run", value: run, jsonText: JSON.stringify(run), label: "Réplica guardada" },
    selectedRun: run,
    selection: null,
    observations: null,
    pending: null,
    pendingMessage: null,
    error: null,
    partialExperiment: null,
    editsNotRun,
    csvFiles: [],
    csvLabel: null,
  });
}

function v1OrderMetric(): ApiSchema<"OrderMetric"> {
  return {
    order_id: "legacy-order",
    person_ids: ["legacy-person"],
    cohort: "initialized",
    state: "completed",
    arrival_s: 0,
    payment_started_s: 0,
    payment_active_ended_s: 2,
    payment_completed_s: 2,
    preparation_started_s: 2,
    delivery_s: 14,
    abandonment_s: null,
    payment_wait_s: 0,
    transaction_elapsed_s: 2,
    preparation_queue_wait_s: 0,
    preparation_elapsed_s: 12,
    permanence_s: 14,
    withdrawal_wait_s: null,
    unavailable_fields: [],
  };
}

describe("preparation interruption result inspection", () => {
  it("shows saved V2 active, paused, count and elapsed preparation measures", () => {
    const run = structuredClone(runV2Fixture) as unknown as RunResult;
    const markup = resultsMarkup(run);

    expect(markup).toContain("Trabajo activo");
    expect(markup).toContain("Tiempo en pausa");
    expect(markup).toContain("Recuento de pausas");
    expect(markup).toContain("Tiempo transcurrido");
    expect(markup).toContain("10 s");
    expect(markup).toContain("2 s");
    expect(markup).toContain("1 pausa");
  });

  it("labels the pause and resume when the non-3D timeline is sought", () => {
    const run = structuredClone(runV2Fixture) as unknown as RunResult;
    document.body.innerHTML = resultsMarkup(run);

    updateReplayTimeline(run, 6);
    expect(document.querySelector("#replay-event-detail")?.textContent).toContain("Preparación pausada");
    expect(document.querySelector("#replay-event-detail")?.textContent).toContain("Orden de caja relacionada");

    updateReplayTimeline(run, 8);
    expect(document.querySelector("#replay-event-detail")?.textContent).toContain("Reanudar preparación");
  });

  it("marks V2-only active and pause measures unavailable for a V1 order", () => {
    const run = structuredClone(runV1Fixture) as unknown as RunResultV1;
    const v1Order = v1OrderMetric();
    expect("preparation_active_s" in v1Order).toBe(false);
    run.metrics.orders = [v1Order];

    const markup = resultsMarkup(run, true);
    expect(markup).toContain("No disponible en la versión 1");
    expect(markup).toContain("La configuración visible tiene cambios sin ejecutar");
  });
});
