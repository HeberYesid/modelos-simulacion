import type { ExperimentResult, ImportReport, MetricSummary, RunResult } from "../api/types";
import { paymentMethodLabel } from "../domain/payment";
import { escapeHtml, formatClockFromOpening, formatNumber, formatSeconds, safeFileName } from "../domain/format";
import { issueMessage, systemAssumption, translateEnum } from "../domain/errors";
import { renderObjectiveAnalysisPanel, renderRunAnalysis } from "./scenario-analysis";
import type { AnalysisObjective } from "../domain/scenario-analysis";
import { renderQueueModels } from "./queue-models";

export type CompletedResult =
  | { kind: "run"; value: RunResult; jsonText: string; label: string }
  | { kind: "experiment"; value: ExperimentResult; jsonText: string; label: string };

export interface ReplaySelection {
  scenarioId: string;
  replicationIndex: number;
}

const METRIC_LABELS: Record<string, string> = {
  "count.admitted.orders.new": "Órdenes admitidas en la ventana",
  "count.admitted.people.new": "Personas admitidas en la ventana",
  "count.delivered.orders.new": "Órdenes entregadas",
  "count.initialized.orders": "Órdenes presentes al abrir",
  "count.initialized.people": "Personas presentes al abrir",
  "throughput.window.delivery.orders_per_s": "Ritmo de entrega · órdenes por segundo",
  "throughput.window.delivery.people_per_s": "Ritmo de entrega · personas por segundo",
  "drain.end_s": "Fin del vaciado",
  "drain.overtime_s": "Tiempo después del cierre",
  "duration.payment_wait.served.order.new": "Espera de pago",
  "duration.permanence.completed.order.new": "Permanencia",
  "resource.all.total.active_fraction": "Uso activo del personal",
};

const OVERVIEW_METRIC_IDS = [
  "count.admitted.orders.new",
  "count.delivered.orders.new",
  "duration.payment_wait.served.order.new",
  "duration.permanence.completed.order.new",
  "resource.all.total.active_fraction",
];

const METRIC_TOKENS: Record<string, string> = {
  count: "Cantidad",
  admitted: "admitidas",
  initialized: "órdenes iniciales",
  orders: "órdenes",
  people: "personas",
  delivered: "entregadas",
  abandoned: "retiradas",
  window: "ventana de admisión",
  duration: "Duración",
  payment_wait: "espera antes del pago",
  transaction_elapsed: "transacción completa",
  preparation_queue_wait: "espera para preparación",
  preparation_elapsed: "preparación transcurrida",
  preparation_active: "trabajo activo de preparación",
  preparation_paused: "tiempo en pausa de preparación",
  preparation_pause_count: "cantidad de pausas de preparación",
  permanence: "permanencia",
  withdrawal_wait: "espera hasta retiro",
  order: "por orden",
  person: "por persona",
  served: "atendida",
  withdrawn: "retirada",
  new: "órdenes nuevas",
  all: "todas las cohortes",
  queue: "Fila",
  payment: "pago",
  preparation: "preparación",
  mean: "promedio",
  max: "máximo",
  resource: "Uso del recurso",
  cashier: "caja",
  preparer: "preparación",
  integrated: "equipo integrado",
  active: "activo",
  reserved: "reservado",
  total: "total",
  external_confirmation: "confirmación externa",
  active_fraction: "fracción de tiempo activo",
  reserved_fraction: "fracción de tiempo reservado",
  throughput: "Ritmo de entrega",
  delivery: "entrega",
  orders_per_s: "órdenes por segundo",
  people_per_s: "personas por segundo",
  drain: "Después del cierre",
  end_s: "fin del vaciado",
  overtime_s: "tiempo adicional",
};

const UNAVAILABLE_REASONS: Record<string, string> = {
  no_eligible_samples: "No hay muestras válidas para este indicador.",
  insufficient_valid_replications: "No hay dos o más réplicas válidas para estimar un intervalo.",
  pool_unavailable: "Este equipo no existe en el modo seleccionado.",
  incomplete_history: "El historial inicial no contiene los tiempos necesarios para este cálculo.",
  mixed_unavailable_reasons: "La medida falta por más de una razón entre las órdenes revisadas.",
  unknown_arrival_time: "La hora de llegada previa es desconocida.",
  zero_observed_variability: "Las réplicas válidas produjeron el mismo valor.",
};

function metricLabel(metricId: string): string {
  if (METRIC_LABELS[metricId]) return METRIC_LABELS[metricId];
  const parts = metricId.split(".").map((part) => METRIC_TOKENS[part] ?? part.replaceAll("_", " "));
  return parts.join(" · ");
}

function populationLabel(population: string): string {
  const map: Record<string, string> = {
    order: "órdenes",
    orders: "órdenes",
    person: "personas",
    people: "personas",
    workers: "personas trabajadoras",
    run: "ejecución",
    delivered_orders: "órdenes entregadas",
    delivered_people: "personas de órdenes entregadas",
    admitted_orders: "órdenes admitidas",
    admitted_people: "personas admitidas",
  };
  return map[population] ?? population.replaceAll("_", " ");
}

function unitLabel(unit: string): string {
  const map: Record<string, string> = {
    s: "s",
    seconds: "segundos",
    fraction: "%",
    orders: "órdenes",
    people: "personas",
    "orders/s": "órdenes/s",
    "people/s": "personas/s",
  };
  return map[unit] ?? unit;
}

function displayValue(value: number | null, unit: string): string {
  if (value == null || !Number.isFinite(value)) return "No disponible";
  return unit === "fraction" ? `${formatNumber(value * 100, 2)} %` : `${formatNumber(value, 3)} ${unitLabel(unit)}`;
}

function unavailableReason(reason: string | null | undefined): string {
  if (!reason) return "No hay una razón disponible en el contrato.";
  return UNAVAILABLE_REASONS[reason] ?? "El contrato marca este indicador como no disponible.";
}

function cohortLabel(cohort: string): string {
  const labels: Record<string, string> = {
    all: "todas las órdenes del escenario",
    new: "órdenes nuevas admitidas durante la ventana",
    initialized: "órdenes que ya estaban presentes al abrir",
  };
  return labels[cohort] ?? translateEnum(cohort);
}

