import type { ImportReport } from "../api/types";
import reports from "../replay/visit-import-reports.json";
import { observedVisits } from "../replay/observed";
import { escapeHtml, formatNumber } from "../domain/format";
import { calculateObservedQueueMeasures } from "../domain/observed-queue-metrics";

const archive = reports as unknown as { visits: Array<{ visit_id: string; report: ImportReport }> };

export function preloadedVisitReport(visitId: string): ImportReport | null {
  const entry = archive.visits.find(visit => visit.visit_id === visitId);
  return entry ? structuredClone(entry.report) : null;
}

export function visitShortLabel(date: string): string {
  return date === "2026-10-20" ? "Martes 20/10 · promoción 2x1" : "Viernes 23/10 · día normal";
}

export function renderVisitDataPicker(selectedVisitId: string | null, pending: boolean): string {
  const visitMetrics = observedVisits.map((visit) => {
    const measures = calculateObservedQueueMeasures(visit);
    const value = (number: number | null, suffix = "") => number === null
      ? "No disponible"
      : `${formatNumber(number, 2)}${suffix}`;
    const stations = measures.map((measure) => `<div class="queue-model-stage" data-observed-station="${measure.station}">
      <h4>${measure.station === "caja" ? "Caja" : "Entrega"}</h4>
      <dl class="event-detail">
        <div><dt>Lq · promedio esperando</dt><dd>${value(measure.Lq, " órdenes")}</dd></div>
        <div><dt>L · promedio en la estación</dt><dd>${value(measure.L, " órdenes")}</dd></div>
        <div><dt>Wq · espera media observada</dt><dd>${value(measure.WqSeconds, " s")}</dd></div>
        <div><dt>W · tiempo medio registrado</dt><dd>${value(measure.WSeconds, " s")}</dd></div>
        <div><dt>P(ocupada) · alguna orden registrada</dt><dd>${value(measure.pOccupied === null ? null : measure.pOccupied * 100, " %")}</dd></div>
        <div><dt>P(vacía) · ninguna orden registrada</dt><dd>${value(measure.pEmpty === null ? null : measure.pEmpty * 100, " %")}</dd></div>
      </dl>
      <p class="help-text">W y Wq usan ${measure.completedOrders} registros con llegada, inicio y fin conocidos.</p>
    </div>`).join("");
    return `<details class="details-block observed-visit-metrics">
      <summary>Indicadores observados · ${escapeHtml(visitShortLabel(visit.date))}</summary>
      <div class="queue-model-list">${stations}</div>
      <p class="provenance-line">L y Lq se calculan durante el intervalo observado. P(ocupada) mide el porcentaje de tiempo con alguna orden registrada en la estación, en fila o en servicio. Los valores describen los registros disponibles.</p>
      <p class="provenance-line">ρ y estabilidad del negocio: no estimables con estas visitas. Faltan datos de capacidad efectiva, trabajo activo y cobertura de las llegadas. El martes había una fila inicial sin conteo y hay marcas superpuestas en entrega. El viernes se registró una pausa durante la preparación.</p>
    </details>`;
  }).join("");
  return `<section class="work-surface visit-data-surface" aria-labelledby="visit-data-title">
    <div class="surface-heading"><div><h2 id="visit-data-title">Visitas precargadas</h2>
      <p>Los registros de las dos visitas ya están listos para analizar. Elige un día para consultar su informe.</p></div></div>
    <div class="button-row" role="group" aria-label="Analizar una visita">
      ${observedVisits.map(visit => `<button type="button" class="secondary-button" data-visit-report="${escapeHtml(visit.visit_id)}" aria-pressed="${visit.visit_id === selectedVisitId}" ${pending ? "disabled" : ""}>${visitShortLabel(visit.date)} · ${visit.records.length} registros</button>`).join("")}
    </div>
    <p class="help-text">Son registros de estación, no cantidades de personas. Los informes conservan los retiros, correcciones y advertencias de calidad.</p>
    ${visitMetrics}
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
