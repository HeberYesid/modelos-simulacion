import { describe, expect, it } from "vitest";
import type { Scenario } from "../src/api/types";
import { analyzeQueueScenario, calculateMmQueue } from "../src/domain/queueing-theory";

const exponential = (mean_s: number) => ({ kind: "exponential" as const, mean_s });
const constant = (value_s: number) => ({ kind: "constant" as const, value_s });

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    contract_version: 1,
    scenario_id: "queue-test",
    display_name: "Turno prueba",
    engine_config: {
      contract_version: 1,
      mode: "tuesday",
      opening_time: "15:00:00",
      horizon_s: 28_800,
      cashiers: 1,
      preparers: 1,
      integrated_workers: 1,
    },
    initial_state: [],
    interarrival: exponential(600),
    group_sizes: [{ size: 1, probability: 1 }],
    payment_active: exponential(60),
    preparation: exponential(120),
    transfer_probability: 0,
    transfer_confirmation: constant(0),
    provenance: "synthetic_demo",
    assumptions: [],
    default_root_seed: 1,
    ...overrides,
  } as Scenario;
}

describe("calculateMmQueue", () => {
  it("matches the manually solved M/M/1 example", () => {
    expect(calculateMmQueue(6, 10, 1)).toMatchObject({
      lambdaPerHour: 6, muPerHour: 10, servers: 1, rho: 0.6,
      WSeconds: 900, WqSeconds: 540, p0: 0.4, pWait: 0.6, status: "stable",
    });
    expect(calculateMmQueue(6, 10, 1).L).toBeCloseTo(1.5, 12);
    expect(calculateMmQueue(6, 10, 1).Lq).toBeCloseTo(0.9, 12);
  });

  it("matches the manually solved Erlang-C M/M/2 example", () => {
    const measures = calculateMmQueue(6, 4, 2);
    expect(measures.status).toBe("stable");
    expect(measures.rho).toBe(0.75);
    expect(measures.p0).toBeCloseTo(1 / 7, 12);
    expect(measures.pWait).toBeCloseTo(9 / 14, 12);
    expect(measures.Lq).toBeCloseTo(27 / 14, 12);
    expect(measures.L).toBeCloseTo(24 / 7, 12);
    expect(measures.WSeconds).toBeCloseTo((24 / 7) / 6 * 3600, 10);
    expect(measures.WqSeconds).toBeCloseTo((27 / 14) / 6 * 3600, 10);
  });

  it("returns limiting stationary measures for zero arrivals", () => {
    expect(calculateMmQueue(0, 10, 2)).toEqual({
      lambdaPerHour: 0, muPerHour: 10, servers: 2, rho: 0,
      L: 0, Lq: 0, WSeconds: 360, WqSeconds: 0,
      p0: 1, pWait: 0, status: "stable",
    });
  });

  it("marks overloaded queues unstable and invalid inputs invalid", () => {
    expect(calculateMmQueue(10, 10, 1)).toMatchObject({ status: "unstable", rho: 1, L: null, WSeconds: null });
    expect(calculateMmQueue(-1, 10, 1).status).toBe("invalid");
    expect(calculateMmQueue(1, 0, 1).status).toBe("invalid");
    expect(calculateMmQueue(1, 10, 1.5).status).toBe("invalid");
  });

  it("keeps Erlang-C stable with large configured server counts", () => {
    expect(calculateMmQueue(6, 4, 32)).toMatchObject({ status: "stable", servers: 32, p0: expect.any(Number) });
    expect(calculateMmQueue(6, 4, 33).status).toBe("invalid");
    expect(calculateMmQueue(Number.MIN_VALUE, 1e308, 1).status).toBe("invalid");
    expect(calculateMmQueue(1, 1e308, 2).status).toBe("invalid");
  });
});