function renderMetricRows(metrics: MetricSummary[]): string {
  return metrics.map((metric) => `
    <tr>
      <td><strong>${escapeHtml(metricLabel(metric.metric_id))}</strong><br><span class="help-text">${escapeHtml(populationLabel(metric.population))} · ${escapeHtml(cohortLabel(metric.cohort))}</span>
        <details class="details-block"><summary>Ver identificador y validez</summary><div><code>${escapeHtml(metric.metric_id)}</code><p>Registros revisados: ${formatNumber(metric.count, 0)} · válidos: ${formatNumber(metric.n_valid, 0)}${metric.denominator == null ? "" : ` · denominador: ${formatNumber(metric.denominator, 2)}`}</p></div></details>
      </td>
      <td class="metric-value ${metric.value == null ? "metric-unavailable" : ""}">${metric.value == null ? `${escapeHtml(unavailableReason(metric.unavailable_reason))}` : escapeHtml(displayValue(metric.value, metric.unit))}</td>
      <td>${metric.mean == null ? "No disponible" : escapeHtml(displayValue(metric.mean, metric.unit))}</td>
      <td>${metric.median == null ? "No disponible" : escapeHtml(displayValue(metric.median, metric.unit))}</td>
      <td>${metric.p95 == null ? "No disponible" : escapeHtml(displayValue(metric.p95, metric.unit))}</td>
      <td>${metric.maximum == null ? "No disponible" : escapeHtml(displayValue(metric.maximum, metric.unit))}</td>
    </tr>`).join("");
}

function renderOverviewMetricRows(metrics: MetricSummary[]): string {
  return metrics.map((metric) => `
    <tr>
      <td><strong>${escapeHtml(metricLabel(metric.metric_id))}</strong><br><span class="help-text">${escapeHtml(populationLabel(metric.population))} · ${escapeHtml(cohortLabel(metric.cohort))}</span></td>
      <td class="metric-value ${metric.value == null ? "metric-unavailable" : ""}">${metric.value == null ? escapeHtml(unavailableReason(metric.unavailable_reason)) : escapeHtml(displayValue(metric.value, metric.unit))}</td>
    </tr>`).join("");
}

function renderRunMetrics(run: RunResult): string {
  const metrics = run.metrics.metric_summaries.filter((metric) =>
    !metric.metric_id.includes(".external_confirmation.") || metric.value !== 0,
  );
  const metricById = new Map(metrics.map((metric) => [metric.metric_id, metric]));
  const preferredOverview = OVERVIEW_METRIC_IDS.flatMap((metricId) => {
    const metric = metricById.get(metricId);
    return metric ? [metric] : [];
  });
  const overview = preferredOverview.length ? preferredOverview : metrics.slice(0, 5);
  return `
    <section class="work-surface results-surface" aria-labelledby="run-metrics-title">
      <div class="surface-heading"><div><h2 id="run-metrics-title">Indicadores calculados por el motor</h2>
        <p>Valores del motor con sus unidades y poblaciones.</p></div></div>
      <div class="data-table-wrap"><table class="data-table metric-table">
        <caption class="visually-hidden">Resumen de indicadores del motor</caption>
        <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
        <tbody>${renderOverviewMetricRows(overview)}</tbody>
      </table></div>
      ${metrics.length ? `<details class="details-block metric-disclosure"><summary>Ver todos los indicadores</summary>
        <div class="data-table-wrap"><table class="data-table">
          <caption class="visually-hidden">Indicadores y estadísticas devueltos por el motor</caption>
          <thead><tr><th>Indicador · población</th><th>Valor</th><th>Media</th><th>Mediana</th><th>Percentil 95</th><th>Máximo</th></tr></thead>
          <tbody>${renderMetricRows(metrics)}</tbody>
        </table></div>
      </details>` : ""}
      <p class="provenance-line">Réplicas: 1 · semilla ${formatNumber(run.root_seed, 0)} · índice ${formatNumber(run.replication_index, 0)}. Esta ejecución sigue los supuestos del escenario indicado abajo.</p>
    </section>`;
}

function queueChart(run: RunResult): string {
  const series = [...run.metrics.queue_series];
  if (series.length === 0) return `<div class="chart-empty">El motor no devolvió intervalos de fila para esta ventana.</div>`;
  const width = 760;
  const height = 260;
  const left = 48;
  const right = 18;
  const top = 14;
  const bottom = 39;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const horizon = run.metrics.horizon_s;
  const maxCount = Math.max(1, ...series.map((item) => item.order_count));
  const y = (count: number): number => top + plotHeight - (count / maxCount) * plotHeight;
  const x = (seconds: number): number => left + (Math.min(horizon, Math.max(0, seconds)) / horizon) * plotWidth;
  const paths = (["payment", "preparation"] as const).map((queue) => {
    const points = series.filter((item) => item.queue === queue);
    if (!points.length) return "";
    const data = points.map((item, index) => `${index === 0 ? "M" : "L"}${x(item.start_s).toFixed(1)},${y(item.order_count).toFixed(1)} H${x(item.end_s).toFixed(1)}`).join(" ");
    const className = queue === "payment" ? "chart-line-payment" : "chart-line-preparation";
    return `<path class="${className}" d="${data}" />`;
  }).join("");
  const grid = Array.from({ length: Math.min(5, maxCount + 1) }, (_, index) => {
    const fraction = index / Math.min(4, maxCount || 1);
    const count = Math.round(maxCount * fraction);
    const lineY = y(count);
    return `<line class="chart-grid" x1="${left}" y1="${lineY}" x2="${width - right}" y2="${lineY}" />
      <text class="chart-label" x="${left - 9}" y="${lineY + 4}" text-anchor="end">${count}</text>`;
  }).join("");
  return `
    <div class="chart-frame">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Filas de pago y preparación expresadas en órdenes a lo largo de la ventana de admisión">
        ${grid}<line class="chart-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" />
        <line class="chart-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" />
        ${paths}<text class="chart-label" x="${left}" y="${height - 12}">0 s</text>
        <text class="chart-label" x="${width - right}" y="${height - 12}" text-anchor="end">${escapeHtml(formatSeconds(horizon))}</text>
        <text class="chart-label" x="12" y="${top + plotHeight / 2}" transform="rotate(-90 12 ${top + plotHeight / 2})">Órdenes esperando</text>
      </svg>
      <div class="chart-legend"><span><i class="legend-swatch" aria-hidden="true"></i>Pago</span><span><i class="legend-swatch secondary-series" aria-hidden="true"></i>Preparación</span></div>
    </div>`;
}

