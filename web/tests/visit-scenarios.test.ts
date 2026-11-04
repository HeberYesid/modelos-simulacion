import { describe, expect, it } from "vitest";
import type { Scenario } from "../src/api/types";
import {
  buildVisitScenario,
  summarizeVisitScenario,
} from "../src/domain/visit-scenarios";
import { observedVisits, type ObservedRecord, type ObservedVisit } from "../src/replay/observed";

function record(
  localId: string,
  station: ObservedRecord["station"],
  times: { arrival?: string; start?: string; end?: string; departure?: string },
): ObservedRecord {
  const stationName = station === "caja" ? "caja" : "entrega";
  return {
    record_id: `${stationName}-${localId}`,
    source_id: "hand-worked-example",
    source_line: Number(localId),
    station,
    station_local_id: localId,
    raw_fields: {
      lugar: stationName,
      fecha: "2026-10-20",
      tipo_dia: "Martes 2x1",
      personal: station === "caja" ? "1" : "4",
      id: localId,
      hora_llegada: times.arrival ?? "",
      hora_inicio: times.start ?? "",
      hora_fin: times.end ?? "",
      hora_se_fue: times.departure ?? "",
    },
  };
}

function visit(records: readonly ObservedRecord[]): ObservedVisit {
  return {
    visit_id: "visit_2026-10-20_tuesday_promotion",
    label: "Martes 2x1 · visita medida",
    date: "2026-10-20",
    start_time: "16:45:35",
    end_time: "16:55:35",
    duration_s: 600,
    sources: [],
    records,
    warning_ids: [],
  };
}

function templateScenario(): Scenario {
  return {
    contract_version: 1,
    scenario_id: "template-scenario",
    display_name: "Plantilla",
    engine_config: {
      contract_version: 1,
      mode: "regular",
      opening_time: "15:00:00",
      horizon_s: 3600,
      cashiers: 2,
      preparers: 3,
      integrated_workers: 4,
    },
    initial_state: [{ order_id: "waiting", person_ids: ["person"], stage: "waiting_payment" }],
    interarrival: { kind: "exponential", mean_s: 300 },
    arrival_schedule: [{ start_s: 0, end_s: 3600, orders_per_hour: 4 }],
    menu: { products: [], baskets: [] },
    group_sizes: [{ size: 2, probability: 1 }],
    payment_active: { kind: "exponential", mean_s: 75 },
    preparation: { kind: "exponential", mean_s: 120 },
    transfer_probability: 0.5,
    transfer_confirmation: { kind: "constant", value_s: 30 },
    patience: { kind: "constant", value_s: 180 },
    provenance: "synthetic_demo",
    assumptions: ["Supuesto de la plantilla"],
    default_root_seed: 91,
  };
}

const handWorkedTuesday = visit([
  record("1", "caja", { arrival: "16:45:35", start: "16:45:45", end: "16:46:05" }),
  record("16", "caja", { arrival: "16:46:05", departure: "16:46:20" }),
  record("2", "caja", { arrival: "16:47:35", start: "16:47:45", end: "16:48:15" }),
  record("1", "entrega", { start: "16:46:00", end: "16:46:40" }),
  record("2", "entrega", { start: "16:47:00", end: "16:48:00" }),
]);

