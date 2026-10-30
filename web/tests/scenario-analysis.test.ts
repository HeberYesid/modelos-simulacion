import { describe, expect, it } from "vitest";
import type { ExperimentResult, RunResult } from "../src/api/types";
import { analyzeExperimentObjective, analyzeRunCongestion, SIMULATION_ANALYSIS_NOTICE, type AnalysisObjective } from "../src/domain/scenario-analysis";

function runWithQueues(options: {
  mode?: "regular" | "tuesday";
  paymentMean: number | null;
  paymentMaximum?: number | null;
  preparationMean: number | null;
  preparationMaximum?: number | null;
}): RunResult {
  const summary = (
    metricId: string,
    value: number | null,
    unit: "orders",
  ) => ({
    metric_id: metricId,
    value,
    unit,
    population: "waiting_orders",
    cohort: "all" as const,
    count: 1,
    n_valid: value == null ? 0 : 1,
  });

  return {
    scenario: {
      scenario_id: "sample-run",
      display_name: "Turno de prueba",
      engine_config: { mode: options.mode ?? "tuesday" },
    },
    metrics: {
      metric_summaries: [
        summary("queue.payment.mean.orders", options.paymentMean, "orders"),
        summary("queue.payment.max.orders", options.paymentMaximum ?? null, "orders"),
        summary("queue.preparation.mean.orders", options.preparationMean, "orders"),
        summary("queue.preparation.max.orders", options.preparationMaximum ?? null, "orders"),
      ],
    },
  } as unknown as RunResult;
}

function makeObjectiveExperiment(): ExperimentResult {
  const metricDefinitions = [
    ["duration.permanence.completed.order.new", "s", "orders", "new"],
    ["count.withdrawn.orders.new", "orders", "orders", "new"],
    ["count.delivered.orders.new", "orders", "orders", "new"],
    ["drain.overtime_s", "s", "run", "all"],
  ] as const;
  const valuesByScenario = {
    reference: { permanence: 60, withdrawn: 1, delivered: 2, overtime: 5 },
    candidate: { permanence: 50, withdrawn: 1, delivered: 2, overtime: 5 },
  };
  const scenario = (scenarioId: string, displayName: string) => ({
    contract_version: 1,
    scenario_id: scenarioId,
    display_name: displayName,
    engine_config: {
      contract_version: 1,
      mode: "tuesday",
      opening_time: "15:00:00",
      horizon_s: 100,
      cashiers: 1,
      preparers: 4,
      integrated_workers: 0,
    },
    initial_state: [],
    interarrival: { kind: "constant", value_s: 30 },
    group_sizes: [{ size: 1, probability: 1 }],
    payment_active: { kind: "constant", value_s: 2 },
    preparation: { kind: "constant", value_s: 10 },
    transfer_probability: 0,
    transfer_confirmation: { kind: "constant", value_s: 5 },
    patience: null,
  });
  const comparison = (
    metricId: string,
    unit: string,
    population: string,
    cohort: string,
    difference: number,
  ) => ({
    reference_scenario_id: "reference",
    candidate_scenario_id: "candidate",
    metric_id: metricId,
    unit,
    population,
    cohort,
    replication_differences: [difference, difference],
    estimate: {
      method: "student_t",
      confidence_level: 0.95,
      n_requested: 2,
      n_valid: 2,
      mean: difference,
      lower: difference,
      upper: difference,
      reason: "zero_observed_variability",
      physical_bounds_crossed: [],
    },
    demand_matched: true,
    demand_tapes_identical: true,
    generation_assumptions_differ: false,
  });

  return {
    contract_version: 1,
    scenarios: [scenario("reference", "Referencia"), scenario("candidate", "Variante")],
    root_seed: 1,
    n_requested: 2,
    n_valid: 2,
    confidence_level: 0.95,
    replication_results: ["reference", "candidate"].flatMap((scenarioId) =>
      [0, 1].map((replicationIndex) => {
        const values = valuesByScenario[scenarioId as keyof typeof valuesByScenario];
        const scalarValues = [values.permanence, values.withdrawn, values.delivered, values.overtime];
        return {
          scenario_id: scenarioId,
          replication_index: replicationIndex,
          status: "complete",
          metrics: {
            metric_summaries: metricDefinitions.map(([metricId, unit, population, cohort], metricIndex) => {
              const value = scalarValues[metricIndex] ?? null;
              const emptyCount = metricId.startsWith("count.") && value === 0;
              return {
                metric_id: metricId,
                value,
                unit,
                population,
                cohort,
                count: emptyCount ? 0 : 1,
                n_valid: emptyCount ? 0 : 1,
              };
            }),
          },
          issues: [],
        };
      }),
    ),
    aggregate_estimates: [],
    comparisons: [
      comparison("duration.permanence.completed.order.new", "s", "orders", "new", -10),
      comparison("count.withdrawn.orders.new", "orders", "orders", "new", 0),
      comparison("count.delivered.orders.new", "orders", "orders", "new", 0),
      comparison("drain.overtime_s", "s", "run", "all", 0),
    ],
    status: "complete",
    issues: [],
    provenance: ["synthetic_demo"],
  } as unknown as ExperimentResult;
}