function renderQueueIntervals(run: RunResult): string {
  return `
    <section class="work-surface results-surface" aria-labelledby="queue-chart-title">
      <div class="surface-heading"><div><h2 id="queue-chart-title">Órdenes en fila</h2>
        <p>Escalones asentados por el motor durante los ${escapeHtml(formatSeconds(run.metrics.horizon_s))} de la ventana; el eje muestra órdenes, no personas.</p></div></div>
      ${queueChart(run)}
    </section>`;
}

function renderAssumptions(run: RunResult): string {
  const scenario = run.scenario;
  const demo = scenario.provenance === "synthetic_demo";
  const provenance = demo
    ? "Demostración sintética; no calibrada con datos de Boquitas."
    : "Supuestos configurados por el usuario; no equivalen a estimaciones observadas.";
  const assumptions = scenario.assumptions.map(systemAssumption);
  const config = scenario.engine_config;
  const modeCapacity = config.mode === "tuesday"
    ? `${formatNumber(config.cashiers, 0)} cajero(s) y ${formatNumber(config.preparers, 0)} preparador(es)`
    : `${formatNumber(config.integrated_workers, 0)} persona(s) en equipo integrado`;
  const close = formatClockFromOpening(config.opening_time, run.metrics.horizon_s);
  const describeDistribution = (distribution: RunResult["scenario"]["interarrival"]): string => {
    if (distribution.kind === "constant") return `Constante · ${formatNumber(distribution.value_s, 4)} s`;
    if (distribution.kind === "exponential") return `Exponencial · media ${formatNumber(distribution.mean_s, 4)} s`;
    return `Triangular · ${formatNumber(distribution.low_s, 4)} / ${formatNumber(distribution.mode_s, 4)} / ${formatNumber(distribution.high_s, 4)} s`;
  };
  const initialRows = scenario.initial_state.length
    ? `<ul>${scenario.initial_state.map((item) => `<li><code>${escapeHtml(item.order_id)}</code> · ${escapeHtml(translateEnum(item.stage))} · ${formatNumber(item.person_ids.length, 0)} personas${item.worker_id ? ` · persona ${escapeHtml(item.worker_id)}` : ""}${item.queue_rank == null ? "" : ` · posición ${formatNumber(item.queue_rank, 0)}`}</li>`).join("")}</ul>`
    : "Estado inicial vacío.";
  const groupWeights = scenario.group_sizes.map((item) => `${formatNumber(item.size, 0)} persona(s): ${formatNumber(item.probability * 100, 4)} %`).join(" · ");
  return `
    <section class="work-surface results-surface" aria-labelledby="assumptions-title">
      <div class="surface-heading"><div><h2 id="assumptions-title">${escapeHtml(scenario.display_name)}</h2>
        <p>${escapeHtml(provenance)}</p></div></div>
      <dl class="event-detail">
        <div><dt>Modo</dt><dd>${escapeHtml(translateEnum(config.mode))}</dd></div>
        <div><dt>Equipo configurado</dt><dd>${escapeHtml(modeCapacity)}</dd></div>
        <div><dt>Ventana</dt><dd>${escapeHtml(config.opening_time)}–${escapeHtml(close)}</dd></div>
      </dl>
      <details class="details-block">
        <summary>Ver parámetros exactos enviados al motor</summary>
        <div><dl class="event-detail">
          <div><dt>Tiempo entre llegadas</dt><dd>${escapeHtml(describeDistribution(scenario.interarrival))}</dd></div>
          <div><dt>Pago</dt><dd>${escapeHtml(describeDistribution(scenario.payment_active))}</dd></div>
          <div><dt>Preparación por orden</dt><dd>${escapeHtml(describeDistribution(scenario.preparation))}</dd></div>
          <div><dt>Probabilidad de transferencia</dt><dd>${formatNumber(scenario.transfer_probability * 100, 4)} %</dd></div>
          <div><dt>Paciencia</dt><dd>${scenario.patience ? escapeHtml(describeDistribution(scenario.patience)) : "Desactivada"}</dd></div>
          <div><dt>Semilla raíz</dt><dd>${formatNumber(run.root_seed, 0)}</dd></div>
          <div><dt>Pesos de tamaño de grupo</dt><dd>${escapeHtml(groupWeights || "No definidos")}</dd></div>
        </dl><div><strong>Órdenes que ya estaban presentes</strong>${initialRows}</div></div>
      </details>
      ${assumptions.length ? `<details class="details-block"><summary>Supuestos del escenario</summary><ul class="assumption-list">${assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}
      <p class="provenance-line">Los intervalos describen variación entre simulaciones, no incertidumbre en los parámetros reales.</p>
    </section>`;
}

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    order_initialized: "Orden presente al abrir",
    order_arrived: "Orden que llegó",
    payment_started: "Inicio del pago",
    payment_active_ended: "Fin del trabajo activo de pago",
    payment_completed: "Pago completado",
    preparation_started: "Inicio de preparación",
    preparation_paused: "Preparación pausada",
    preparation_resumed: "Reanudar preparación",
    order_delivered: "Orden entregada",
    order_abandoned: "Retiro de la fila",
    admissions_closed: "Cierre de admisiones",
    run_finished: "Fin de la ejecución",
  };
  return labels[type] ?? "Evento del registro";
}

function currentEvent(run: RunResult, offset: number): RunResult["trace"]["events"][number] | null {
  const events = run.trace.events.filter((event) => event.time_s <= offset);
  return events.at(-1) ?? null;
}

function eventDetailFor(event: RunResult["trace"]["events"][number] | null): string {
  if (!event) return `<p class="help-text">Todavía no hay un evento asentado en este punto del reloj.</p>`;
  const data = (event.data ?? {}) as Record<string, unknown>;
  const stage = typeof data.initial_stage === "string" ? data.initial_stage
    : typeof data.stage === "string" ? data.stage : null;
  const remainingLabel = event.type === "preparation_paused" || event.type === "preparation_resumed"
    ? "Trabajo restante al evento"
    : "Tiempo restante de la etapa al evento";
  const workerState = (value: unknown): string => value == null ? "No disponible" : value === true ? "Sí" : value === false ? "No" : "No disponible";
  const assignedOrder = typeof data.assigned_order_id === "string"
    ? data.assigned_order_id
    : data.assigned_order_id === null ? "Ninguna" : "No disponible";
  return `
    <dl class="event-detail">
      <div><dt>Evento más reciente</dt><dd>${escapeHtml(eventLabel(event.type))}</dd></div>
      <div><dt>Orden · secuencia</dt><dd>${escapeHtml(event.order_id ?? "No aplica")} · ${formatNumber(event.seq, 0)}</dd></div>
      <div><dt>Etapa asentada</dt><dd>${escapeHtml(stage ? translateEnum(stage) : "No especificada")}</dd></div>
      <div><dt>Personas vinculadas</dt><dd>${event.person_ids.length ? escapeHtml(event.person_ids.join(", ")) : "No registradas en este evento"}</dd></div>
      <div><dt>Persona asignada</dt><dd>${escapeHtml(event.worker_id ?? "No aplica")}</dd></div>
      <div><dt>${remainingLabel}</dt><dd>${typeof data.remaining_s === "number" && Number.isFinite(data.remaining_s) ? escapeHtml(`${formatNumber(data.remaining_s, 2)} s`) : "No disponible"}</dd></div>
      <div><dt>Orden asignada después del evento</dt><dd>${escapeHtml(assignedOrder)}</dd></div>
      <div><dt>Recurso reservado</dt><dd>${workerState(data.worker_reserved)}</dd></div>
      <div><dt>Trabajo activo</dt><dd>${workerState(data.worker_active)}</dd></div>
      ${typeof data.related_cashier_order_id === "string" ? `<div><dt>Orden de caja relacionada</dt><dd>${escapeHtml(data.related_cashier_order_id)}</dd></div>` : ""}
    </dl>`;
}

function eventDetailMarkup(run: RunResult, offset: number): string {
  const latest = currentEvent(run, offset);
  if (!latest) return eventDetailFor(null);
  const sameInstant = run.trace.events.filter((event) => event.time_s === latest.time_s && event.time_s <= offset);
  return eventGroupDetailMarkup(sameInstant, `a ${escapeHtml(formatClockFromOpening(run.trace.config.opening_time, latest.time_s))}`);
}

function eventGroupDetailMarkup(
  events: ReadonlyArray<RunResult["trace"]["events"][number]>,
  at: string | null = null,
): string {
  if (events.length === 0) return eventDetailFor(null);
  return `<p class="help-text">${formatNumber(events.length, 0)} eventos registrados${at ? ` ${at}` : " en este instante"}; se conserva su orden de secuencia.</p>${events.map(eventDetailFor).join("")}`;
}

export function updateReplayPlaybackReadout(run: RunResult, offset: number, settledEvents: number): void {
  const current = Math.min(Math.max(0, offset), run.trace.drain_end_s);
  const readout = document.querySelector<HTMLElement>("#replay-readout");
  if (readout) {
    readout.textContent = `${formatClockFromOpening(run.trace.config.opening_time, current)} · ${formatNumber(settledEvents, 0)} de ${formatNumber(run.trace.events.length, 0)} eventos asentados`;
  }
}

export function updateReplayLatestEvent(
  event: RunResult["trace"]["events"][number] | null,
  sameInstantEvents?: ReadonlyArray<RunResult["trace"]["events"][number]>,
): void {
  const detail = document.querySelector<HTMLElement>("#replay-event-detail");
  const events = sameInstantEvents ?? (event ? [event] : []);
  if (detail) detail.innerHTML = sameInstantEvents ? eventGroupDetailMarkup(events) : eventDetailFor(event);
}

export function updateReplayTimeline(run: RunResult, offset: number): void {
  const current = Math.min(Math.max(0, offset), run.trace.drain_end_s);
  const count = run.trace.events.filter((event) => event.time_s <= current).length;
  updateReplayPlaybackReadout(run, current, count);
  const detail = document.querySelector<HTMLElement>("#replay-event-detail");
  if (detail) detail.innerHTML = eventDetailMarkup(run, current);
}

function renderReplay(run: RunResult): string {
  const traceEnd = Math.max(0, run.trace.drain_end_s);
  const first = currentEvent(run, 0);
  const count = first ? run.trace.events.filter((event) => event.time_s <= 0).length : 0;
  const readout = `${formatClockFromOpening(run.trace.config.opening_time, 0)} · ${formatNumber(count, 0)} de ${formatNumber(run.trace.events.length, 0)} eventos asentados`;
  const personOptions = run.metrics.people.map((person) =>
    `<option value="person:${escapeHtml(person.person_id)}">${escapeHtml(person.person_id)} · orden ${escapeHtml(person.order_id)}</option>`,
  ).join("");
  const orderOptions = run.metrics.orders.map((order) =>
    `<option value="order:${escapeHtml(order.order_id)}">${escapeHtml(order.order_id)} · ${formatNumber(order.person_ids.length, 0)} ${order.person_ids.length === 1 ? "persona" : "personas"}</option>`,
  ).join("");
  return `
    <section class="work-surface results-surface replay-surface" aria-labelledby="replay-title">
      <div class="surface-heading"><div><h2 id="replay-title">Recorrido de la réplica</h2>
        <p>Esta escena ilustra los eventos guardados por el motor. El reloj llega hasta la última entrega, aunque ocurra después del cierre.</p></div></div>
      <div class="replay-controls" role="group" aria-label="Controles de reproducción">
        <div class="replay-transport">
          <button id="replay-play" class="primary-button" type="button" data-replay-play aria-pressed="false">Reproducir</button>
          <button id="replay-restart" class="secondary-button" type="button" data-replay-restart>Volver al inicio</button>
          <div class="replay-speed field"><label for="replay-speed">Velocidad</label><select id="replay-speed" data-replay-speed>
            <option value="1">1×</option><option value="5">5×</option><option value="20" selected>20×</option><option value="60">60×</option>
          </select></div>
        </div>
        <div class="replay-camera-controls" role="group" aria-label="Controles de cámara">
          <button class="secondary-button" type="button" data-replay-view-toggle>Ver fachada</button>
          <button class="quiet-button" type="button" data-replay-zoom="out" aria-label="Alejar cámara">−</button>
          <button class="quiet-button" type="button" data-replay-zoom="in" aria-label="Acercar cámara">+</button>
          <button class="secondary-button" type="button" data-replay-camera-reset>Restablecer cámara</button>
        </div>
      </div>
      <div id="replay-stage" class="replay-stage" data-state="loading">
        <canvas id="replay-canvas" tabindex="-1" aria-label="Vista ilustrativa de la tienda. Usa los controles de teclado para reproducción, selección y cámara."></canvas>
        <div id="replay-render-status" class="replay-render-status" role="status" aria-live="polite">Preparando la escena local…</div>
        <button class="secondary-button replay-retry" type="button" data-replay-retry hidden>Intentar abrir la vista 3D otra vez</button>
      </div>
      <div class="replay-scene-footer">
        <div class="replay-legend" role="group" aria-label="Zonas de la escena">
          <span><i class="legend-dot entry" aria-hidden="true"></i>Entrada</span>
          <span><i class="legend-dot cashier" aria-hidden="true"></i>Caja</span>
          <span><i class="legend-dot waiting" aria-hidden="true"></i>Espera pagada</span>
          <span><i class="legend-dot preparation" aria-hidden="true"></i>Preparación y entrega</span>
        </div>
        <span id="replay-scene-summary" class="status-chip">La escena representa el historial seleccionado.</span>
        <p class="replay-illustration-note">Distribución ilustrativa; no representa medidas ni capacidad física del local.</p>
      </div>
      <div class="replay-controls replay-timeline-controls">
        <div class="replay-timeline-action">
          <label class="visually-hidden" for="replay-slider">Reloj de simulación</label>
          <input id="replay-slider" type="range" min="0" max="${traceEnd}" step="any" value="0" aria-describedby="replay-readout">
          <div class="timeline-markers"><span>Inicio</span><span>Cierran admisiones · ${escapeHtml(formatClockFromOpening(run.trace.config.opening_time, run.trace.window_end_s))}</span><span>Fin</span></div>
        </div>
        <span class="status-chip replay-window-chip">Ventana ${escapeHtml(formatSeconds(run.trace.window_end_s))}</span>
      </div>
      <div id="replay-readout" class="timeline-readout" role="status" aria-live="polite">${escapeHtml(readout)}</div>
      <div id="replay-event-detail" class="replay-event-detail">${eventDetailMarkup(run, 0)}</div>
      <div class="replay-inspector" role="group" aria-labelledby="replay-inspector-title">
        <div class="replay-inspector-heading"><div><h3 id="replay-inspector-title">Personas y órdenes</h3>
          <p>Selecciona una entidad para ver su vínculo y los tiempos disponibles.</p></div>
          <div class="replay-entity-field field"><label for="replay-entity">Inspeccionar</label>
            <select id="replay-entity" data-replay-entity>
              <option value="">Elige una persona o una orden</option>
              ${personOptions ? `<optgroup label="Personas">${personOptions}</optgroup>` : ""}
              ${orderOptions ? `<optgroup label="Órdenes">${orderOptions}</optgroup>` : ""}
            </select>
          </div>
        </div>
        <div id="replay-inspector-detail" class="replay-inspector-detail" aria-live="polite">
          <p class="help-text">Las personas completadas o retiradas siguen disponibles aquí.</p>
        </div>
      </div>
      <p class="provenance-line">Cierre de admisiones: ${escapeHtml(formatClockFromOpening(run.trace.config.opening_time, run.trace.window_end_s))} · fin de la réplica: ${escapeHtml(formatClockFromOpening(run.trace.config.opening_time, run.trace.drain_end_s))}.</p>
    </section>`;
}

function renderRunOrders(run: RunResult): string {
  const preparationMeasure = (
    order: RunResult["metrics"]["orders"][number],
    field: "preparation_active_s" | "preparation_paused_s" | "preparation_elapsed_s" | "preparation_pause_count",
  ): string => {
    const value = (order as unknown as Record<string, unknown>)[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      if (field === "preparation_pause_count") {
        return `${formatNumber(value, 0)} ${value === 1 ? "pausa" : "pausas"}`;
      }
      return `${formatNumber(value, 2)} s`;
    }
    const reason = order.unavailable_fields.find((item) => item.field === field)?.reason;
    if (reason) return unavailableReason(reason);
    return run.contract_version === 1
      ? "No disponible en la versión 1"
      : "No disponible; el historial no contiene información suficiente";
  };
  const rows = run.metrics.orders.map((order) => `
    <tr><td><code>${escapeHtml(order.order_id)}</code></td>
      <td>${escapeHtml(translateEnum(order.cohort))}</td>
      <td>${escapeHtml(translateEnum(order.state))}</td>
      <td>${escapeHtml(paymentMethodLabel(run, order.order_id))}</td>
      <td>${formatNumber(order.person_ids.length, 0)}</td>
      <td>${order.arrival_s == null ? "Desconocida" : escapeHtml(formatClockFromOpening(run.trace.config.opening_time, order.arrival_s))}</td>
      <td>${order.delivery_s == null ? "No disponible" : escapeHtml(formatClockFromOpening(run.trace.config.opening_time, order.delivery_s))}</td>
      <td>${order.permanence_s == null ? unavailableReason(order.unavailable_fields.find((field) => field.field === "permanence_s")?.reason) : `${formatNumber(order.permanence_s, 1)} s`}</td>
      <td>${escapeHtml(preparationMeasure(order, "preparation_active_s"))}</td>
      <td>${escapeHtml(preparationMeasure(order, "preparation_paused_s"))}</td>
      <td>${escapeHtml(preparationMeasure(order, "preparation_pause_count"))}</td>
      <td>${escapeHtml(preparationMeasure(order, "preparation_elapsed_s"))}</td>
    </tr>`).join("");
  return `
    <section class="work-surface results-surface" aria-labelledby="orders-title">
      <div class="surface-heading"><div><h2 id="orders-title">Órdenes de esta réplica</h2>
        <p>Una fila es una orden compartida; la cantidad de personas aparece separada. La actividad, las pausas y el tiempo transcurrido usan las medidas guardadas por el motor; si el historial no las permite, se indica como no disponible.</p></div></div>
      <div class="data-table-wrap result-orders" role="group" aria-label="Tabla de órdenes" tabindex="0"><table class="data-table">
        <caption class="visually-hidden">Órdenes simuladas, su cohorte, tiempos de preparación y pausas</caption>
        <thead><tr><th>Orden</th><th>Cohorte</th><th>Estado</th><th>Medio de pago</th><th>Personas</th><th>Llegada simulada</th><th>Entrega</th><th>Permanencia</th><th>Trabajo activo</th><th>Tiempo en pausa</th><th>Recuento de pausas</th><th>Tiempo transcurrido</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="12">No se registraron órdenes en esta réplica.</td></tr>`}</tbody>
      </table></div>
    </section>`;
}

