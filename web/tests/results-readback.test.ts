import { describe, expect, it } from "vitest";
import experimentFixture from "../contracts/fixtures/sample-experiment.json";
import runFixture from "../contracts/fixtures/sample-run.json";
import type { ExperimentResult, RunResult } from "../src/api/types";
import { renderResultsView } from "../src/components/results";

describe("saved result readback", () => {
  it("shows the confidence level stored in an experiment artifact", () => {
    const experiment = structuredClone(experimentFixture) as unknown as ExperimentResult;
    experiment.confidence_level = 0.9;
    const markup = renderResultsView({
      completed: {
        kind: "experiment",
        value: experiment,
        jsonText: JSON.stringify(experiment),
        label: "Experimento guardado",
      },
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

    expect(markup).toContain("Intervalo del 90 %");
    expect(markup).not.toContain("Intervalo del 95 %");
  });

  it("keeps a subsecond queue window at its saved duration", () => {
    const run = structuredClone(runFixture) as unknown as RunResult;
    run.metrics.horizon_s = 0.5;
    run.trace.window_end_s = 0.5;
    run.metrics.queue_series = [{ queue: "payment", start_s: 0, end_s: 0.5, order_count: 1, person_count: 1 }];
    const markup = renderResultsView({
      completed: { kind: "run", value: run, jsonText: JSON.stringify(run), label: "Réplica guardada" },
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

    expect(markup).toContain("00:00:00.5");
    expect(markup).not.toContain("00:00:01");
  });
});