type EditableMetricSummary = {
  metric_id: string;
  value: number | null;
  unit: string;
  population: string;
  cohort: string;
  count: number;
  n_valid: number;
  unavailable_reason?: string | null;
};

type EditableEstimate = {
  method?: string;
  confidence_level?: number;
  n_requested: number;
  n_valid: number;
  mean: number | null;
  lower: number | null;
  upper: number | null;
  reason?: string | null;
};

type EditableComparison = {
  reference_scenario_id: string;
  candidate_scenario_id: string;
  metric_id: string;
  unit: string;
  population: string;
  cohort: string;
  replication_differences: Array<number | null>;
  estimate: EditableEstimate;
  demand_matched: boolean;
  demand_tapes_identical: boolean | null;
  generation_assumptions_differ: boolean;
};

type EditableExperiment = {
  status: string;
  n_requested: number;
  n_valid: number;
  issues: unknown[];
  scenarios: Array<{
    scenario_id: string;
    display_name: string;
    patience: unknown | null;
    engine_config: { opening_time: string; horizon_s: number; mode: string; [key: string]: unknown };
    initial_state: unknown[];
    [key: string]: unknown;
  }>;
  replication_results: Array<{
    scenario_id: string;
    replication_index: number;
    status: string;
    metrics: { metric_summaries: EditableMetricSummary[] } | null;
  }>;
  comparisons: EditableComparison[];
  aggregate_estimates: Array<{ scenario_id?: string; metric_id?: string; estimate?: { mean?: number | null } }>;
};

function editableObjectiveExperiment(): EditableExperiment {
  return structuredClone(makeObjectiveExperiment()) as unknown as EditableExperiment;
}

function editableComparison(experiment: EditableExperiment, metricId: string): EditableComparison {
  const comparison = experiment.comparisons.find((item) => item.metric_id === metricId);
  if (!comparison) throw new Error(`Fixture is missing ${metricId}`);
  return comparison;
}

function editableSummary(
  experiment: EditableExperiment,
  scenarioId: string,
  replicationIndex: number,
  metricId: string,
): EditableMetricSummary {
  const record = experiment.replication_results.find((item) =>
    item.scenario_id === scenarioId && item.replication_index === replicationIndex,
  );
  const summary = record?.metrics?.metric_summaries.find((item) => item.metric_id === metricId);
  if (!summary) throw new Error(`Fixture is missing ${metricId} for ${scenarioId}:${replicationIndex}`);
  return summary;
}

function setPairedValues(
  experiment: EditableExperiment,
  metricId: string,
  referenceValues: number[],
  candidateValues: number[],
): void {
  referenceValues.forEach((referenceValue, replicationIndex) => {
    const candidateValue = candidateValues[replicationIndex];
    if (candidateValue == null) throw new Error("Fixture candidate value is missing");
    for (const [scenarioId, value] of [["reference", referenceValue], ["candidate", candidateValue]] as const) {
      const summary = editableSummary(experiment, scenarioId, replicationIndex, metricId);
      summary.value = value;
      if (metricId.startsWith("count.")) {
        summary.count = value;
        summary.n_valid = value === 0 ? 0 : 1;
      }
    }
  });
  const comparison = editableComparison(experiment, metricId);
  comparison.replication_differences = referenceValues.map((referenceValue, index) => {
    const candidateValue = candidateValues[index];
    if (candidateValue == null) throw new Error("Fixture candidate value is missing");
    return candidateValue - referenceValue;
  });
}