function estimateChart(experiment: ExperimentResult, selectedMetric: string): string {
  const estimates = experiment.comparisons.filter((item) => item.metric_id === selectedMetric);
  const valid = estimates.filter((item) => item.estimate.mean != null);
  if (valid.length === 0) return `<div class="chart-empty">No hay intervalos pareados válidos para este indicador.</div>`;
  const endpoints = valid.flatMap((item) => [item.estimate.lower, item.estimate.upper, item.estimate.mean].filter((value): value is number => value != null));
  const min = Math.min(0, ...endpoints);
  const max = Math.max(0, ...endpoints);
  const span = Math.max(Number.EPSILON, max - min);
  const width = 720;
  const left = 190;
  const right = 26;
  const chartTop = 28;
  const rowHeight = 43;
  const height = chartTop + valid.length * rowHeight + 35;
  const plotWidth = width - left - right;
  const x = (value: number): number => left + ((value - min) / span) * plotWidth;
  const zero = x(0);
  const rows = valid.map((item, index) => {
    const y = chartTop + index * rowHeight;
    const mean = item.estimate.mean as number;
    const lower = item.estimate.lower ?? mean;
    const upper = item.estimate.upper ?? mean;
    return `<text class="chart-label" x="${left - 9}" y="${y + 4}" text-anchor="end">${escapeHtml(item.candidate_scenario_id)}</text>
      <line class="chart-interval" x1="${x(lower)}" y1="${y}" x2="${x(upper)}" y2="${y}" />
      <line class="chart-interval-cap" x1="${x(lower)}" y1="${y - 5}" x2="${x(lower)}" y2="${y + 5}" />
      <line class="chart-interval-cap" x1="${x(upper)}" y1="${y - 5}" x2="${x(upper)}" y2="${y + 5}" />
      <circle class="chart-point" cx="${x(mean)}" cy="${y}" r="4.5" />`;
  }).join("");
  return `
    <div class="chart-frame"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Intervalos pareados candidato menos referencia para ${escapeHtml(metricLabel(selectedMetric))}">
      <line class="chart-grid" x1="${zero}" y1="${chartTop - 12}" x2="${zero}" y2="${height - 25}" />
      ${rows}<line class="chart-axis" x1="${left}" y1="${height - 24}" x2="${width - right}" y2="${height - 24}" />
      <text class="chart-label" x="${left}" y="${height - 7}">${formatNumber(min, 2)}</text>
      <text class="chart-label" x="${width - right}" y="${height - 7}" text-anchor="end">${formatNumber(max, 2)}</text>
      <text class="chart-label" x="${zero}" y="${chartTop - 17}" text-anchor="middle">0</text>
    </svg>
      <div class="chart-legend"><span><i class="legend-swatch secondary-series" aria-hidden="true"></i>Intervalo del ${formatNumber(experiment.confidence_level * 100, 0)} %</span><span><i class="legend-swatch" aria-hidden="true"></i>Promedio de la diferencia</span></div>
    </div>`;
}