describe("exploratory scenarios from observed visits", () => {
  it("calculates means from literal elapsed-time examples and includes withdrawal arrivals", () => {
    const summary = summarizeVisitScenario(handWorkedTuesday);

    expect(summary.sampleCounts).toEqual({ interarrivalGaps: 2, paymentWindows: 2, preparationWindows: 2 });
    expect(summary.meanInterarrivalS).toBe(60);
    expect(summary.meanPaymentWindowS).toBe(25);
    expect(summary.meanPreparationWindowS).toBe(50);
  });

  it("builds a fresh version-1 Tuesday scenario with observed window and disclosed assumptions", () => {
    const template = templateScenario();
    const scenario = buildVisitScenario(handWorkedTuesday, template);

    expect(scenario).toMatchObject({
      contract_version: 1,
      scenario_id: "observed-visit_2026-10-20_tuesday_promotion-exploratory",
      display_name: "Martes 20/10 · exploratorio",
      engine_config: {
        contract_version: 1,
        mode: "tuesday",
        opening_time: "16:45:35",
        horizon_s: 600,
        cashiers: 1,
        preparers: 4,
      },
      interarrival: { kind: "exponential", mean_s: 60 },
      payment_active: { kind: "constant", value_s: 25 },
      preparation: { kind: "constant", value_s: 50 },
      group_sizes: [{ size: 1, probability: 1 }],
      transfer_probability: 0,
      transfer_confirmation: { kind: "constant", value_s: 0 },
      patience: null,
      initial_state: [],
      provenance: "user_assumptions",
      default_root_seed: 91,
    });
    expect(scenario).not.toHaveProperty("arrival_schedule");
    expect(scenario).not.toHaveProperty("menu");
    expect(scenario.engine_config).not.toHaveProperty("preparation_interruption_policy");
    expect(scenario.engine_config).not.toHaveProperty("cashier_interruptions");
    expect(scenario.assumptions.join(" ")).toContain("no representan trabajo activo ni calibran el modelo");
    expect(scenario.assumptions.join(" ")).toContain("tamaño de los grupos");
    expect(scenario.assumptions.join(" ")).toContain("se supone pago en efectivo");
    expect(scenario.assumptions.join(" ")).toContain("estado inicial se supone vacío");
    expect(scenario.assumptions.join(" ")).toContain("No se modelan abandonos");
    expect(scenario.assumptions.join(" ")).toContain("no se enlazan entre sí");
    expect(scenario.assumptions.join(" ")).toContain("ventanas superpuestas");
  });

  it("uses stable Friday identity and discloses its unreconstructed interruption and active-work limits", () => {
    const friday = observedVisits.find((candidate) => candidate.date === "2026-10-23")!;
    const scenario = buildVisitScenario(friday, templateScenario());

    expect(scenario).toMatchObject({
      contract_version: 1,
      scenario_id: "observed-visit_2026-10-23_regular-exploratory",
      display_name: "Viernes 23/10 · exploratorio",
      engine_config: {
        contract_version: 1,
        mode: "regular",
        opening_time: "17:20:23",
        horizon_s: 3646,
        integrated_workers: 1,
      },
    });
    expect(scenario.assumptions.join(" ")).toContain("los límites exactos de esa pausa no se reconstruyen");
    expect(scenario.assumptions.join(" ")).toContain("no separan trabajo activo, espera externa ni pausas");
    expect(scenario.assumptions.join(" ")).not.toContain("retiros observados del martes");
  });

  it("matches independently summed samples from the preserved visit archive", () => {
    const tuesday = observedVisits.find((candidate) => candidate.date === "2026-10-20")!;
    const friday = observedVisits.find((candidate) => candidate.date === "2026-10-23")!;

    const tuesdaySummary = summarizeVisitScenario(tuesday);
    expect(tuesdaySummary.sampleCounts).toEqual({ interarrivalGaps: 60, paymentWindows: 58, preparationWindows: 58 });
    expect(tuesdaySummary.meanInterarrivalS).toBeCloseTo(6436 / 60, 12);
    expect(tuesdaySummary.meanPaymentWindowS).toBeCloseTo(4816 / 58, 12);
    expect(tuesdaySummary.meanPreparationWindowS).toBeCloseTo(16532 / 58, 12);

    const fridaySummary = summarizeVisitScenario(friday);
    expect(fridaySummary.sampleCounts).toEqual({ interarrivalGaps: 7, paymentWindows: 8, preparationWindows: 8 });
    expect(fridaySummary.meanInterarrivalS).toBeCloseTo(3503 / 7, 12);
    expect(fridaySummary.meanPaymentWindowS).toBe(22.5);
    expect(fridaySummary.meanPreparationWindowS).toBe(146);
  });

  it("does not mutate or alias the supplied visit and template", () => {
    const example = structuredClone(handWorkedTuesday);
    const template = templateScenario();
    const templateBefore = structuredClone(template);

    const scenario = buildVisitScenario(example, template);

    expect(example).toEqual(handWorkedTuesday);
    expect(template).toEqual(templateBefore);
    expect(scenario).not.toBe(template);
    scenario.group_sizes[0].size = 5;
    expect(template.group_sizes[0].size).toBe(2);
  });

  it("rejects missing or unusable samples instead of substituting template values", () => {
    const arrivalsWithoutGaps = visit([record("1", "caja", { arrival: "16:45:35" })]);
    expect(() => summarizeVisitScenario(arrivalsWithoutGaps)).toThrow(RangeError);

    const missingPayments = visit([
      record("1", "caja", { arrival: "16:45:35" }),
      record("2", "caja", { arrival: "16:46:35" }),
      record("3", "entrega", { start: "16:46:00", end: "16:46:40" }),
    ]);
    expect(() => buildVisitScenario(missingPayments, templateScenario())).toThrow(RangeError);

    const missingPreparation = visit([
      record("1", "caja", { arrival: "16:45:35", start: "16:45:45", end: "16:46:05" }),
      record("2", "caja", { arrival: "16:46:35", start: "16:46:45", end: "16:47:05" }),
    ]);
    expect(() => summarizeVisitScenario(missingPreparation)).toThrow(RangeError);
  });

  it("rejects invalid completed timing windows", () => {
    const invalidPayment = visit([
      record("1", "caja", { arrival: "16:45:35", start: "16:46:05", end: "16:45:55" }),
      record("2", "caja", { arrival: "16:46:35", start: "16:46:45", end: "16:47:05" }),
      record("1", "entrega", { start: "16:46:00", end: "16:46:40" }),
    ]);
    expect(() => summarizeVisitScenario(invalidPayment)).toThrow(RangeError);
  });
});
