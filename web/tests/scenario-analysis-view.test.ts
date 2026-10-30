import { describe, expect, it } from "vitest";
import experimentFixture from "../contracts/fixtures/sample-experiment.json";
import experimentV2Fixture from "../contracts/fixtures/sample-experiment-v2.json";
import runFixture from "../contracts/fixtures/sample-run.json";
import runV2Fixture from "../contracts/fixtures/sample-run-v2.json";
import type { ExperimentResult, RunResult } from "../src/api/types";
import { renderResultsView } from "../src/components/results";
import { analyzeExperimentObjective } from "../src/domain/scenario-analysis";

function objectiveTradeoffExperiment(): ExperimentResult {
  const experiment = structuredClone(experimentV2Fixture) as unknown as ExperimentResult;
  const reference = experiment.scenarios[0];
  const candidate = experiment.scenarios[1];
  if (!reference || !candidate) throw new Error("The fixture needs a reference and a candidate.");
  candidate.display_name = "Menos espera, más retiros";
  candidate.engine_config.opening_time = reference.engine_config.opening_time;
  candidate.engine_config.horizon_s = reference.engine_config.horizon_s;
  candidate.initial_state = structuredClone(reference.initial_state);
  candidate.interarrival = structuredClone(reference.interarrival);
  candidate.group_sizes = structuredClone(reference.group_sizes);
  candidate.payment_active = structuredClone(reference.payment_active);
  candidate.preparation = structuredClone(reference.preparation);
  candidate.transfer_probability = reference.transfer_probability;
  candidate.transfer_confirmation = structuredClone(reference.transfer_confirmation);
  candidate.patience = structuredClone(reference.patience);

  experiment.n_requested = 2;
  experiment.n_valid = 2;
  const secondTrials = experiment.replication_results
    .filter((record) => record.replication_index === 0)
    .map((record) => ({ ...structuredClone(record), replication_index: 1 }));
  experiment.replication_results.push(...secondTrials);

  const setMetricValues = (
    metricId: string,
    values: { unit: "s" | "orders"; population: "orders" | "run"; cohort: "new" | "all"; reference: number; candidate: number },
  ): void => {
    for (const record of experiment.replication_results) {
      if (record.scenario_id !== reference.scenario_id && record.scenario_id !== candidate.scenario_id) continue;
      const metric = record.metrics?.metric_summaries.find((item) => item.metric_id === metricId);
      if (!metric) throw new Error(`The fixture is missing ${metricId}.`);
      Object.assign(metric, {
        value: record.scenario_id === reference.scenario_id ? values.reference : values.candidate,
        unit: values.unit,
        population: values.population,
        cohort: values.cohort,
        count: record.scenario_id === reference.scenario_id && values.reference === 0 ? 0 : 1,
        n_valid: record.scenario_id === reference.scenario_id && values.reference === 0 ? 0 : 1,
        unavailable_reason: null,
      });
    }
  };
  const setComparison = (
    metricId: string,
    values: { unit: "s" | "orders"; population: "orders" | "run"; cohort: "new" | "all"; mean: number; lower: number; upper: number },
    differences: number[],
  ): void => {
    const comparison = experiment.comparisons.find((item) =>
      item.reference_scenario_id === reference.scenario_id
      && item.candidate_scenario_id === candidate.scenario_id
      && item.metric_id === metricId,
    );
    if (!comparison) throw new Error(`The fixture is missing a comparison for ${metricId}.`);
    comparison.unit = values.unit;
    comparison.population = values.population;
    comparison.cohort = values.cohort;
    comparison.demand_matched = true;
    comparison.demand_tapes_identical = true;
    comparison.generation_assumptions_differ = false;
    comparison.replication_differences = differences;
    comparison.estimate = {
      ...comparison.estimate,
      n_requested: 2,
      n_valid: 2,
      mean: values.mean,
      lower: values.lower,
      upper: values.upper,
    };
  };

  setMetricValues("duration.permanence.completed.order.new", {
    unit: "s", population: "orders", cohort: "new", reference: 120, candidate: 60,
  });
  setComparison("duration.permanence.completed.order.new", {
    unit: "s", population: "orders", cohort: "new", mean: -60, lower: -65, upper: -55,
  }, [-60, -60]);
  setMetricValues("count.withdrawn.orders.new", {
    unit: "orders", population: "orders", cohort: "new", reference: 0, candidate: 1,
  });
  setComparison("count.withdrawn.orders.new", {
    unit: "orders", population: "orders", cohort: "new", mean: 1, lower: 0.5, upper: 1.5,
  }, [1, 1]);
  setMetricValues("drain.overtime_s", {
    unit: "s", population: "run", cohort: "all", reference: 80, candidate: 20,
  });
  setComparison("drain.overtime_s", {
    unit: "s", population: "run", cohort: "all", mean: -60, lower: -65, upper: -55,
  }, [-60, -60]);
  return experiment;
}