function comparisonRows(experiment: ExperimentResult): string {
  return experiment.comparisons.map((item) => `
    <tr>
      <td>${escapeHtml(item.reference_scenario_id)}<br><span class="help-text">vs. ${escapeHtml(item.candidate_scenario_id)}</span></td>
      <td><strong>${escapeHtml(metricLabel(item.metric_id))}</strong><br><code>${escapeHtml(item.metric_id)}</code></td>
      <td>${item.estimate.mean == null ? unavailableReason(item.estimate.reason) : escapeHtml(displayValue(item.estimate.mean, item.unit))}</td>
      <td>${item.estimate.lower == null || item.estimate.upper == null ? "No disponible" : `${escapeHtml(displayValue(item.estimate.lower, item.unit))} a ${escapeHtml(displayValue(item.estimate.upper, item.unit))}`}</td>
      <td>${formatNumber(item.estimate.n_valid, 0)} / ${formatNumber(item.estimate.n_requested, 0)}</td>
      <td>${item.demand_tapes_identical === true ? "Misma cinta" : item.demand_tapes_identical === false ? "Cinta distinta" : "No se pudo determinar"}<br><span class="help-text">${item.generation_assumptions_differ ? "También cambian supuestos de demanda" : item.demand_matched ? "Demanda compartida" : "Revise los supuestos de generación"}</span></td>
    </tr>`).join("");
}

