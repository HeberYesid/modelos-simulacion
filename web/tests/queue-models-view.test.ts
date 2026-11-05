import { describe, expect, it } from "vitest";
import fixture from "../contracts/fixtures/sample-run.json";
import type { RunResult } from "../src/api/types";
import { renderQueueModels } from "../src/components/queue-models";
import { renderResultsView } from "../src/components/results";

function run(): RunResult {
  const result = structuredClone(fixture) as unknown as RunResult;
  Object.assign(result.scenario.engine_config, { mode: "tuesday", cashiers: 2, preparers: 1 });
  Object.assign(result.scenario, {
    interarrival: { kind: "exponential", mean_s: 600 },
    payment_active: { kind: "exponential", mean_s: 120 },
    preparation: { kind: "exponential", mean_s: 300 },
    transfer_probability: 0, patience: null, initial_state: [],
  });
  return result;
}

describe("queue model presentation", () => {
  it("shows configured rates and reference labels for the non-exponential Tuesday case", () => {
    const value = run();
    Object.assign(value.scenario.engine_config, { cashiers: 1, preparers: 4 });
    value.scenario.interarrival = { kind: "exponential", mean_s: 180 };
    value.scenario.payment_active = { kind: "triangular", low_s: 15, mode_s: 30, high_s: 45 };
    value.scenario.preparation = { kind: "triangular", low_s: 60, mode_s: 120, high_s: 180 };
    document.body.innerHTML = renderQueueModels(value);
    const payment = document.querySelector('[data-queue-stage="payment"]')!;
    const preparation = document.querySelector('[data-queue-stage="preparation"]')!;
    expect(payment.querySelector("h3")?.textContent).toBe("Pago · 1 servidor");
    expect(preparation.querySelector("h3")?.textContent).toBe("Preparación · 4 servidores");
    expect(payment.querySelector("[data-model-reference]")?.textContent).toContain("Modelo de referencia: M/M/1");
    expect(preparation.querySelector("[data-model-reference]")?.textContent).toContain("Modelo de referencia: M/M/s");
    expect(payment.querySelector("[data-rate-lambda]")?.textContent).toBe("20 órdenes/h");
    expect(payment.querySelector("[data-rate-mu]")?.textContent).toBe("120 órdenes/h por servidor");
    expect(preparation.querySelector("[data-rate-mu]")?.textContent).toBe("30 órdenes/h por servidor");
    expect(preparation.textContent).toContain("No se puede asumir que las salidas de pago sean Poisson");
    expect(document.body.textContent).not.toContain("no tiene un régimen estacionario estable");
    expect(payment.textContent).toContain("Servicio configurado: triangular");
    expect(payment.textContent).toContain("No aplica");
  });

  it("renders capacity-dependent references, named metrics and window/cohort definitions", () => {
    document.body.innerHTML = renderQueueModels(run());
    expect(document.querySelector("[data-queue-models]")?.hasAttribute("open")).toBe(false);
    expect(document.querySelector('[data-queue-stage="payment"] h3')?.textContent).toBe("Pago · 2 servidores");
    expect(document.querySelector('[data-queue-stage="payment"] [data-model-reference]')?.textContent).toContain("M/M/s");
    expect(document.querySelector('[data-queue-stage="preparation"] h3')?.textContent).toBe("Preparación · 1 servidor");
    expect(document.querySelector('[data-queue-stage="preparation"] [data-model-reference]')?.textContent).toContain("M/M/1");
    expect(document.querySelectorAll('[data-queue-stage="total"]')).toHaveLength(1);
    expect(document.body.textContent).toContain("Lq · órdenes esperando");
    expect(document.body.textContent).toContain("P(etapa de pago con órdenes)");
    expect(document.body.textContent).toContain("P(sistema sin órdenes)");
    expect(document.querySelector("[data-system-load-status]")?.textContent).toContain("Estable");
    expect(document.querySelector('[data-queue-stage="payment"] [data-load-status]')?.textContent).toContain("ρ nominal");
    expect(document.body.textContent).toContain("vaciado después del cierre");
    expect(document.querySelectorAll('th[scope="row"]')).toHaveLength(20);
    expect(document.querySelectorAll('[role="region"][tabindex="0"]')).toHaveLength(3);
  });

  it("exposes the panel in the actual results view for a saved run", () => {
    const value = run();
    document.body.innerHTML = renderResultsView({
      completed: { kind: "run", value, jsonText: "{}", label: "Saved run" },
      selectedRun: null, selection: null, observations: null, pending: null, pendingMessage: null,
      error: null, partialExperiment: null, editsNotRun: false, csvFiles: [], csvLabel: null,
    });
    expect(document.querySelector("#queue-models-title")?.textContent).toBe("Modelos de colas y desempeño");
  });

  it("marks non-exponential scenarios unavailable and overload without fabricated stationary means", () => {
    const value = run();
    value.scenario.interarrival = { kind: "constant", value_s: 600 };
    document.body.innerHTML = renderQueueModels(value);
    expect(document.body.textContent).toContain("Las fórmulas M/M no aplican a esta configuración");
    expect(document.body.textContent).toContain("No aplica");
    value.scenario.interarrival = { kind: "exponential", mean_s: 1 };
    document.body.innerHTML = renderQueueModels(value);
    expect(document.body.textContent).toContain("Sin régimen estable");
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("shows Friday aggregate M/M/1 as an approximation and keeps one stage", () => {
    const value = run();
    Object.assign(value.scenario.engine_config, { mode: "regular", integrated_workers: 1 });
    document.body.innerHTML = renderQueueModels(value);
    expect(document.querySelectorAll("[data-queue-stage]")).toHaveLength(1);
    expect(document.body.textContent).toContain("Atención integrada · 1 servidor");
    expect(document.querySelector("[data-model-reference]")?.textContent).toContain("M/M/1");
    expect(document.body.textContent).toContain("Aproximación");
  });
});
