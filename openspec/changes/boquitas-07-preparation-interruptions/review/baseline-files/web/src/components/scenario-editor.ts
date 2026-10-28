import type { InitialOrder, Scenario, TimeDistribution } from "../api/types";
import { escapeHtml, formatNumber, formatSeconds } from "../domain/format";
import { translateEnum } from "../domain/errors";

export type DistributionKey = "interarrival" | "payment_active" | "preparation" | "transfer_confirmation" | "patience";

const DISTRIBUTIONS: Array<{ key: Exclude<DistributionKey, "patience">; title: string; note: string }> = [
  { key: "interarrival", title: "Tiempo entre llegadas", note: "Primera llegada después de la apertura" },
  { key: "payment_active", title: "Pago activo", note: "Trabajo activo por orden" },
  { key: "preparation", title: "Preparación", note: "Un tiempo completo por orden; no depende del tamaño del grupo" },
  { key: "transfer_confirmation", title: "Confirmación externa", note: "Solo se usa para una transferencia" },
];

const STAGES = ["waiting_payment", "payment_active", "payment_pending", "waiting_preparation", "preparing"];

function inputValue(value: unknown, digits = 3): string {
  if (value == null || !Number.isFinite(Number(value))) return "";
  void digits;
  return String(value);
}

function timeSeconds(value: string): number | null {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, hh, mm, ss] = match;
  const hours = Number(hh);
  const minutes = Number(mm);
  const seconds = Number(ss);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3_600 + minutes * 60 + seconds;
}