function renderExperiment(experiment: ExperimentResult, selection: ReplaySelection | null): string {
  const scenarioRows = experiment.scenarios.map((scenario) => {
    const metrics = experiment.aggregate_estimates.filter((estimate) => estimate.scenario_id === scenario.scenario_id);
    return `<details class="details-block">
      <summary>${escapeHtml(scenario.display_name)} · ${formatNumber(metrics.length, 0)} indicadores</summary>
      <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Indicador</th><th>Estimación</th><th>Intervalo del ${formatNumber(experiment.confidence_level * 100, 0)} %</th><th>Válidas / solicitadas</th><th>Unidad · cohorte</th></tr></thead><tbody>
        ${metrics.map((metric) => `<tr><td>${escapeHtml(metricLabel(metric.metric_id))}<br><code>${escapeHtml(metric.metric_id)}</code></td>
          <td>${metric.estimate.mean == null ? escapeHtml(unavailableReason(metric.estimate.reason)) : escapeHtml(displayValue(metric.estimate.mean, metric.unit))}</td>
          <td>${metric.estimate.lower == null || metric.estimate.upper == null ? "No disponible" : `${escapeHtml(displayValue(metric.estimate.lower, metric.unit))} a ${escapeHtml(displayValue(metric.estimate.upper, metric.unit))}`}</td>
          <td>${formatNumber(metric.estimate.n_valid, 0)} / ${formatNumber(metric.estimate.n_requested, 0)}</td>
          <td>${escapeHtml(unitLabel(metric.unit))} · ${escapeHtml(cohortLabel(metric.cohort))} · ${escapeHtml(populationLabel(metric.population))}</td></tr>`).join("")}
      </tbody></table></div>
    </details>`;
  }).join("");
  const candidateMetrics = [...new Set(experiment.comparisons.map((item) => item.metric_id))];
  const selectedMetric = candidateMetrics[0] ?? "";
  const options = candidateMetrics.map((metric) => `<option value="${escapeHtml(metric)}">${escapeHtml(metricLabel(metric))}</option>`).join("");
  const candidateIds = experiment.scenarios.map((scenario) => scenario.scenario_id);
  const selectedScenario = selection?.scenarioId && candidateIds.includes(selection.scenarioId)
    ? selection.scenarioId
    : candidateIds[1] ?? candidateIds[0] ?? "";
  const completedIndices = experiment.replication_results
    .filter((record) => record.scenario_id === selectedScenario && record.status === "complete")
    .map((record) => record.replication_index);
  const selectedIndex = selection?.scenarioId === selectedScenario && completedIndices.includes(selection.replicationIndex)
    ? selection.replicationIndex
    : completedIndices[0] ?? 0;
  const scenarioOptions = experiment.scenarios.map((scenario) => `<option value="${escapeHtml(scenario.scenario_id)}" ${scenario.scenario_id === selectedScenario ? "selected" : ""}>${escapeHtml(scenario.display_name)}</option>`).join("");
  const repOptions = completedIndices.map((index) => `<option value="${index}" ${index === selectedIndex ? "selected" : ""}>Réplica ${formatNumber(index, 0)}</option>`).join("");
  const failedRecords = experiment.replication_results.filter((record) => record.status === "failed").length;
  const partialState = experiment.status === "failed"
    ? `<div class="alert-box" role="alert"><h3>El experimento no terminó correctamente</h3><p>Se conservan los diagnósticos parciales; esta comparación no debe tratarse como un experimento completo.</p></div>`
    : "";
  return `
    ${partialState}
    <section class="work-surface results-surface" aria-labelledby="experiment-title">
      <div class="surface-heading"><div><h2 id="experiment-title">Resumen de escenarios</h2>
        <p>Semilla ${formatNumber(experiment.root_seed, 0)} · ${formatNumber(experiment.n_valid, 0)} ventanas con todas las réplicas válidas de ${formatNumber(experiment.n_requested, 0)} · confianza ${formatNumber(experiment.confidence_level * 100, 0)} % · estado ${escapeHtml(translateEnum(experiment.status))}.</p></div>
        <span class="status-chip ${failedRecords ? "warning" : ""}">${formatNumber(failedRecords, 0)} réplicas con error</span>
      </div>
      <p class="subtle-note">Los promedios e intervalos vienen del servidor y usan una observación por réplica. Un intervalo estrecho no valida los supuestos ni estima parámetros reales de Boquitas.</p>
      <div class="audit-list">${scenarioRows}</div>
    </section>
    <section class="work-surface results-surface" aria-labelledby="paired-title">
      <div class="surface-heading"><div><h2 id="paired-title">Diferencias por réplica</h2>
        <p>Las diferencias se emparejan por índice de réplica. Cada fila declara unidades, población, cohorte y estado de la demanda.</p></div></div>
      ${experiment.comparisons.length ? `
        <div class="field comparison-control"><label for="comparison-metric">Indicador de los intervalos pareados</label>
          <select id="comparison-metric" data-comparison-metric>${options}</select></div>
        <div id="comparison-chart">${estimateChart(experiment, selectedMetric)}</div>
        <div class="data-table-wrap comparison-table"><table class="data-table">
          <caption class="visually-hidden">Diferencias pareadas de cada indicador</caption>
          <thead><tr><th>Referencia · candidato</th><th>Indicador</th><th>Diferencia media</th><th>Intervalo del ${formatNumber(experiment.confidence_level * 100, 0)} %</th><th>Válidas / pedidas</th><th>Demanda</th></tr></thead>
          <tbody>${comparisonRows(experiment)}</tbody>
        </table></div>` : `<div class="chart-empty">Este experimento no contiene candidatos para comparar. Añade al menos dos escenarios.</div>`}
    </section>
    <section class="work-surface results-surface" aria-labelledby="select-rep-title">
      <div class="surface-heading"><div><h2 id="select-rep-title">Abrir una réplica concreta</h2>
        <p>La API recibe el escenario, la semilla raíz y el índice seleccionados. La corrida conserva exactamente esa identidad.</p></div></div>
      ${completedIndices.length ? `
        <div class="batch-selectors">
          <div class="field"><label for="selected-scenario">Escenario</label><select id="selected-scenario" data-selected-scenario>${scenarioOptions}</select></div>
          <div class="field"><label for="selected-replication">Réplica completada</label><select id="selected-replication" data-selected-replication>${repOptions}</select></div>
          <button class="primary-button" type="button" data-select-replication>Inspeccionar esta réplica</button>
        </div>`
        : `<p class="subtle-note warning-box">No hay réplicas completadas para seleccionar. Los diagnósticos del experimento siguen visibles.</p>`}
    </section>`;
}