describe("plain-language result analysis", () => {
  it("shows a congestion diagnosis for a saved run", () => {
    const run = structuredClone(runFixture) as unknown as RunResult;
    run.scenario.display_name = "<img src=x onerror=alert(1)>";
    const markup = renderResultsView({
      completed: {
        kind: "run",
        value: run,
        jsonText: JSON.stringify(run),
        label: "Réplica guardada",
      },
      selectedRun: run,
      selection: null,
      observations: null,
      pending: null,
      pendingMessage: null,
      error: null,
      partialExperiment: null,
      editsNotRun: false,
      csvFiles: [],
      csvLabel: null,
    });

    expect(markup).toContain("Dónde se acumula la espera");
    expect(markup).toContain("Una prueba de <strong>&lt;img src=x onerror=alert(1)&gt;</strong>.");
    expect(markup).toContain("Qué podrías probar");
    expect(markup).toContain("Qué limita esta lectura");
    expect(markup).toContain("supuestos");
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(markup).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("says the diagnosis still refers to the saved result when edits are pending", () => {
    const run = structuredClone(runFixture) as unknown as RunResult;
    const markup = renderResultsView({
      completed: { kind: "run", value: run, jsonText: JSON.stringify(run), label: "Réplica guardada" },
      selectedRun: run,
      selection: null,
      observations: null,
      pending: null,
      pendingMessage: null,
      error: null,
      partialExperiment: null,
      editsNotRun: true,
      csvFiles: [],
      csvLabel: null,
    });

    expect(markup).toContain("Este análisis corresponde al resultado guardado");
  });

  it("shows objective choices and keeps the saved comparison and selected proof unchanged", () => {
    const experiment = structuredClone(experimentV2Fixture) as unknown as ExperimentResult;
    const run = structuredClone(runV2Fixture) as unknown as RunResult;
    const reference = experiment.scenarios[0];
    if (!reference) throw new Error("The experiment fixture needs a reference scenario.");
    const candidate = experiment.scenarios[1];
    if (!candidate) throw new Error("The experiment fixture needs a candidate scenario.");
    reference.display_name = "Escenario de referencia";
    candidate.display_name = "<img src=x onerror=alert(1)>";
    run.scenario.display_name = candidate.display_name;
    const originalJson = JSON.stringify(experiment);

    const render = (selectedRun: RunResult | null): string => renderResultsView({
      completed: {
        kind: "experiment",
        value: experiment,
        jsonText: originalJson,
        label: "Comparación guardada",
      },
      selectedRun,
      selection: selectedRun
        ? { scenarioId: candidate.scenario_id, replicationIndex: selectedRun.replication_index }
        : null,
      observations: null,
      pending: null,
      pendingMessage: null,
      error: null,
      partialExperiment: null,
      editsNotRun: true,
      analysisObjective: "withdrawals",
      csvFiles: [],
      csvLabel: null,
    });
    const markup = render(run);
    const markupWithoutSelectedRun = render(null);
    const panelStart = markup.indexOf('aria-labelledby="objective-analysis-title"');
    const panelEnd = markup.indexOf("</section>", panelStart);
    const objectivePanel = markup.slice(panelStart, panelEnd);
    const noRunPanelStart = markupWithoutSelectedRun.indexOf('aria-labelledby="objective-analysis-title"');
    const noRunPanelEnd = markupWithoutSelectedRun.indexOf("</section>", noRunPanelStart);
    const objectivePanelWithoutSelectedRun = markupWithoutSelectedRun.slice(noRunPanelStart, noRunPanelEnd);

    expect(objectivePanel).toContain("Qué puedes mejorar");
    expect(objectivePanel).toContain("¿Qué quieres mejorar?");
    expect(objectivePanel).toContain('value="time"');
    expect(objectivePanel).toContain('value="withdrawals" selected');
    expect(objectivePanel).toContain("Menos retiros por espera");
    expect(objectivePanel).toContain("sugerencias dependen de los supuestos");
    expect(objectivePanel).toContain("Faltan datos para comparar:");
    expect(objectivePanel).toContain("Este análisis corresponde al resultado guardado");
    expect(objectivePanel).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(objectivePanel).not.toContain("<img src=x onerror=alert(1)>");
    expect(markup).toContain("La prueba elegida de");
    expect(markup).toContain("No resume todas las pruebas de la comparación.");
    expect(markup).toContain("En el modo regular, el mismo personal cobra y prepara");
    expect(objectivePanel).toBe(objectivePanelWithoutSelectedRun);
    expect(JSON.stringify(experiment)).toBe(originalJson);
  });

  it("withholds objective advice when the saved comparison is incomplete", () => {
    const experiment = structuredClone(experimentFixture) as unknown as ExperimentResult;
    experiment.status = "partial" as ExperimentResult["status"];
    const markup = renderResultsView({
      completed: { kind: "experiment", value: experiment, jsonText: JSON.stringify(experiment), label: "Parcial" },
      selectedRun: null,
      selection: null,
      observations: null,
      pending: null,
      pendingMessage: null,
      error: null,
      partialExperiment: null,
      editsNotRun: false,
      csvFiles: [],
      csvLabel: null,
    });
    const contentStart = markup.indexOf('<div id="analysis-objective-content"');
    const contentEnd = markup.indexOf("</section>", contentStart);
    const objectiveContent = markup.slice(contentStart, contentEnd);

    expect(objectiveContent).toContain("La comparación no terminó");
    expect(objectiveContent).toContain("No hay recomendaciones");
    expect(objectiveContent).not.toContain("Qué podrías probar");
  });

  it("keeps a candidate's known downside visible beside its favorable result", () => {
    const experiment = objectiveTradeoffExperiment();
    const advice = analyzeExperimentObjective(experiment, "time").candidates[0];
    const timeEvidence = experiment.replication_results.map((record) => ({
      scenario: record.scenario_id,
      index: record.replication_index,
      metric: record.metrics?.metric_summaries.find((item) => item.metric_id === "duration.permanence.completed.order.new"),
    }));
    const markup = renderResultsView({
      completed: { kind: "experiment", value: experiment, jsonText: JSON.stringify(experiment), label: "Comparación" },
      selectedRun: null,
      selection: null,
      observations: null,
      pending: null,
      pendingMessage: null,
      error: null,
      partialExperiment: null,
      editsNotRun: false,
      analysisObjective: "time",
      csvFiles: [],
      csvLabel: null,
    });
    const panelStart = markup.indexOf('aria-labelledby="objective-analysis-title"');
    const panelEnd = markup.indexOf("</section>", panelStart);
    const objectivePanel = markup.slice(panelStart, panelEnd);
    const candidateStart = objectivePanel.indexOf("Mejora con una desventaja");
    const detailsStart = objectivePanel.indexOf('<details class="details-block analysis-candidate-details">', candidateStart);
    const visibleCandidate = objectivePanel.slice(candidateStart, detailsStart);

    expect(advice?.status, `${JSON.stringify(advice)}; ${JSON.stringify(timeEvidence)}`).toBe("tradeoff");
    expect(visibleCandidate).toContain("60 segundos menos");
    expect(visibleCandidate).toContain("1 pedido más en retiros por espera");
    expect(visibleCandidate).toContain("Menos espera, más retiros");
  });
});