function setSavedInterval(
  experiment: EditableExperiment,
  metricId: string,
  mean: number,
  lower: number,
  upper: number,
): void {
  Object.assign(editableComparison(experiment, metricId).estimate, { mean, lower, upper });
}

function analyzeEditableExperiment(
  experiment: EditableExperiment,
  objective: AnalysisObjective = "time",
) {
  return analyzeExperimentObjective(experiment as unknown as ExperimentResult, objective);
}

describe("scenario analysis at the saved-result boundary", () => {
  it("locates a larger payment queue without blaming only the cashier in regular mode", () => {
    const report = analyzeRunCongestion(runWithQueues({
      mode: "regular",
      paymentMean: 1.5,
      paymentMaximum: 4,
      preparationMean: 0,
      preparationMaximum: 0,
    }));

    expect(report.summary).toContain("antes del pago");
    expect(report.evidence.join(" ")).toContain("1,5");
    expect(report.evidence.join(" ")).toContain("4");
    expect(report.limitations.join(" ")).toContain("cobra y prepara");
    expect(report.suggestion).toContain("apoyo para cobrar y preparar");
    expect(report.suggestion).toContain("mismas llegadas y tiempos");
  });

  it("keeps equal averages tied while explaining which queue had the larger peak", () => {
    const report = analyzeRunCongestion(runWithQueues({
      paymentMean: 0.5,
      paymentMaximum: 2,
      preparationMean: 0.5,
      preparationMaximum: 3,
    }));

    expect(report.summary).toContain("mismo promedio");
    expect(report.summary).toContain("máximo");
    expect(report.summary).toContain("preparación");
  });

  it("does not treat a missing queue average as an empty queue", () => {
    const report = analyzeRunCongestion(runWithQueues({
      paymentMean: null,
      preparationMean: 1.25,
      preparationMaximum: 3,
    }));

    expect(report.summary).toContain("no se toma como cero");
    expect(report.summary).not.toContain("se acumula más");
    expect(report.evidence.join(" ")).toContain("promedio no disponible");
  });

  it("points to preparation only when its saved average is larger", () => {
    const report = analyzeRunCongestion(runWithQueues({
      paymentMean: 0.5,
      paymentMaximum: 1,
      preparationMean: 1.5,
      preparationMaximum: 5,
    }));

    expect(report.summary).toContain("después del pago");
    expect(report.suggestion).toContain("apoyo en preparación");
  });

  it("suggests a demand scenario without naming a queue when no queue accumulated", () => {
    const report = analyzeRunCongestion(runWithQueues({
      paymentMean: 0,
      paymentMaximum: 0,
      preparationMean: 0,
      preparationMaximum: 0,
    }));

    expect(report.summary).toContain("no se acumuló cola");
    expect(report.suggestion).toContain("llegan más pedidos");
    expect(report.suggestion).not.toContain("caja");
    expect(report.suggestion).not.toContain("preparación");
  });

  it("uses the saved paired time interval and labels the new-order objective plainly", () => {
    const report = analyzeExperimentObjective(makeObjectiveExperiment(), "time");

    expect(report.label).toBe("Recibir el pedido más pronto");
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]?.status).toBe("promising");
    expect(report.candidates[0]?.evidence.join(" ")).toContain("10 segundos menos");
    expect(report.candidates[0]?.evidence.join(" ")).toContain("promedio");
    expect(report.candidates[0]?.tradeoffs.join(" ")).not.toContain("No se pudo aclarar");
    expect(report.summary).toContain("Referencia");
    expect(report.limitations.join(" ")).toContain("pedidos nuevos");
    expect(SIMULATION_ANALYSIS_NOTICE).toContain("supuestos");
  });

  it.each([
    ["crosses zero", -10, -30, 10, "unclear", "Todavía no se ve una ventaja clara"],
    ["touches zero from below", -10, -20, 0, "unclear", "Todavía no se ve una ventaja clara"],
    ["touches zero from above", 10, 0, 20, "unclear", "Todavía no se ve una ventaja clara"],
    ["is entirely worse", 10, 10, 10, "worse", "10 segundos más"],
    ["shows an exact tie", 0, 0, 0, "unclear", "no cambió"],
  ] as const)("uses the saved interval when it %s", (_label, mean, lower, upper, status, wording) => {
    const experiment = editableObjectiveExperiment();
    setPairedValues(experiment, "duration.permanence.completed.order.new", [60, 60], [60 + mean, 60 + mean]);
    setSavedInterval(experiment, "duration.permanence.completed.order.new", mean, lower, upper);

    const advice = analyzeEditableExperiment(experiment).candidates[0];

    expect(advice?.status).toBe(status);
    expect(advice?.summary).toContain(wording);
    expect(advice?.summary).not.toContain("ganadora");
  });

  const unavailableChanges: Array<[string, (experiment: EditableExperiment) => void]> = [
    ["partial experiment", (experiment) => { experiment.status = "partial"; }],
    ["only one trial", (experiment) => { experiment.n_requested = 1; experiment.n_valid = 1; }],
    ["missing trial", (experiment) => { experiment.replication_results.pop(); }],
    ["duplicate trial", (experiment) => {
      experiment.replication_results[1] = structuredClone(experiment.replication_results[0]!);
    }],
    ["missing interval limit", (experiment) => {
      editableComparison(experiment, "duration.permanence.completed.order.new").estimate.upper = null;
    }],
    ["nonfinite interval limit", (experiment) => {
      editableComparison(experiment, "duration.permanence.completed.order.new").estimate.lower = -Infinity;
    }],
    ["inverted interval", (experiment) => {
      setSavedInterval(experiment, "duration.permanence.completed.order.new", -10, 0, -20);
    }],
    ["different saved population", (experiment) => {
      editableComparison(experiment, "duration.permanence.completed.order.new").population = "people";
    }],
    ["different opening time", (experiment) => { experiment.scenarios[1]!.engine_config.opening_time = "16:00:00"; }],
    ["different opening duration", (experiment) => { experiment.scenarios[1]!.engine_config.horizon_s = 200; }],
    ["different initial orders", (experiment) => { experiment.scenarios[1]!.initial_state = [{ order_id: "initial" }]; }],
    ["different actual arrival assumptions", (experiment) => {
      experiment.scenarios[1]!.interarrival = { kind: "constant", value_s: 15 };
    }],
  ];

  it.each(unavailableChanges)("withholds advice for %s", (_label, change) => {
    const experiment = editableObjectiveExperiment();
    change(experiment);

    const advice = analyzeEditableExperiment(experiment).candidates[0];

    expect(advice?.status).toBe("unavailable");
    expect(advice?.summary).toContain("No se puede recomendar");
  });

  it("does not recommend fewer withdrawals when patience is disabled", () => {
    const experiment = editableObjectiveExperiment();
    setPairedValues(experiment, "count.withdrawn.orders.new", [0, 0], [0, 0]);
    setSavedInterval(experiment, "count.withdrawn.orders.new", 0, 0, 0);

    const advice = analyzeEditableExperiment(experiment, "withdrawals").candidates[0];

    expect(advice?.status).toBe("unavailable");
    expect(advice?.summary).toContain("falta configurar la paciencia");
  });

  it("accepts a legitimate zero withdrawal count while keeping unavailable durations missing", () => {
    const experiment = editableObjectiveExperiment();
    for (const scenario of experiment.scenarios) scenario.patience = { kind: "constant", value_s: 30 };
    setPairedValues(experiment, "count.withdrawn.orders.new", [1, 1], [0, 0]);
    setSavedInterval(experiment, "count.withdrawn.orders.new", -1, -1, -1);

    const withdrawalReport = analyzeEditableExperiment(experiment, "withdrawals");
    expect(withdrawalReport.candidates[0]?.status).toBe("promising");
    expect(withdrawalReport.candidates[0]?.summary).toContain("1 pedido menos");
    expect(withdrawalReport.limitations.join(" ")).toContain("no como personas");

    Object.assign(editableSummary(experiment, "candidate", 0, "duration.permanence.completed.order.new"), {
      value: null, count: 0, n_valid: 0, unavailable_reason: "no_eligible_samples",
    });
    expect(analyzeEditableExperiment(experiment).candidates[0]?.status).toBe("unavailable");
    const missingGuard = analyzeEditableExperiment(experiment, "withdrawals").candidates[0];
    expect(missingGuard?.summary).toContain("No se pudo revisar tiempo hasta recibir el pedido");
    expect(missingGuard?.summary).toContain("no se puede afirmar que no haya cambios");
  });

  it("withholds a recommendation when paired differences or their saved mean conflict with run metrics", () => {
    const changedRunValue = editableObjectiveExperiment();
    editableSummary(
      changedRunValue,
      "candidate",
      0,
      "duration.permanence.completed.order.new",
    ).value = 120;

    const changedMean = editableObjectiveExperiment();
    editableComparison(changedMean, "duration.permanence.completed.order.new").estimate.mean = -9;

    const changedMethod = editableObjectiveExperiment();
    editableComparison(changedMethod, "duration.permanence.completed.order.new").estimate.method = "other";

    const changedConfidence = editableObjectiveExperiment();
    editableComparison(changedConfidence, "duration.permanence.completed.order.new").estimate.confidence_level = 0.5;

    expect(analyzeEditableExperiment(changedRunValue).candidates[0]?.status).toBe("unavailable");
    expect(analyzeEditableExperiment(changedMean).candidates[0]?.status).toBe("unavailable");
    expect(analyzeEditableExperiment(changedMethod).candidates[0]?.status).toBe("unavailable");
    expect(analyzeEditableExperiment(changedConfidence).candidates[0]?.status).toBe("unavailable");
  });

  it("shows slower delivery as a tradeoff when the closing objective improves", () => {
    const experiment = editableObjectiveExperiment();
    const closing = editableComparison(experiment, "drain.overtime_s");
    closing.replication_differences = [-5, -5];
    Object.assign(closing.estimate, { mean: -5, lower: -5, upper: -5 });
    const time = editableComparison(experiment, "duration.permanence.completed.order.new");
    time.replication_differences = [10, 10];
    Object.assign(time.estimate, { mean: 10, lower: 10, upper: 10 });

    for (const replicationIndex of [0, 1]) {
      editableSummary(experiment, "candidate", replicationIndex, "drain.overtime_s").value = 0;
      editableSummary(experiment, "candidate", replicationIndex, "duration.permanence.completed.order.new").value = 70;
    }

    const advice = analyzeEditableExperiment(experiment, "closing").candidates[0];
    expect(advice?.status).toBe("tradeoff");
    expect(advice?.summary).toContain("tiempo hasta recibir el pedido");
    expect(advice?.tradeoffs.join(" ")).toContain("10");
  });

  it("shows more withdrawals as a tradeoff with a better service-time estimate", () => {
    const experiment = editableObjectiveExperiment();
    setPairedValues(experiment, "count.withdrawn.orders.new", [1, 1], [2, 2]);
    setSavedInterval(experiment, "count.withdrawn.orders.new", 1, 1, 1);

    const advice = analyzeEditableExperiment(experiment, "time").candidates[0];
    expect(advice?.status).toBe("tradeoff");
    expect(advice?.summary).toContain("retiros por espera");
    expect(advice?.tradeoffs.join(" ")).toContain("1 pedido más");
  });

  it("shows fewer deliveries as a tradeoff with a better service-time estimate", () => {
    const experiment = editableObjectiveExperiment();
    setPairedValues(experiment, "count.delivered.orders.new", [2, 2], [1, 1]);
    setSavedInterval(experiment, "count.delivered.orders.new", -1, -1, -1);

    const advice = analyzeEditableExperiment(experiment, "time").candidates[0];
    expect(advice?.status).toBe("tradeoff");
    expect(advice?.summary).toContain("entregas de pedidos nuevos");
    expect(advice?.tradeoffs.join(" ")).toContain("1 pedido menos");
  });

  it("keeps an uncertain adverse average visible even beside a confirmed downside", () => {
    const experiment = editableObjectiveExperiment();
    setPairedValues(experiment, "count.withdrawn.orders.new", [1, 1], [2, 2]);
    setSavedInterval(experiment, "count.withdrawn.orders.new", 1, 1, 1);
    setPairedValues(experiment, "drain.overtime_s", [5, 5], [0, 20]);
    setSavedInterval(experiment, "drain.overtime_s", 5, -122.062047, 132.062047);

    const advice = analyzeEditableExperiment(experiment).candidates[0];

    expect(advice?.status).toBe("tradeoff");
    expect(advice?.summary).toContain("1 pedido más");
    expect(advice?.summary).toContain("5 segundos más");
    expect(advice?.summary).toContain("tiempo después del cierre");
    expect(advice?.summary).toContain("Todavía no está claro si el empeoramiento se mantiene");
  });
});