export function renderResultsView(options: {
  completed: CompletedResult | null;
  selectedRun: RunResult | null;
  selection: ReplaySelection | null;
  observations: ImportReport | null;
  pending: string | null;
  pendingMessage: string | null;
  error: string | null;
  partialExperiment: ExperimentResult | null;
  editsNotRun: boolean;
  analysisObjective?: AnalysisObjective;
  csvFiles: Array<{ name: string; url: string }>;
  csvLabel: string | null;
}): string {
  const pending = options.pending
    ? `<div class="pending-state" role="status" aria-live="polite">${escapeHtml(options.pendingMessage ?? "La solicitud está en curso. No la envíes otra vez.")}</div>`
    : "";
  const error = options.error
    ? `<div class="alert-box" role="alert" tabindex="-1"><h2>La solicitud no terminó</h2><p>${escapeHtml(options.error)}</p></div>`
    : "";
  const partial = options.partialExperiment
    ? renderPartialExperiment(options.partialExperiment)
    : "";
  const staleNotice = options.editsNotRun
    ? `<div class="alert-box warning-box" role="status"><h2>La configuración visible tiene cambios sin ejecutar</h2><p>El resultado de esta vista conserva la configuración original que se envió al motor. Ejecuta otra réplica o comparación para sustituirlo.</p></div>`
    : "";
  if (!options.completed) {
    return `
      <div class="page-intro"><h1>Resultados</h1>
        <p>El resultado conserva los datos y la semilla enviados al motor.</p></div>
      <div class="results-column">${pending}${error}${partial}
        <section class="empty-state" aria-labelledby="empty-results-title"><div><h2 id="empty-results-title">Todavía no hay una simulación</h2>
          <p>Configura y ejecuta un escenario o compara alternativas.</p>
          <div class="inline-actions"><button type="button" class="secondary-button" data-go-view="scenario">Configurar escenario</button><button type="button" class="quiet-button" data-go-view="observations">Revisar observaciones</button></div>
        </div></section>
      </div>`;
  }

  const baseRun = options.completed.kind === "run" ? options.completed.value : options.selectedRun;
  const selectedRun = options.completed.kind === "run" ? options.completed.value : options.selectedRun;
  const jsonButton = options.completed.kind === "run"
    ? `<button class="secondary-button" type="button" data-download-result-json>Descargar resultado JSON</button>`
    : `<button class="secondary-button" type="button" data-download-result-json>Descargar experimento JSON</button>
       ${selectedRun ? `<button class="secondary-button" type="button" data-download-selected-json>Descargar réplica seleccionada JSON</button>` : ""}`;
  const csvPanel = options.csvFiles.length
    ? `<section class="work-surface results-surface" aria-label="Tablas CSV"><div class="surface-heading"><div><h2>${escapeHtml(options.csvLabel ?? "Tablas CSV listas")}</h2><p>El servicio de exportación conserva columnas, identificadores, unidades y advertencias del contrato.</p></div></div><div class="inline-actions">${options.csvFiles.map((file) => `<a class="secondary-button" href="${escapeHtml(file.url)}" download="${escapeHtml(file.name)}">Descargar ${escapeHtml(file.name)}</a>`).join("")}</div></section>`
    : "";
  const experiment = options.completed.kind === "experiment" ? options.completed.value : null;
  const analysisObjective = options.analysisObjective ?? "time";
  const selectionTitle = options.selection && experiment
    ? `Réplica ${formatNumber(options.selection.replicationIndex, 0)} · ${options.selection.scenarioId}`
    : "Réplica seleccionada";
  return `
    <div class="page-intro">
      <h1>Resultados</h1>
      <p>Resultado de la última solicitud. Para aplicar cambios, ejecuta otra vez.</p>
    </div>
    <div class="results-column">${pending}${error}${partial}${staleNotice}
      <section class="results-toolbar">
        <div class="toolbar-copy"><h2>${escapeHtml(options.completed.label)}</h2>
          <p>${options.completed.kind === "run" ? `Escenario ${escapeHtml(options.completed.value.scenario.scenario_id)} · semilla ${formatNumber(options.completed.value.root_seed, 0)} · réplica ${formatNumber(options.completed.value.replication_index, 0)}.` : `Comparación de ${formatNumber(options.completed.value.scenarios.length, 0)} escenarios · semilla ${formatNumber(options.completed.value.root_seed, 0)} · ${formatNumber(options.completed.value.n_valid, 0)} de ${formatNumber(options.completed.value.n_requested, 0)} réplicas válidas en todas las alternativas.`}</p>
        </div>
        <div class="inline-actions">${jsonButton}
          ${experiment && selectedRun ? `<button class="secondary-button" type="button" data-export-csv="selected-run">Preparar CSV de réplica seleccionada</button>` : ""}
          <button class="primary-button" type="button" data-export-csv="current">${options.completed.kind === "run" ? "Preparar CSV de esta réplica" : "Preparar CSV del experimento"}</button>
        </div>
      </section>
      ${csvPanel}
      ${experiment ? renderObjectiveAnalysisPanel(experiment, analysisObjective, options.editsNotRun) : ""}
      ${baseRun ? renderRunAnalysis(baseRun, {
        selectedExperimentRun: experiment !== null,
        editsNotRun: experiment === null && options.editsNotRun,
        showAssumptions: experiment === null,
      }) : ""}
      ${experiment ? `
        ${renderExperiment(experiment, options.selection)}
        ${selectedRun ? `<div class="results-meta"><div class="result-meta"><span class="status-chip">${escapeHtml(selectionTitle)}</span><span>Solicitud reproducible con la semilla e índice del experimento.</span></div></div>` : ""}
      ` : ""}
      ${baseRun ? `${renderReplay(baseRun)}<div class="results-grid ${experiment ? "has-selection" : ""}"><div class="results-column">
        ${renderAssumptions(baseRun)}
        ${renderRunMetrics(baseRun)}
        ${renderQueueModels(baseRun)}
        ${renderQueueIntervals(baseRun)}
        ${renderRunOrders(baseRun)}
      </div>${experiment ? `<div class="results-column"><section class="work-surface side-surface"><h2>Contexto de selección</h2><p>${escapeHtml(selectionTitle)} · semilla ${formatNumber(baseRun.root_seed, 0)} · índice ${formatNumber(baseRun.replication_index, 0)}. El índice se solicita sin modificar la cinta de demanda del lote.</p></section></div>` : ""}</div>` : `<div class="empty-state"><div><h2>Selecciona una réplica para inspeccionarla</h2><p>El resumen del experimento y sus intervalos están disponibles arriba. El motor trae el historial completo cuando eliges un índice específico.</p></div></div>`}
    </div>`;
}