describe("analyzeQueueScenario", () => {
  it("estimates nominal stability without applying M/M formulas to non-exponential service", () => {
    const stages = analyzeQueueScenario(scenario({
      interarrival: constant(60),
      payment_active: constant(60),
      preparation: constant(30),
      transfer_probability: 0.5,
      transfer_confirmation: constant(60),
    }));
    expect(stages[0]).toMatchObject({ nominalRho: 1, measures: null });
    expect(stages[1]).toMatchObject({ nominalRho: 0.5, measures: null });
  });

  it("keeps a short overloaded band visible even when average demand fits", () => {
    const [payment] = analyzeQueueScenario(scenario({
      payment_active: constant(60),
      arrival_schedule: [
        { start_s: 0, end_s: 3600, orders_per_hour: 100 },
        { start_s: 3600, end_s: 28800, orders_per_hour: 20 },
      ],
    }));
    expect(payment).toMatchObject({ nominalRho: 0.5, measures: null });
    expect(payment?.peakRho).toBeCloseTo(5 / 3);
  });
  it("analyzes Tuesday payment and preparation as separate stages", () => {
    const stages = analyzeQueueScenario(scenario());
    expect(stages.map(({ id, servers, applicability }) => [id, servers, applicability])).toEqual([
      ["payment", 1, "applicable"],
      ["preparation", 1, "applicable"],
    ]);
    expect(stages[0]?.measures?.lambdaPerHour).toBe(6);
    expect(stages[0]?.measures?.muPerHour).toBe(60);
    expect(stages[1]?.measures?.muPerHour).toBe(30);
  });

  it("uses M/M/s labels and capacities when Tuesday stages have multiple workers", () => {
    const stages = analyzeQueueScenario(scenario({
      engine_config: { contract_version: 1, mode: "tuesday", opening_time: "15:00:00", horizon_s: 28_800, cashiers: 2, preparers: 4 },
    }));
    expect(stages.map(({ model, servers }) => [model, servers])).toEqual([["M/M/s", 2], ["M/M/s", 4]]);
  });

  it("covers each Tuesday cashier and preparer capacity combination", () => {
    for (const cashiers of [1, 2]) {
      for (const preparers of [1, 4]) {
        const stages = analyzeQueueScenario(scenario({
          engine_config: {
            contract_version: 1, mode: "tuesday", opening_time: "15:00:00", horizon_s: 28_800,
            cashiers, preparers,
          },
        }));
        expect(stages.map(({ id, model, servers }) => [id, model, servers])).toEqual([
          ["payment", cashiers === 1 ? "M/M/1" : "M/M/s", cashiers],
          ["preparation", preparers === 1 ? "M/M/1" : "M/M/s", preparers],
        ]);
      }
    }
  });

  it("marks non-exponential arrivals and service, abandonment, or transfer waits unavailable", () => {
    expect(analyzeQueueScenario(scenario({ interarrival: constant(600) }))[0]).toMatchObject({ applicability: "unavailable", measures: null });
    expect(analyzeQueueScenario(scenario({ payment_active: constant(60) }))[0]).toMatchObject({ applicability: "unavailable", measures: null });
    expect(analyzeQueueScenario(scenario({ patience: constant(300) }))[0]).toMatchObject({ applicability: "unavailable", measures: null });
    expect(analyzeQueueScenario(scenario({ transfer_probability: 0.2, transfer_confirmation: exponential(60) }))[0]).toMatchObject({ applicability: "unavailable", measures: null });
  });

  it("exposes configured nominal stage rates even when queue formulas are unavailable", () => {
    const stages = analyzeQueueScenario(scenario({
      interarrival: exponential(180),
      payment_active: { kind: "triangular", low_s: 15, mode_s: 30, high_s: 45 },
      preparation: { kind: "triangular", low_s: 60, mode_s: 120, high_s: 180 },
    }));
    expect(stages[0]).toMatchObject({ lambdaPerHour: 20, muPerHour: 120, measures: null });
    expect(stages[1]).toMatchObject({ lambdaPerHour: 20, muPerHour: 30, measures: null });
    expect(stages[1]?.reasons.join(" ")).toContain("salidas de pago");
    expect(stages[1]?.reasons.join(" ")).toContain("Poisson");
    expect(stages[1]?.reasons.join(" ")).not.toContain("no tiene un régimen estacionario estable");
    expect(stages[1]?.rateNotes.join(" ")).toContain("nominal");
  });

  it("reports horizon-weighted mean demand for piecewise arrival schedules", () => {
    const stages = analyzeQueueScenario(scenario({ arrival_schedule: [
      { start_s: 0, end_s: 3600, orders_per_hour: 10 },
      { start_s: 3600, end_s: 7200, orders_per_hour: 30 },
    ] }));
    expect(stages[0]).toMatchObject({ lambdaPerHour: 20, measures: null });
    expect(stages[0]?.rateNotes.join(" ")).toContain("promedio ponderado por duración");
  });

  it("keeps nominal arrival and service rates visible for interrupted V2 and null for undefined rates", () => {
    const v2 = scenario({ contract_version: 2, engine_config: {
      contract_version: 2, mode: "regular", opening_time: "15:00:00", horizon_s: 28_800,
      cashiers: 0, integrated_workers: 1, preparers: 0, preparation_interruption_policy: "scripted_cashier",
      cashier_interruptions: [{ at_s: 60, suspended_order_id: "a", cashier_order_id: "b" }],
    } }) as Scenario;
    expect(analyzeQueueScenario(v2)[0]).toMatchObject({ lambdaPerHour: 6, muPerHour: 20, measures: null });
    expect(analyzeQueueScenario(v2)[0]?.rateNotes.join(" ")).toContain("no incluye la sobrecarga");
    const undefinedRates = analyzeQueueScenario(scenario({ interarrival: constant(0), payment_active: constant(0) }))[0];
    expect(undefinedRates).toMatchObject({ lambdaPerHour: null, muPerHour: null, measures: null });
    expect(undefinedRates?.rateNotes.join(" ")).toContain("no se puede calcular");
  });

  it("does not model piecewise arrival schedules or v2 scripted interruptions as M/M", () => {
    expect(analyzeQueueScenario(scenario({ arrival_schedule: [{ start_s: 0, end_s: 3600, orders_per_hour: 6 }] }))[0]).toMatchObject({ applicability: "unavailable", measures: null });
    const v2 = scenario({ contract_version: 2, engine_config: {
      contract_version: 2, mode: "regular", opening_time: "15:00:00", horizon_s: 28_800,
      cashiers: 0, integrated_workers: 1, preparers: 0, preparation_interruption_policy: "scripted_cashier", cashier_interruptions: [],
    } }) as Scenario;
    expect(analyzeQueueScenario(v2)[0]).toMatchObject({ id: "integrated", applicability: "approximation" });
    const interrupted = { ...v2, engine_config: { ...v2.engine_config, cashier_interruptions: [{ at_s: 60, suspended_order_id: "a", cashier_order_id: "b" }] } } as Scenario;
    expect(analyzeQueueScenario(interrupted)[0]).toMatchObject({ id: "integrated", applicability: "unavailable", measures: null });
  });

  it("uses weighted menu preparation time and flags upstream instability", () => {
    const menu = {
      products: [
        { product_id: "a", display_name: "A", visual_kind: "ice_cream" as const, preparation_s: 60 },
        { product_id: "b", display_name: "B", visual_kind: "slush" as const, preparation_s: 180 },
      ],
      baskets: [
        { probability: 0.25, items: [{ product_id: "a", quantity: 1 }] },
        { probability: 0.75, items: [{ product_id: "b", quantity: 1 }] },
      ],
    };
    expect(analyzeQueueScenario(scenario({ menu }))[1]).toMatchObject({
      applicability: "unavailable", measures: null,
    });
    const integratedMenu = analyzeQueueScenario(scenario({
      menu,
      engine_config: { contract_version: 1, mode: "regular", opening_time: "15:00:00", horizon_s: 28_800, integrated_workers: 1 },
    }))[0];
    expect(integratedMenu).toMatchObject({ applicability: "approximation", muPerHour: 3600 / 210, measures: { muPerHour: 3600 / 210 } });
    const overloaded = analyzeQueueScenario(scenario({ interarrival: exponential(60), payment_active: exponential(120) }));
    expect(overloaded[0]?.measures?.status).toBe("unstable");
    expect(overloaded[1]).toMatchObject({ applicability: "unavailable", measures: null });
  });

  it("describes a payment queue at exactly full utilization as reaching capacity", () => {
    const stages = analyzeQueueScenario(scenario({
      interarrival: exponential(120),
      payment_active: exponential(120),
    }));
    expect(stages[0]?.measures).toMatchObject({ rho: 1, status: "unstable" });
    expect(stages[1]?.reasons.join(" ")).toContain("alcanza o supera la capacidad");
    expect(stages[1]?.reasons.join(" ")).toContain("no hay régimen estacionario");
  });

  it("treats probabilistic transfer service as a mixture rather than an exponential component", () => {
    const result = analyzeQueueScenario(scenario({
      payment_active: constant(0),
      preparation: constant(0),
      transfer_probability: 0.5,
      transfer_confirmation: exponential(60),
      engine_config: { contract_version: 1, mode: "regular", opening_time: "15:00:00", horizon_s: 28_800, integrated_workers: 1 },
    }))[0];
    expect(result).toMatchObject({ applicability: "approximation", measures: { muPerHour: 120 } });
    const guaranteedTransfer = analyzeQueueScenario(scenario({
      payment_active: constant(0),
      preparation: constant(0),
      transfer_probability: 1,
      transfer_confirmation: exponential(60),
      engine_config: { contract_version: 1, mode: "regular", opening_time: "15:00:00", horizon_s: 28_800, integrated_workers: 1 },
    }))[0];
    expect(guaranteedTransfer).toMatchObject({ applicability: "applicable", measures: { muPerHour: 60 } });
  });

  it("describes nonempty initial state as a finite initial condition", () => {
    const result = analyzeQueueScenario(scenario({
      initial_state: [{ order_id: "o1", person_ids: ["p1"], stage: "waiting_payment", arrival_s: 0 }],
    }))[0];
    expect(result?.applicability).toBe("applicable");
    expect(result?.reasons.join(" ")).toContain("condición inicial finita");
    expect(result?.reasons.join(" ")).not.toContain("estacionario vacío");
  });

  it("labels regular integrated service as an explicit reference approximation", () => {
    const stage = analyzeQueueScenario(scenario({
      engine_config: { contract_version: 1, mode: "regular", opening_time: "15:00:00", horizon_s: 28_800, integrated_workers: 1 },
    }))[0];
    expect(stage).toMatchObject({ id: "integrated", model: "M/M/1", servers: 1, applicability: "approximation" });
    expect(stage?.measures?.muPerHour).toBe(20);
    expect(stage?.reasons.join(" ")).toContain("referencia");
  });
});