function timeText(seconds: number): string {
  const safe = Math.floor(seconds);
  return [Math.floor(safe / 3_600), Math.floor((safe % 3_600) / 60), safe % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function timeWindowEditable(scenario: Scenario): boolean {
  const opening = timeSeconds(scenario.engine_config.opening_time);
  return opening != null
    && Number.isInteger(scenario.engine_config.horizon_s)
    && scenario.engine_config.horizon_s > 0
    && opening + scenario.engine_config.horizon_s < 86_400;
}

function closingTime(scenario: Scenario): string {
  const opening = timeSeconds(scenario.engine_config.opening_time);
  if (opening == null || !timeWindowEditable(scenario)) return "";
  return timeText(opening + scenario.engine_config.horizon_s);
}

function distributionValue(scenario: Scenario, key: DistributionKey): TimeDistribution | null {
  return scenario[key] ?? null;
}

function distributionMarkup(key: DistributionKey, title: string, note: string, value: TimeDistribution): string {
  const record = value as unknown as Record<string, unknown>;
  const kind = String(record.kind ?? "triangular");
  const kindSelect = `
    <div class="compact-field">
      <label for="dist-${key}-kind">Forma</label>
      <select id="dist-${key}-kind" name="${key}_kind" data-distribution-kind="${key}">
        <option value="constant" ${kind === "constant" ? "selected" : ""}>Constante</option>
        <option value="triangular" ${kind === "triangular" ? "selected" : ""}>Triangular</option>
        <option value="exponential" ${kind === "exponential" ? "selected" : ""}>Exponencial</option>
      </select>
    </div>`;
  const fields = kind === "constant"
    ? `<div class="compact-field"><label for="dist-${key}-value">Duración (s)</label><input id="dist-${key}-value" name="${key}_value" data-distribution-field="${key}.value_s" type="number" min="0" step="any" required value="${inputValue(record.value_s)}"></div>`
    : kind === "exponential"
      ? `<div class="compact-field"><label for="dist-${key}-mean">Media (s)</label><input id="dist-${key}-mean" name="${key}_mean" data-distribution-field="${key}.mean_s" type="number" min="0" step="any" required value="${inputValue(record.mean_s)}"></div>`
      : `
        <div class="compact-field"><label for="dist-${key}-low">Mínimo (s)</label><input id="dist-${key}-low" name="${key}_low" data-distribution-field="${key}.low_s" type="number" min="0" step="any" required value="${inputValue(record.low_s)}"></div>
        <div class="compact-field"><label for="dist-${key}-mode">Más probable (s)</label><input id="dist-${key}-mode" name="${key}_mode" data-distribution-field="${key}.mode_s" type="number" min="0" step="any" required value="${inputValue(record.mode_s)}"></div>
        <div class="compact-field"><label for="dist-${key}-high">Máximo (s)</label><input id="dist-${key}-high" name="${key}_high" data-distribution-field="${key}.high_s" type="number" min="0" step="any" required value="${inputValue(record.high_s)}"></div>`;
  return `
    <div class="distribution-row" data-distribution-row="${key}">
      <div class="distribution-title">${escapeHtml(title)}<small>${escapeHtml(note)}</small></div>
      ${kindSelect}${fields}
    </div>`;
}

export function renderPatienceEditor(value: TimeDistribution | null): string {
  return value
    ? `<div data-patience-editor>${distributionMarkup("patience", "Tiempo máximo de espera", "Solo afecta a grupos que aún no iniciaron el pago", value)}</div>`
    : `<p class="help-text" data-patience-empty>La paciencia está desactivada; el grupo espera hasta que empiece el pago.</p>`;
}

function groupWeightMarkup(weights: Scenario["group_sizes"]): string {
  return weights.map((weight, index) => `
    <div class="weight-row" data-group-row="${index}">
      <div class="compact-field"><label for="group-size-${index}">Personas en el grupo</label>
        <input id="group-size-${index}" type="number" min="1" step="1" required name="group_size_${index}" data-group-field="size" data-integer-field value="${String(weight.size)}"></div>
      <div class="compact-field"><label for="group-prob-${index}">Probabilidad</label>
        <input id="group-prob-${index}" type="number" min="0" max="1" step="any" required name="group_probability_${index}" data-group-field="probability" value="${inputValue(weight.probability)}"></div>
      <button class="quiet-button remove-weight" type="button" data-remove-group="${index}" aria-label="Quitar tamaño de grupo ${formatNumber(weight.size, 0)}">Quitar</button>
    </div>`).join("");
}

function allowedStages(scenario: Scenario): string[] {
  return scenario.engine_config.mode === "regular"
    ? STAGES.filter((stage) => stage !== "waiting_preparation")
    : STAGES;
}

function workerIds(scenario: Scenario, stage: string): string[] {
  const config = scenario.engine_config;
  if (stage === "payment_active") {
    const count = config.mode === "regular" ? config.integrated_workers : config.cashiers;
    const pool = config.mode === "regular" ? "integrated" : "cashier";
    return Array.from({ length: Math.max(0, count ?? 0) }, (_, index) => `${pool}-${index + 1}`);
  }
  if (stage === "payment_pending" && config.mode === "regular") {
    return Array.from({ length: Math.max(0, config.integrated_workers ?? 0) }, (_, index) => `integrated-${index + 1}`);
  }
  if (stage === "preparing") {
    const count = config.mode === "regular" ? config.integrated_workers : config.preparers;
    const pool = config.mode === "regular" ? "integrated" : "preparer";
    return Array.from({ length: Math.max(0, count ?? 0) }, (_, index) => `${pool}-${index + 1}`);
  }
  return [];
}

export function refreshInitialWorkerOptions(form: HTMLFormElement, scenario: Scenario): void {
  for (const control of form.querySelectorAll<HTMLSelectElement>('select[data-initial-field$=".worker_id"]')) {
    const index = Number(control.dataset.initialField?.split(".")[0]);
    const initial = scenario.initial_state[index];
    if (!initial) continue;
    const workers = workerIds(scenario, String(initial.stage));
    if (initial.worker_id && !workers.includes(initial.worker_id)) workers.push(initial.worker_id);
    control.replaceChildren(
      new Option("Elige una persona", ""),
      ...workers.map((worker) => new Option(worker, worker)),
    );
    control.value = initial.worker_id ?? "";
  }
}

function initialOrderMarkup(initial: InitialOrder, index: number, scenario: Scenario): string {
  const stage = String(initial.stage);
  const stages = allowedStages(scenario);
  if (!stages.includes(stage)) stages.push(stage);
  const queued = stage === "waiting_payment" || stage === "waiting_preparation";
  const needsWorker = stage === "payment_active" || stage === "preparing"
    || (stage === "payment_pending" && scenario.engine_config.mode === "regular");
  const needsRemaining = stage === "payment_active" || stage === "payment_pending" || stage === "preparing";
  const needsPaymentParts = stage === "waiting_payment" || stage === "payment_active";
  const needsPreparation = stage === "waiting_payment" || stage === "payment_active"
    || stage === "payment_pending" || stage === "waiting_preparation";
  const ids = Array.isArray(initial.person_ids) ? initial.person_ids.join("\n") : "";
  const workerOptions = workerIds(scenario, stage);
  if (initial.worker_id && !workerOptions.includes(initial.worker_id)) workerOptions.push(initial.worker_id);
  const stageOptions = stages.map((candidate) => `
    <option value="${escapeHtml(candidate)}" ${candidate === stage ? "selected" : ""}>
      ${escapeHtml(translateEnum(candidate))}${allowedStages(scenario).includes(candidate) ? "" : " · incompatible con este modo"}
    </option>`).join("");
  const workerControl = needsWorker
    ? `<div class="compact-field"><label for="initial-${index}-worker">Persona que conserva la orden</label>
        <select id="initial-${index}-worker" required name="initial_worker_${index}" data-initial-field="${index}.worker_id">
          <option value="">Elige una persona</option>
          ${workerOptions.map((worker) => `<option value="${escapeHtml(worker)}" ${initial.worker_id === worker ? "selected" : ""}>${escapeHtml(worker)}</option>`).join("")}
        </select></div>`
    : "";
  const remainingControl = needsRemaining
    ? `<div class="compact-field"><label for="initial-${index}-remaining">Tiempo restante de esta etapa (s)</label>
        <input id="initial-${index}-remaining" type="number" min="0" step="any" required name="initial_remaining_${index}" data-initial-field="${index}.remaining_s" value="${inputValue(initial.remaining_s)}"></div>`
    : "";
  const paymentControls = needsPaymentParts ? `
    <div class="compact-field"><label for="initial-${index}-payment">Pago activo restante/total (s)</label>
      <input id="initial-${index}-payment" type="number" min="0" step="any" required name="initial_payment_${index}" data-initial-field="${index}.payment_active_s" value="${inputValue(initial.payment_active_s)}"></div>
    <div class="compact-field"><label for="initial-${index}-transfer">Confirmación externa (s)</label>
      <input id="initial-${index}-transfer" type="number" min="0" step="any" required name="initial_transfer_${index}" data-initial-field="${index}.transfer_wait_s" value="${inputValue(initial.transfer_wait_s)}"></div>` : "";
  const preparationControl = needsPreparation ? `
    <div class="compact-field"><label for="initial-${index}-preparation">Preparación prevista (s)</label>
      <input id="initial-${index}-preparation" type="number" min="0" step="any" required name="initial_preparation_${index}" data-initial-field="${index}.preparation_s" value="${inputValue(initial.preparation_s)}"></div>` : "";
  const patienceControl = stage === "waiting_payment" ? `
    <div class="compact-field"><label for="initial-${index}-patience">Paciencia restante (s, opcional)</label>
      <input id="initial-${index}-patience" type="number" min="0" step="any" name="initial_patience_${index}" data-initial-field="${index}.patience_remaining_s" value="${inputValue(initial.patience_remaining_s)}"></div>` : "";
  const rankControl = queued ? `
    <div class="compact-field"><label for="initial-${index}-rank">Posición de esta fila</label>
      <input id="initial-${index}-rank" type="number" min="0" step="1" required name="initial_rank_${index}" data-integer-field data-initial-field="${index}.queue_rank" value="${inputValue(initial.queue_rank, 0)}"></div>` : "";
  return `
    <article class="initial-order" data-initial-order="${index}">
      <div class="initial-order-head"><h3>Orden inicial ${index + 1}</h3>
        <button class="quiet-button" type="button" data-remove-initial="${index}">Quitar orden</button></div>
      <div class="initial-grid">
        <div class="compact-field span-two"><label for="initial-${index}-id">Identificador de la orden</label>
          <input id="initial-${index}-id" type="text" required name="initial_order_${index}" data-initial-field="${index}.order_id" value="${escapeHtml(initial.order_id)}"></div>
        <div class="compact-field"><label for="initial-${index}-stage">Etapa actual</label>
          <select id="initial-${index}-stage" required name="initial_stage_${index}" data-initial-stage="${index}">${stageOptions}</select></div>
        <div class="compact-field"><label for="initial-${index}-arrival">Llegada previa (s; en blanco = desconocida)</label>
          <input id="initial-${index}-arrival" type="number" max="0" step="any" name="initial_arrival_${index}" data-initial-field="${index}.arrival_s" value="${inputValue(initial.arrival_s)}"></div>
        <div class="compact-field span-two"><label for="initial-${index}-people">Personas vinculadas (un identificador por línea)</label>
          <textarea id="initial-${index}-people" required rows="2" name="initial_people_${index}" data-initial-field="${index}.person_ids">${escapeHtml(ids)}</textarea></div>
        ${rankControl}${workerControl}${remainingControl}${paymentControls}${preparationControl}${patienceControl}
      </div>
    </article>`;
}

function modeMarkup(scenario: Scenario): string {
  const tuesday = scenario.engine_config.mode === "tuesday";
  return `
    <div class="mode-options" role="group" aria-label="Modo de atención">
      <label class="mode-option" data-mode-option>
        <input type="radio" name="mode" value="tuesday" data-mode="tuesday" ${tuesday ? "checked" : ""}>
        <strong>Martes de promoción</strong><span>Cola de pago y preparación con equipos separados.</span>
      </label>
      <label class="mode-option" data-mode-option>
        <input type="radio" name="mode" value="regular" data-mode="regular" ${!tuesday ? "checked" : ""}>
        <strong>Día normal</strong><span>Una misma persona completa el pago y la preparación.</span>
      </label>
    </div>`;
}

function staffMarkup(scenario: Scenario): string {
  const config = scenario.engine_config;
  if (config.mode === "regular") {
    return `
      <div class="field-grid">
        <div class="field"><label for="integrated-workers">Personas en el equipo integrado</label>
          <input id="integrated-workers" type="number" min="1" step="1" required name="integrated_workers" data-integer-field data-scenario-field="engine_config.integrated_workers" value="${inputValue(config.integrated_workers, 0)}">
          <p class="help-text">Una persona reserva la orden durante la confirmación externa, sin trabajo activo en ese lapso.</p></div>
      </div>`;
  }
  return `
    <div class="field-grid">
      <div class="field"><label for="cashiers">Cajeros</label>
        <input id="cashiers" type="number" min="1" step="1" required name="cashiers" data-integer-field data-scenario-field="engine_config.cashiers" value="${inputValue(config.cashiers, 0)}"></div>
      <div class="field"><label for="preparers">Preparadores</label>
        <input id="preparers" type="number" min="1" step="1" required name="preparers" data-integer-field data-scenario-field="engine_config.preparers" value="${inputValue(config.preparers, 0)}"></div>
    </div>`;
}

function initialStateSideNote(scenario: Scenario): string {
  return scenario.initial_state.length === 0
    ? "El estado inicial está vacío; no se supone trabajo que no esté descrito."
    : `${formatNumber(scenario.initial_state.length, 0)} órdenes iniciales definidas. Llegadas previas en blanco siguen como desconocidas.`;
}

export function renderScenarioView(options: {
  scenario: Scenario;
  scenarios: Scenario[];
  activeScenarioIndex: number;
  replications: number;
  pending: boolean;
  error: string | null;
  failedFields: Array<{ path: string; message: string }>;
}): string {
  const { scenario } = options;
  const scenarioNavigator = `
    <section class="scenario-section scenario-roster" aria-labelledby="scenario-roster-title">
      <div class="surface-heading"><div><h2 id="scenario-roster-title">Escenarios para la siguiente ejecución</h2>
        <p>La primera configuración es la referencia. Añade copias explícitas y edita cada una antes de comparar.</p></div>
        <button class="secondary-button" type="button" data-add-candidate>Copiar referencia como candidato</button>
      </div>
      <div class="scenario-roster-list" role="tablist" aria-label="Escenarios disponibles">
        ${options.scenarios.map((item, index) => `
          <div class="scenario-roster-item ${index === options.activeScenarioIndex ? "active" : ""}">
            <button type="button" role="tab" aria-selected="${index === options.activeScenarioIndex}" aria-controls="scenario-form" data-scenario-select="${index}">
              <span>${index === 0 ? "Referencia" : `Candidato ${index}`}</span><strong>${escapeHtml(item.display_name)}</strong>
            </button>
            ${index > 0 && index === options.activeScenarioIndex ? `<button class="quiet-button" type="button" data-remove-candidate="${index}">Quitar candidato</button>` : ""}
          </div>`).join("")}
      </div>
      <div class="button-row"><span class="help-text">${options.scenarios.length < 2 ? "Añade al menos un candidato para habilitar la comparación." : `${formatNumber(options.scenarios.length, 0)} escenarios listos para revisar; las diferencias de demanda quedan visibles en los resultados.`}</span>
        <button class="primary-button" type="button" data-run-experiment ${options.pending || options.scenarios.length < 2 ? "disabled" : ""}>${options.pending ? "Calculando…" : "Comparar escenarios"}</button></div>
    </section>`;
  const editableWindow = timeWindowEditable(scenario);
  const defaultSeed = scenario.default_root_seed;
  const patience = distributionValue(scenario, "patience");
  const distributionRows = DISTRIBUTIONS.map(({ key, title, note }) =>
    distributionMarkup(key, title, note, scenario[key] as TimeDistribution),
  ).join("");
  const patienceMarkup = renderPatienceEditor(patience as TimeDistribution | null);
  const initialMarkup = scenario.initial_state.map((initial, index) => initialOrderMarkup(initial, index, scenario)).join("");
  const errorPanel = options.error ? `
    <div class="alert-box" role="alert" tabindex="-1" id="scenario-error">
      <h2>La configuración no se aceptó</h2>
      <p>${escapeHtml(options.error)}</p>
      ${options.failedFields.length ? `<ul class="error-field-list">${options.failedFields.map((item) => `<li><button type="button" data-focus-path="${escapeHtml(item.path)}">${escapeHtml(item.message)}</button></li>`).join("")}</ul>` : ""}
    </div>` : "";
  const timeInputs = editableWindow ? `
      <div class="field-grid">
        <div class="field"><label for="opening-time">Hora de apertura</label>
          <input id="opening-time" type="time" step="1" required name="opening_time" data-opening-time value="${escapeHtml(scenario.engine_config.opening_time)}">
          <p class="help-text">Reloj local de la simulación; no usa la hora del navegador.</p></div>
        <div class="field"><label for="closing-time">Cierre de admisiones</label>
          <input id="closing-time" type="time" step="1" required name="closing_time" data-closing-time value="${escapeHtml(closingTime(scenario))}">
          <p class="help-text">Debe ser posterior a la apertura y del mismo día. El trabajo admitido puede terminar después.</p></div>
      </div>` : `
      <div class="field-grid">
        <div class="field"><label for="opening-time-readonly">Apertura guardada</label><input id="opening-time-readonly" type="text" value="${escapeHtml(scenario.engine_config.opening_time)}" readonly></div>
        <div class="field"><label for="horizon-readonly">Ventana guardada</label><input id="horizon-readonly" type="text" value="${formatSeconds(scenario.engine_config.horizon_s)}" readonly></div>
      </div>
      <p class="subtle-note warning-box">Esta ventana guardada no se puede editar con los controles de apertura y cierre del mismo día. Su duración exacta se conserva; no se interpreta como otra hora de cierre.</p>`;

  return `
    <div class="page-intro">
      <h1>Escenarios</h1>
      <p>Configura una hipótesis completa. Las distribuciones sintéticas son valores de enseñanza; no son estimaciones de la tienda.</p>
    </div>
    ${errorPanel}
    <div class="scenario-layout">
      <form id="scenario-form" class="scenario-main" novalidate>
        ${scenarioNavigator}
        <fieldset class="scenario-section">
          <legend>Modo y capacidad</legend>
          ${modeMarkup(scenario)}
          ${staffMarkup(scenario)}
          <p class="subtle-note scenario-context-note">Cambiar el modo ajusta el equipo correspondiente, pero deja igual la demanda, los tiempos, las transferencias y la paciencia.</p>
          ${scenario.initial_state.some((item) => !allowedStages(scenario).includes(item.stage))
            ? `<p class="alert-box warning-box" role="status">Hay una etapa inicial que no existe en este modo. Se conserva para que puedas corregirla; no se quitará ni se cambiará automáticamente.</p>` : ""}
        </fieldset>

        <fieldset class="scenario-section">
          <legend>Ventana de simulación</legend>
          ${timeInputs}
          <p class="subtle-note simulation-window-note">Se admiten llegadas entre 0 y H; al cerrar admisiones, las órdenes iniciadas continúan hasta terminar. El reloj del recorrido puede avanzar a <code>+1 día</code>.</p>
        </fieldset>

        <fieldset class="scenario-section">
          <legend>Identificación del escenario</legend>
          <div class="field-grid">
            <div class="field"><label for="scenario-id">Identificador</label>
              <input id="scenario-id" type="text" required maxlength="100" name="scenario_id" data-scenario-field="scenario_id" value="${escapeHtml(scenario.scenario_id)}">
            </div>
            <div class="field"><label for="scenario-name">Nombre visible</label>
              <input id="scenario-name" type="text" required maxlength="120" name="display_name" data-scenario-field="display_name" value="${escapeHtml(scenario.display_name)}">
            </div>
          </div>
          <p class="help-text">Procedencia actual: <strong>${escapeHtml(translateEnum(scenario.provenance))}</strong>. Cualquier cambio queda marcado como supuesto del usuario.</p>
        </fieldset>

        <fieldset class="scenario-section">
          <legend>Tiempos del sistema</legend>
          <div class="distribution-list">${distributionRows}</div>
          <div class="field-grid transfer-settings">
            <div class="field"><label for="transfer-probability">Probabilidad de transferencia</label>
              <input id="transfer-probability" type="number" min="0" max="1" step="any" required name="transfer_probability" data-scenario-field="transfer_probability" value="${inputValue(scenario.transfer_probability)}">
              <p class="help-text">Valor entre 0 y 1. La confirmación externa solo se sortea si hay transferencia.</p></div>
          </div>
          <div class="field patience-field">
            <label class="checkbox-row" for="patience-enabled"><input id="patience-enabled" type="checkbox" name="patience_enabled" data-patience-enabled ${patience ? "checked" : ""}>
              <span>Aplicar paciencia mientras se espera el primer pago</span></label>
          </div>
          <div data-patience-slot>${patienceMarkup}</div>
        </fieldset>

        <fieldset class="scenario-section">
          <legend>Tamaño de los grupos</legend>
          <p class="help-text">Los miembros llegan, pagan y terminan juntos; la preparación es por orden.</p>
          <div class="weight-list" data-group-list>${groupWeightMarkup(scenario.group_sizes)}</div>
          <div class="button-row"><span class="help-text">Las probabilidades deben sumar 1.</span>
            <button class="secondary-button" type="button" data-add-group>Añadir tamaño</button></div>
        </fieldset>

        <fieldset class="scenario-section">
          <legend>Estado al abrir</legend>
          <p class="help-text">Cada orden representa trabajo que ya existe en el minuto cero. Completa integrantes, etapa, tiempos restantes y fila o persona reteniendo trabajo según corresponda.</p>
          <div class="initial-list" data-initial-list>${initialMarkup || `<p class="subtle-note">${escapeHtml(initialStateSideNote(scenario))}</p>`}</div>
          <div class="button-row"><span class="help-text">Una etapa incompatible se conserva hasta que la cambies.</span>
            <button class="secondary-button" type="button" data-add-initial>Añadir orden inicial</button></div>
        </fieldset>

        <fieldset class="scenario-section">
          <legend>Repetición</legend>
          <div class="field-grid three">
            <div class="field"><label for="root-seed">Semilla raíz</label>
              <input id="root-seed" type="number" min="0" step="1" required name="root_seed" data-integer-field data-scenario-field="default_root_seed" value="${String(defaultSeed)}">
              <p class="help-text">La misma semilla, escenario e índice reproducen la misma réplica.</p></div>
            <div class="field"><label for="replications">Réplicas para comparar</label>
              <input id="replications" type="number" min="1" max="200" step="1" required name="replications" data-integer-field data-experiment-field="replications" value="${String(options.replications)}">
              <p class="help-text">Máximo 200 por experimento.</p></div>
            <div class="field"><label for="confidence-level">Intervalo de confianza</label>
              <input id="confidence-level" type="text" value="95 %" readonly aria-describedby="confidence-help">
              <p id="confidence-help" class="help-text">El servidor calcula intervalos y diferencias pareadas por réplica.</p></div>
          </div>
        </fieldset>

        <div class="form-footer">
          <span id="scenario-request-status" class="help-text" role="status" aria-live="polite">${options.pending ? "La solicitud está en curso. No la envíes otra vez." : "Los cambios se guardan en memoria hasta que los descargues como JSON."}</span>
          <div class="inline-actions">
            <button class="secondary-button" type="button" data-save-scenario>Descargar escenario JSON</button>
            <button class="primary-button" type="button" data-run-scenario ${options.pending ? "disabled" : ""}>${options.pending ? "Calculando…" : "Ejecutar una réplica"}</button>
          </div>
        </div>
      </form>

      <aside class="scenario-side" aria-label="Notas del modelo y archivos">
        <section class="work-surface side-surface">
          <h2>Supuestos que acompañan al modelo</h2>
          <ul class="assumption-list">
            <li>Una orden compartida tiene un pago y una preparación.</li>
            <li>El tamaño del grupo no cambia el tiempo de preparación.</li>
            <li>La paciencia solo cuenta antes de empezar el pago.</li>
            <li>El estado vacío al abrir es una decisión explícita.</li>
            <li>Los tiempos de confianza describen variación entre simulaciones, no incertidumbre de los datos reales.</li>
          </ul>
        </section>
        <section class="work-surface side-surface">
          <h2>Reabrir un archivo</h2>
          <p>Valida un escenario, una réplica o un experimento guardado. Abrir un resultado no vuelve a ejecutar la simulación.</p>
          <div class="scenario-io">
            <label class="secondary-button" for="saved-json-file">Elegir JSON guardado</label>
            <input class="visually-hidden" id="saved-json-file" type="file" accept="application/json,.json" data-open-json>
          </div>
        </section>
      </aside>
    </div>`;
}

function readNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function updatePath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let parent: Record<string, unknown> = target;
  for (const part of parts.slice(0, -1)) {
    const next = parent[part];
    if (!next || typeof next !== "object") return;
    parent = next as Record<string, unknown>;
  }
  parent[parts.at(-1) ?? path] = value;
}

export function collectScenarioDraft(form: HTMLFormElement, base: Scenario): { scenario: Scenario; replications: number } {
  const data = new FormData(form);
  const next = structuredClone(base) as unknown as Record<string, unknown>;
  const engine = next.engine_config as Record<string, unknown>;
  const mode = String(data.get("mode") ?? engine.mode);
  engine.mode = mode;
  if (mode === "tuesday") {
    engine.cashiers = readNumber(String(data.get("cashiers") ?? ""));
    engine.preparers = readNumber(String(data.get("preparers") ?? ""));
    engine.integrated_workers = 0;
  } else {
    engine.cashiers = 0;
    engine.preparers = 0;
    engine.integrated_workers = readNumber(String(data.get("integrated_workers") ?? ""));
  }

  engine.opening_time = String(data.get("opening_time") ?? engine.opening_time);
  const opening = timeSeconds(String(engine.opening_time));
  const closing = timeSeconds(String(data.get("closing_time") ?? ""));
  if (opening != null && closing != null && closing > opening) {
    engine.horizon_s = closing - opening;
  }

  for (const input of form.querySelectorAll<HTMLInputElement>("[data-scenario-field]")) {
    const path = input.dataset.scenarioField;
    if (!path || path.startsWith("engine_config.")) continue;
    const value = input.type === "number" ? readNumber(input.value) : input.value;
    updatePath(next, path, value);
  }

  const groups = [...form.querySelectorAll<HTMLElement>("[data-group-row]")].map((row) => {
    const size = readNumber(row.querySelector<HTMLInputElement>('[data-group-field="size"]')?.value ?? "");
    const probability = readNumber(row.querySelector<HTMLInputElement>('[data-group-field="probability"]')?.value ?? "");
    return { size, probability };
  });
  next.group_sizes = groups;

  const distributions = new Map<string, Record<string, unknown>>();
  for (const row of form.querySelectorAll<HTMLElement>("[data-distribution-row]")) {
    const key = row.dataset.distributionRow;
    if (!key) continue;
    const kind = row.querySelector<HTMLSelectElement>("[data-distribution-kind]")?.value ?? "triangular";
    const value: Record<string, unknown> = { kind };
    for (const input of row.querySelectorAll<HTMLInputElement>("[data-distribution-field]")) {
      const path = input.dataset.distributionField?.split(".")[1];
      if (path) value[path] = readNumber(input.value);
    }
    distributions.set(key, value);
  }
  for (const [key, value] of distributions) next[key] = value;
  if (data.get("patience_enabled") === "on") {
    const patienceRow = form.querySelector<HTMLElement>('[data-distribution-row="patience"]');
    if (patienceRow) {
      const kind = patienceRow.querySelector<HTMLSelectElement>("[data-distribution-kind]")?.value ?? "triangular";
      const value: Record<string, unknown> = { kind };
      for (const input of patienceRow.querySelectorAll<HTMLInputElement>("[data-distribution-field]")) {
        const path = input.dataset.distributionField?.split(".")[1];
        if (path) value[path] = readNumber(input.value);
      }
      next.patience = value;
    } else {
      next.patience = base.patience ?? buildDistribution("constant");
    }
  } else {
    next.patience = null;
  }

  const initial: Array<Record<string, unknown>> = [];
  for (const row of form.querySelectorAll<HTMLElement>("[data-initial-order]")) {
    const index = Number(row.dataset.initialOrder);
    const stage = row.querySelector<HTMLSelectElement>(`[data-initial-stage="${index}"]`)?.value ?? "waiting_payment";
    const item: Record<string, unknown> = {
      order_id: row.querySelector<HTMLInputElement>(`[data-initial-field="${index}.order_id"]`)?.value ?? "",
      person_ids: (row.querySelector<HTMLTextAreaElement>(`[data-initial-field="${index}.person_ids"]`)?.value ?? "")
        .split(/\r?\n/).map((person) => person.trim()).filter(Boolean),
      stage,
    };
    const optionalNumberFields = ["arrival_s", "queue_rank", "remaining_s", "patience_remaining_s", "payment_active_s", "transfer_wait_s", "preparation_s"];
    for (const field of optionalNumberFields) {
      const input = row.querySelector<HTMLInputElement>(`[data-initial-field="${index}.${field}"]`);
      if (input) item[field] = readNumber(input.value);
    }
    const worker = row.querySelector<HTMLSelectElement>(`[data-initial-field="${index}.worker_id"]`);
    if (worker) item.worker_id = worker.value || null;
    initial.push(item);
  }
  next.initial_state = initial;

  if (base.provenance === "synthetic_demo" && JSON.stringify(next) !== JSON.stringify(base)) {
    next.provenance = "user_assumptions";
    const assumptions = Array.isArray(next.assumptions) ? next.assumptions as string[] : [];
    const userAssumption = "Los parámetros editados en la interfaz son supuestos del usuario y no provienen de una calibración de las observaciones.";
    next.assumptions = assumptions.includes(userAssumption) ? assumptions : [...assumptions, userAssumption];
  }

  const replications = readNumber(String(data.get("replications") ?? "")) ?? 1;
  return { scenario: next as unknown as Scenario, replications };
}

export function setScenarioTimeValidity(form: HTMLFormElement): boolean {
  const openingField = form.querySelector<HTMLInputElement>("[data-opening-time]");
  const closingField = form.querySelector<HTMLInputElement>("[data-closing-time]");
  if (!openingField || !closingField || openingField.disabled || closingField.disabled) return true;
  const opening = timeSeconds(openingField.value);
  const closing = timeSeconds(closingField.value);
  const message = opening == null || closing == null || closing <= opening
    ? "El cierre de admisiones debe ser posterior a la apertura y pertenecer al mismo día."
    : "";
  closingField.setCustomValidity(message);
  return message === "";
}

export function buildDistribution(kind: string): TimeDistribution {
  if (kind === "constant") return { kind, value_s: null } as unknown as TimeDistribution;
  if (kind === "exponential") return { kind, mean_s: null } as unknown as TimeDistribution;
  return { kind: "triangular", low_s: null, mode_s: null, high_s: null } as unknown as TimeDistribution;
}

export function newInitialOrder(): InitialOrder {
  return {
    order_id: "",
    person_ids: [],
    arrival_s: null,
    stage: "waiting_payment",
    queue_rank: null,
    worker_id: null,
    remaining_s: null,
    patience_remaining_s: null,
    payment_active_s: null,
    transfer_wait_s: null,
    preparation_s: null,
  } as InitialOrder;
}
