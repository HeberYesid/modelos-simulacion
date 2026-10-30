import type { ExperimentResult, RunResult } from "../api/types";
import { escapeHtml } from "../domain/format";
import {
  ANALYSIS_OBJECTIVES,
  analyzeExperimentObjective,
  analyzeRunCongestion,
  SIMULATION_ANALYSIS_NOTICE,
  type AnalysisObjective,
  type CandidateAdvice,
} from "../domain/scenario-analysis";

export function renderRunAnalysis(
  run: RunResult,
  options: { selectedExperimentRun?: boolean; editsNotRun?: boolean; showAssumptions?: boolean } = {},
): string {
  const report = analyzeRunCongestion(run);
  const sharedStaffCaveat = run.scenario.engine_config.mode === "regular"
    ? report.limitations.find((item) => item.toLocaleLowerCase().includes("modo regular"))
    : undefined;
  const otherLimitations = report.limitations.filter((item) => item !== sharedStaffCaveat);
  const evidence = report.evidence.length
    ? `<ul>${report.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  const limitations = otherLimitations.length
    ? `<details class="details-block analysis-limitations"><summary>Qué limita esta lectura</summary><div><ul>${otherLimitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></details>`
    : "";
  const scope = options.selectedExperimentRun
    ? `La prueba elegida de <strong>${escapeHtml(run.scenario.display_name)}</strong>. No resume todas las pruebas de la comparación.`
    : `Una prueba de <strong>${escapeHtml(run.scenario.display_name)}</strong>.`;
  const stale = options.editsNotRun
    ? `<p class="analysis-saved-note">Este análisis corresponde al resultado guardado; los cambios pendientes aún no se han ejecutado.</p>`
    : "";

  return `
    <section class="work-surface results-surface analysis-surface" aria-labelledby="congestion-analysis-title">
      <div class="surface-heading"><div><h2 id="congestion-analysis-title">${escapeHtml(report.title)}</h2>
        <p class="analysis-scope">${scope}</p></div></div>
      <div class="analysis-report">
        <p>${escapeHtml(report.summary)}</p>
        ${evidence}
        <div class="analysis-suggestion"><h3>Qué podrías probar</h3><p>${escapeHtml(report.suggestion)}</p></div>
        ${sharedStaffCaveat ? `<p class="analysis-caveat"><strong>Nota importante:</strong> ${escapeHtml(sharedStaffCaveat)}</p>` : ""}
        ${limitations}
      </div>
      ${options.showAssumptions === false ? "" : `<p class="analysis-assumptions">${escapeHtml(SIMULATION_ANALYSIS_NOTICE)}</p>`}
      ${stale}
    </section>`;
}

const CANDIDATE_STATUS_LABELS: Record<CandidateAdvice["status"], string> = {
  promising: "Opción para probar",
  tradeoff: "Mejora con una desventaja",
  unclear: "Sin ventaja clara",
  worse: "No mejora este objetivo",
  unavailable: "Faltan datos para comparar",
};

function renderStringList(items: readonly string[]): string {
  return items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
}

function renderCandidateAdvice(candidate: CandidateAdvice): string {
  const evidence = candidate.evidence.length
    ? `<h4>Qué apoya esta lectura</h4>${renderStringList(candidate.evidence)}`
    : "";
  const tradeoffs = candidate.tradeoffs.length
    ? `<h4>Qué podría cambiar a cambio</h4>${renderStringList(candidate.tradeoffs)}`
    : "";
  return `<li class="analysis-candidate">
    <h4><span class="analysis-candidate-status">${escapeHtml(CANDIDATE_STATUS_LABELS[candidate.status])}:</span> ${escapeHtml(candidate.name)}</h4>
    <p>${escapeHtml(candidate.summary)}</p>
    <details class="details-block analysis-candidate-details"><summary>Ver datos y qué probar</summary><div>
      ${evidence}${tradeoffs}
      <h4>Qué podrías probar</h4><p>${escapeHtml(candidate.suggestion)}</p>
    </div></details>
  </li>`;
}

export function renderObjectiveAnalysisContent(
  experiment: ExperimentResult,
  objective: AnalysisObjective,
  editsNotRun = false,
): string {
  const stale = editsNotRun
    ? `<p class="analysis-saved-note">Este análisis corresponde al resultado guardado; los cambios pendientes aún no se han ejecutado.</p>`
    : "";
  if (experiment.status !== "complete") {
    return `<div class="analysis-report analysis-unavailable">
      <h3>La comparación no terminó</h3>
      <p>No hay recomendaciones para este resultado incompleto.</p>
      ${stale}
    </div>`;
  }

  const report = analyzeExperimentObjective(experiment, objective);
  const reference = experiment.scenarios[0];
  const candidates = report.candidates.map(renderCandidateAdvice).join("");
  const limitations = report.limitations.length
    ? `<details class="details-block analysis-limitations"><summary>Qué limita esta comparación</summary><div>${renderStringList(report.limitations)}</div></details>`
    : "";
  const empty = report.candidates.length
    ? ""
    : `<p class="analysis-empty">No hay alternativas disponibles para comparar con esta meta.</p>`;

  return `<div class="analysis-report" aria-labelledby="analysis-objective-report-title">
    <h3 id="analysis-objective-report-title">${escapeHtml(report.title)}</h3>
    <p>${escapeHtml(report.summary)}</p>
    <p class="analysis-reference"><strong>Referencia:</strong> ${escapeHtml(reference?.display_name ?? "No identificada")}</p>
    ${candidates ? `<ul class="analysis-candidate-list">${candidates}</ul>` : empty}
    ${limitations}
    ${stale}
  </div>`;
}

export function renderObjectiveAnalysisPanel(
  experiment: ExperimentResult,
  objective: AnalysisObjective,
  editsNotRun = false,
): string {
  const options = ANALYSIS_OBJECTIVES.map(({ value, label }) =>
    `<option value="${escapeHtml(value)}"${objective === value ? " selected" : ""}>${escapeHtml(label)}</option>`,
  ).join("");

  return `<section class="work-surface results-surface analysis-surface objective-analysis-surface" aria-labelledby="objective-analysis-title">
    <div class="surface-heading objective-analysis-heading"><div><h2 id="objective-analysis-title">Qué puedes mejorar</h2>
      <p>Compara cada alternativa con la referencia guardada.</p></div>
      <div class="field analysis-objective-field"><label for="analysis-objective">¿Qué quieres mejorar?</label>
        <select id="analysis-objective" data-analysis-objective>${options}</select>
      </div>
    </div>
    <p class="analysis-assumptions">${escapeHtml(SIMULATION_ANALYSIS_NOTICE)}</p>
    <div id="analysis-objective-content" class="analysis-objective-content" role="status" aria-live="polite" aria-atomic="true">
      ${renderObjectiveAnalysisContent(experiment, objective, editsNotRun)}
    </div>
  </section>`;
}
