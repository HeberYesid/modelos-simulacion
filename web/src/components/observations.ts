import type { ImportReport, ObservationRow } from "../api/types";
import { escapeHtml, formatNumber } from "../domain/format";
import { correctionReason, qualityFlagLabel, translateEnum, translatePolicy, validationMessage } from "../domain/errors";
import { isPublicDemo } from "../deployment";

export type ObservationSourceMode = "file" | "paste";

function rowLabel(row: ObservationRow): string {
  return row.qualified_key ?? `${row.station ?? "registro"} · ${row.local_id ?? "sin ID"}`;
}

function affectedRows(report: ImportReport, keys: string[]): ObservationRow[] {
  const all = [...report.raw_rows, ...report.normalized_rows, ...report.excluded_rows];
  const bySourceLineAndKey = new Map<string, ObservationRow>();
  for (const row of all) {
    if (row.qualified_key && keys.includes(row.qualified_key)) {
      bySourceLineAndKey.set(`${row.line_number}\u0000${row.qualified_key}`, row);
    }
  }
  return [...bySourceLineAndKey.values()].sort((left, right) => left.line_number - right.line_number);
}

function renderAffectedTable(report: ImportReport, keys: string[]): string {
  const rows = affectedRows(report, keys);
  if (rows.length === 0) {
    return `<p class="help-text">El diagnóstico conserva ${formatNumber(keys.length, 0)} referencias de fila; el importador no devolvió una fila visible para esas claves.</p>`;
  }
  const body = rows.map((row) => `
    <tr>
      <td>${formatNumber(row.line_number, 0)}</td>
      <td><code>${escapeHtml(rowLabel(row))}</code></td>
      <td>${escapeHtml(row.station ? translateEnum(row.station) : "No identificado")}</td>
      <td>${escapeHtml(row.outcome ? translateEnum(row.outcome) : "No disponible")}</td>
      <td class="cell-wrap">${escapeHtml([...(row.validity_flags ?? []), ...(row.quality_flags ?? [])].map(qualityFlagLabel).join("; ") || "Sin marca de fila")}</td>
    </tr>`).join("");
  return `<div class="data-table-wrap"><table class="data-table"><caption class="visually-hidden">Filas asociadas con el diagnóstico</caption>
    <thead><tr><th>Línea</th><th>Clave de origen</th><th>Estación</th><th>Resultado</th><th>Marcas</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function renderIssue(report: ImportReport, index: number): string {
  const issue = report.issues[index];
  const label = issue.severity === "error" ? "problem" : issue.severity === "warning" ? "warning" : "";
  const rows = issue.row_keys.length > 0 ? `
    <details class="details-block">
      <summary>Ver filas afectadas (${formatNumber(issue.row_keys.length, 0)})</summary>
      <div>${renderAffectedTable(report, [...issue.row_keys])}</div>
    </details>` : "";
  const lineNumbers = issue.line_numbers.length > 0
    ? `<p>Líneas de origen: ${escapeHtml(issue.line_numbers.map((line) => formatNumber(line, 0)).join(", "))}.</p>`
    : "";
  return `
    <article class="audit-item" data-issue-code="${escapeHtml(issue.code)}">
      <div class="surface-heading">
        <h3>${escapeHtml(validationMessage(issue))}</h3>
        <span class="status-chip ${label}">${escapeHtml(translateEnum(issue.severity))}</span>
      </div>
      ${lineNumbers}${rows}
    </article>`;
}

function renderCorrection(report: ImportReport, index: number): string {
  const correction = report.corrections[index];
  const action = correction.action === "replace_field" ? "Reemplazo registrado" : "Fila excluida";
  const field = correction.field ? ` · ${correction.field}` : "";
  const change = correction.before != null || correction.after != null
    ? `<p>${correction.before == null ? "" : `Antes: <code>${escapeHtml(correction.before)}</code>`}
       ${correction.after == null ? "" : `Después: <code>${escapeHtml(correction.after)}</code>`}</p>`
    : "";
  return `
    <article class="audit-item">
      <div class="surface-heading">
        <h3>${action}${escapeHtml(field)}</h3>
        <span class="status-chip">${escapeHtml(translateEnum(correction.status))}</span>
      </div>
      <p><code>${escapeHtml(correction.row_key)}</code>${correction.line_number == null ? "" : ` · línea ${formatNumber(correction.line_number, 0)}`}</p>
      <p>${escapeHtml(correctionReason(correction.reason))}</p>
      <details class="details-block"><summary>Ver razón original del importador</summary><div><code>${escapeHtml(correction.reason)}</code></div></details>${change}
    </article>`;
}

function renderConflict(summary: ImportReport["station_summaries"][number]): string {
  const peak = summary.concurrency;
  if (!peak.exceeds_capacity || peak.reported_capacity == null) return "";
  const at = peak.peak_at ? String(peak.peak_at) : "hora no disponible";
  return `
    <div class="subtle-note source-note">
      <strong>${formatNumber(peak.peak_concurrency, 0)} intervalos de entrega coinciden a las ${escapeHtml(at)}; se reportaron ${formatNumber(peak.reported_capacity, 0)} preparadores.</strong>
      La fuente no permite asignar cada orden a una persona ni resolver el conflicto automáticamente.
    </div>`;
}

function renderReport(report: ImportReport): string {
  const included = report.normalized_rows.length;
  const withdrawalCount = report.normalized_rows.filter((row) => row.outcome === "withdrawn").length;
  const unknownGroups = report.normalized_rows.filter((row) => row.group_size == null).length;
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
  const issueMarkup = report.issues.length > 0
    ? report.issues.map((_, index) => renderIssue(report, index)).join("")
    : `<p class="subtle-note">No se devolvieron diagnósticos de calidad para esta fuente.</p>`;
  const correctionMarkup = report.corrections.length > 0
    ? report.corrections.map((_, index) => renderCorrection(report, index)).join("")
    : `<p class="help-text">No se registraron correcciones para esta carga.</p>`;
  const fatal = report.fatal_error
    ? `<div class="alert-box" role="alert"><h3>La fuente no se aceptó para resumen</h3><p>Los diagnósticos permanecen visibles. Corrige el archivo o selecciona la política de origen que corresponda.</p></div>`
    : "";
  const policyMessage = report.policy_status === "already_reflected"
    ? "La fuente corregida ya contiene los cambios aprobados; no se aplicaron una segunda vez."
    : report.policy_status === "applied"
      ? "Se aplicó el perfil aprobado y cada acción queda registrada debajo."
      : report.policy_status === "none"
        ? "La fuente se conserva sin aplicar el perfil de corrección."
        : "El servicio informa que la política seleccionada no pudo aplicarse a esta fuente.";

  return `
    <section class="work-surface audit-surface" aria-labelledby="audit-title">
      <div class="surface-heading">
        <div><h2 id="audit-title">${escapeHtml(report.source_name)}</h2>
          <p>${escapeHtml(translatePolicy(report.correction_policy))} · ${escapeHtml(translateEnum(report.policy_status))}</p>
        </div>
        <span class="status-chip ${report.fatal_error ? "problem" : ""}">${report.fatal_error ? "Requiere revisión" : "Importada"}</span>
      </div>
      ${fatal}
      <div class="report-summary" aria-label="Resumen de filas">
        <div class="report-count"><strong>${formatNumber(included, 0)}</strong><span>filas normalizadas</span></div>
        <div class="report-count highlight"><strong>${formatNumber(withdrawalCount, 0)}</strong><span>retiros registrados</span></div>
        <div class="report-count"><strong>${formatNumber(excluded, 0)}</strong><span>filas excluidas del perfil</span></div>
      </div>
      <p class="subtle-note">${escapeHtml(policyMessage)} Tamaño del grupo y cantidad de personas no observados en ${formatNumber(unknownGroups, 0)} filas. Esta fuente no calibra escenarios.</p>

      <div class="audit-list">
        <section aria-labelledby="station-summary-title">
          <div class="surface-heading"><div><h3 id="station-summary-title">Segmentos observados</h3>
            <p>En caja, el intervalo no mide trabajo activo. Entrega cubre preparación hasta la última entrega.</p></div></div>
          <div class="data-table-wrap"><table class="data-table">
            <caption class="visually-hidden">Conteos descriptivos por estación y fecha</caption>
            <thead><tr><th>Estación</th><th>Fecha</th><th>Filas</th><th>Retiros</th><th>Personal reportado</th><th>Espera observada</th><th>Intervalo observado</th><th>Consistencia</th></tr></thead>
            <tbody>${stationRows || `<tr><td colspan="8">No hay segmentos resumibles.</td></tr>`}</tbody>
          </table></div>
          ${report.station_summaries.map(renderConflict).join("")}
        </section>
        <section aria-labelledby="corrections-title">
          <div class="surface-heading"><div><h3 id="corrections-title">Correcciones y exclusiones</h3><p>Cada cambio conserva su referencia.</p></div></div>
          ${correctionMarkup}
        </section>
        <section aria-labelledby="issues-title">
          <div class="surface-heading"><div><h3 id="issues-title">Diagnósticos (${formatNumber(report.issues.length, 0)})</h3><p>Se conserva el contenido original de cada fila.</p></div></div>
          ${issueMarkup}
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
        <div class="surface-heading"><div><h2 id="source-title">Revisar una fuente</h2><p>CSV/TXT en UTF-8 · hasta 10 MiB · ${isPublicDemo() ? "el archivo se procesa en el servidor." : "procesamiento local."}</p></div></div>
        <form id="observations-form" novalidate>
          <div class="input-mode-row">
            <div class="segmented-control" role="group" aria-label="Forma de cargar observaciones">
              <button type="button" data-source-mode="file" aria-pressed="${panelFile}">Elegir archivo</button>
              <button type="button" data-source-mode="paste" aria-pressed="${!panelFile}">Pegar texto</button>
            </div>
            <span class="help-text">El archivo original no se modifica.</span>
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
          <div class="field correction-policy-field">
            <label for="correction-policy">Política de corrección</label>
            <select id="correction-policy" name="correction_policy" required>
              <option value="none">Sin correcciones</option>
              <option value="boquitas-2026-10-20-v1">Correcciones aprobadas · Boquitas 2026-10-20</option>
            </select>
            <p class="help-text">Reconoce las correcciones aprobadas y evita aplicarlas dos veces.</p>
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
