import type { ImportReport } from "../api/types";
import reports from "../replay/visit-import-reports.json";
import { observedVisits } from "../replay/observed";
import { escapeHtml } from "../domain/format";

const archive = reports as unknown as { visits: Array<{ visit_id: string; report: ImportReport }> };

export function preloadedVisitReport(visitId: string): ImportReport | null {
  const entry = archive.visits.find(visit => visit.visit_id === visitId);
  return entry ? structuredClone(entry.report) : null;
}

export function visitShortLabel(date: string): string {
  return date === "2026-10-20" ? "Martes 20/10 · promoción 2x1" : "Viernes 23/10 · día normal";
}

export function renderVisitDataPicker(selectedVisitId: string | null, pending: boolean): string {
  return `<section class="work-surface visit-data-surface" aria-labelledby="visit-data-title">
    <div class="surface-heading"><div><h2 id="visit-data-title">Visitas precargadas</h2>
      <p>Los registros de las dos visitas ya están listos para analizar. Elige un día para consultar su informe.</p></div></div>
    <div class="button-row" role="group" aria-label="Analizar una visita">
      ${observedVisits.map(visit => `<button type="button" class="secondary-button" data-visit-report="${escapeHtml(visit.visit_id)}" aria-pressed="${visit.visit_id === selectedVisitId}" ${pending ? "disabled" : ""}>${visitShortLabel(visit.date)} · ${visit.records.length} registros</button>`).join("")}
    </div>
    <p class="help-text">Son registros de estación, no cantidades de personas. Los informes conservan los retiros, correcciones y advertencias de calidad.</p>
    <button type="button" class="quiet-button" data-go-view="scenario">Ver escenarios de las visitas</button>
  </section>`;
}

export function renderVisitScenarioPicker(pending: boolean): string {
  return `<section class="work-surface visit-data-surface" aria-labelledby="visit-scenarios-title">
    <div class="surface-heading"><div><h2 id="visit-scenarios-title">Escenarios de las visitas</h2>
      <p>Cada visita tiene una configuración exploratoria editable con su ventana observada, personal reportado y promedios de los registros. Esa ventana no representa el horario completo del negocio.</p></div></div>
    <div class="button-row" role="group" aria-label="Preparar escenario de una visita">
      ${observedVisits.map(visit => `<button type="button" class="secondary-button" data-visit-scenario="${escapeHtml(visit.visit_id)}" ${pending ? "disabled" : ""}>${visitShortLabel(visit.date)}</button>`).join("")}
      <button type="button" class="quiet-button" data-load-synthetic ${pending ? "disabled" : ""}>Añadir demostración sintética</button>
    </div>
    <p class="subtle-note">Escenarios sin calibrar: los intervalos observados no separan trabajo activo, esperas externas y pausas. Se suponen grupos de una persona, estado inicial vacío y ausencia de retiros; revisa estos supuestos antes de interpretar resultados. La simulación genera nuevas llegadas, no reproduce las marcas exactas de las visitas.</p>
  </section>`;
}
