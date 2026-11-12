import type { ImportReport } from "../api/types";
import { escapeHtml, formatNumber } from "../domain/format";

export type ObservationSourceMode = "file" | "paste";

function renderReport(report: ImportReport): string {
  const included = report.normalized_rows.length;
  const withdrawalCount = report.normalized_rows.filter((row) => row.outcome === "withdrawn").length;
  const excluded = report.excluded_rows.length;
  const stationRows = report.station_summaries.map((summary) => `
    <tr>
      <td>${summary.station === "caja" ? "Caja" : "Entrega"}</td>
      <td>${escapeHtml(String(summary.observation_date))}</td>
      <td class="numeric">${formatNumber(summary.row_count, 0)}</td>
      <td class="numeric">${formatNumber(summary.withdrawn_count, 0)}</td>
      <td class="numeric">${summary.reported_staff == null ? "No disponible" : formatNumber(summary.reported_staff, 0)}</td>
      <td>${summary.wait.mean_s == null ? "No disponible" : `${formatNumber(summary.wait.mean_s, 2)} s`}<br><span class="help-text">${formatNumber(summary.wait.n_used, 0)} filas usadas · ${formatNumber(summary.wait.n_excluded, 0)} excluidas</span></td>
      <td>${summary.interval.mean_s == null ? "No disponible" : `${formatNumber(summary.interval.mean_s, 2)} s`}<br><span class="help-text">${formatNumber(summary.interval.n_used, 0)} filas usadas · ${formatNumber(summary.interval.n_excluded, 0)} excluidas</span></td>
      <td>${escapeHtml(summary.staff_capacity_consistent ? "Consistente" : "No se afirma una capacidad única")}</td>
    </tr>`).join("");
  const fatal = report.fatal_error
    ? `<div class="alert-box" role="alert"><h3>La fuente no se aceptó para resumen</h3><p>Corrige el archivo o selecciona la política de origen que corresponda.</p></div>`
    : "";
  return `
    <section class="work-surface audit-surface" aria-labelledby="audit-title">
      <div class="surface-heading">
        <div><h2 id="audit-title">${escapeHtml(report.source_name)}</h2>
        </div>
        <span class="status-chip ${report.fatal_error ? "problem" : ""}">${report.fatal_error ? "Requiere revisión" : "Importada"}</span>
      </div>
      ${fatal}
      <div class="report-summary" aria-label="Resumen de filas">
        <div class="report-count"><strong>${formatNumber(included, 0)}</strong><span>filas normalizadas</span></div>
        <div class="report-count highlight"><strong>${formatNumber(withdrawalCount, 0)}</strong><span>retiros registrados</span></div>
        <div class="report-count"><strong>${formatNumber(excluded, 0)}</strong><span>filas excluidas del perfil</span></div>
      </div>
      <div class="audit-list">
        <section aria-labelledby="station-summary-title">
          <div class="surface-heading"><div><h3 id="station-summary-title">Segmentos observados</h3>
            <p>En caja, el intervalo no mide trabajo activo. Entrega cubre preparación hasta la última entrega.</p></div></div>
          <div class="data-table-wrap"><table class="data-table">
            <caption class="visually-hidden">Conteos descriptivos por estación y fecha</caption>
            <thead><tr><th>Estación</th><th>Fecha</th><th>Filas</th><th>Retiros</th><th>Personal reportado</th><th>Espera observada</th><th>Intervalo observado</th><th>Consistencia</th></tr></thead>
            <tbody>${stationRows || `<tr><td colspan="8">No hay segmentos resumibles.</td></tr>`}</tbody>
          </table></div>
        </section>
      </div>
    </section>`;
}

export function renderObservationsView(options: {
  report: ImportReport | null;
  failureReport: ImportReport | null;
  mode: ObservationSourceMode;
  pending: boolean;
  error: string | null;
  measuredReplayMarkup?: string;
  preloadedVisitsMarkup?: string;
}): string {
  const panelFile = options.mode === "file";
  const firstUse = options.report === null && options.failureReport === null;
  return `
    <div class="page-intro">
      <h1>Datos observados</h1>
      <p>Analiza las visitas precargadas o importa registros de caja y entrega. Los informes descriptivos se mantienen separados de las simulaciones.</p>
    </div>
    ${options.preloadedVisitsMarkup ?? ""}
    ${firstUse ? `
      <section class="work-surface observations-starter" aria-labelledby="first-run-title">
        <div><h2 id="first-run-title">¿Primera vez? Empieza con una simulación</h2>
          <p>La demostración sintética ya está lista. No necesitas importar datos para comenzar y no está calibrada con la tienda.</p></div>
        <button class="primary-button" type="button" data-go-view="scenario">Preparar mi primera simulación</button>
      </section>` : ""}
    <div class="import-layout ${firstUse ? "first-use" : ""}">
      <section class="work-surface input-surface" aria-labelledby="source-title">
        <div class="surface-heading"><div><h2 id="source-title">Revisar una fuente</h2></div></div>
        <form id="observations-form" novalidate>
          <div class="input-mode-row">
            <div class="segmented-control" role="group" aria-label="Forma de cargar observaciones">
              <button type="button" data-source-mode="file" aria-pressed="${panelFile}">Elegir archivo</button>
              <button type="button" data-source-mode="paste" aria-pressed="${!panelFile}">Pegar texto</button>
            </div>
          </div>
          <div data-source-panel="file" ${panelFile ? "" : "hidden"}>
            <div class="file-drop">
              <strong>Selecciona el CSV o TXT que quieres revisar</strong>
              <span class="help-text">Elige un archivo CSV o TXT codificado en UTF-8.</span>
              <input class="visually-hidden file-input" id="observation-file" name="file" type="file" accept=".csv,.txt,text/csv,text/plain" aria-label="Archivo de observaciones CSV o TXT" ${panelFile ? "required" : "disabled"}>
              <label class="secondary-button file-picker" for="observation-file">Buscar archivo</label>
              <span id="observation-file-name" class="help-text" aria-live="polite">Ningún archivo seleccionado</span>
            </div>
          </div>
          <div data-source-panel="paste" ${panelFile ? "hidden" : ""}>
            <div class="field-stack">
              <label for="observation-text">Texto CSV/TXT</label>
              <textarea id="observation-text" name="pasted_text" maxlength="10485760" aria-describedby="paste-help" ${panelFile ? "disabled" : "required"} placeholder="lugar,fecha,tipo_dia,personal,id,hora_llegada,hora_inicio,hora_fin,hora_se_fue"></textarea>
              <p id="paste-help" class="help-text">Pega el encabezado y las filas.</p>
            </div>
          </div>
          <div class="button-row">
            <span id="import-pending" class="help-text" role="status" aria-live="polite">${options.pending ? "Leyendo la fuente…" : ""}</span>
            <button class="primary-button" type="submit" ${options.pending ? "disabled" : ""}>${options.pending ? "Leyendo…" : "Importar y revisar"}</button>
          </div>
        </form>
        ${options.error ? `<div class="alert-box" role="alert" tabindex="-1"><h3>No se pudo importar esta fuente</h3><p>${escapeHtml(options.error)}</p></div>` : ""}
      </section>
      <div class="audit-result">
        ${options.failureReport ? renderReport(options.failureReport) : ""}
        ${options.report ? renderReport(options.report) : ""}
      </div>
    </div>
    ${options.measuredReplayMarkup ?? ""}`;
}