function renderPartialExperiment(experiment: ExperimentResult): string {
  const failed = experiment.replication_results.filter((record) => record.status === "failed");
  const issues = experiment.issues.map((issue) => `
    <li><strong>${escapeHtml(issue.scenario_id)} · réplica ${formatNumber(issue.replication_index, 0)}:</strong>
      ${escapeHtml(issueMessage(issue.code, issue.scenario_id))}</li>`).join("");
  return `
    <section class="alert-box" role="alert">
      <h2>Diagnóstico parcial · experimento no completado</h2>
      <p>El motor devolvió estado ${escapeHtml(translateEnum(experiment.status))} con ${formatNumber(failed.length, 0)} réplicas fallidas. Este diagnóstico no se presenta como comparación terminada.</p>
      ${issues ? `<ul>${issues}</ul>` : `<p>El contrato no incluyó diagnósticos adicionales.</p>`}
    </section>`;
}

export function renderExperimentChartForSelection(experiment: ExperimentResult, metricId: string): string {
  return estimateChart(experiment, metricId);
}

export function runFilename(run: RunResult): string {
  return `${safeFileName(run.scenario.scenario_id)}-replica-${formatNumber(run.replication_index, 0)}.json`;
}

export function experimentFilename(experiment: ExperimentResult): string {
  return `${safeFileName(experiment.scenarios[0]?.scenario_id ?? "boquitas")}-experimento.json`;
}
