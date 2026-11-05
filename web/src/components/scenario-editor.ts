import type {
  ArrivalScheduleEntry,
  ArrivalScheduleEntryDraft,
  EngineConfigDraft,
  InitialOrderDraft,
  InterruptionScheduleEntryDraft,
  MenuConfiguration,
  MenuConfigurationDraft,
  MenuProduct,
  Scenario,
  ScenarioDraft,
  TimeDistributionDraft,
} from "../api/types";
import workLimits from "../../contracts/work-limits.json";
import { escapeHtml, formatNumber, formatSeconds } from "../domain/format";
import { translateEnum } from "../domain/errors";

const WORK_LIMITS = workLimits;

export type DistributionKey = "interarrival" | "payment_active" | "preparation" | "transfer_confirmation" | "patience";

const DISTRIBUTIONS: Array<{ key: Exclude<DistributionKey, "patience">; title: string; note: string }> = [
  { key: "interarrival", title: "Tiempo entre llegadas", note: "Segundos entre órdenes nuevas. Un intervalo menor trae más órdenes." },
  { key: "payment_active", title: "Pago", note: "Segundos que una persona del equipo dedica a cobrar una orden." },
  { key: "preparation", title: "Preparación", note: "Un tiempo completo por orden; no depende del tamaño del grupo" },
];

const STAGES = ["waiting_payment", "payment_active", "waiting_preparation", "preparing"];

function simplifyPayment(draft: ScenarioDraft): ScenarioDraft {
  draft.transfer_confirmation = { kind: "constant", value_s: 0 };
  for (const order of draft.initial_state) {
    if (!order.payment_method && ((order.transfer_wait_s ?? 0) > 0 || order.stage === "payment_pending")) {
      order.payment_method = "transfer";
    }
    if (order.stage === "waiting_payment" || order.stage === "payment_active") {
      order.transfer_wait_s = 0;
    } else if (order.stage === "payment_pending") {
      order.remaining_s = 0;
    }
  }
  return draft;
}

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function distributionIsComplete(value: TimeDistributionDraft | null | undefined): boolean {
  if (!value) return false;
  if (value.kind === "constant") return finite(value.value_s);
  if (value.kind === "exponential") return finite(value.mean_s);
  return finite(value.low_s) && finite(value.mode_s) && finite(value.high_s);
}

function defaultArrivalSchedule(scenario: ScenarioDraft): ArrivalScheduleEntryDraft[] {
  const horizon = scenario.engine_config.horizon_s;
  if (!finite(horizon) || horizon <= 0) return [];
  const middle = horizon / 2;
  const mean = scenario.interarrival.kind === "exponential" ? scenario.interarrival.mean_s : null;
  const rate = finite(mean) && mean > 0 ? 3_600 / mean : 20;
  return [
    { start_s: 0, end_s: middle, orders_per_hour: rate },
    { start_s: middle, end_s: horizon, orders_per_hour: rate },
  ];
}

function defaultMenu(): MenuConfigurationDraft {
  return {
    products: [
      { product_id: "ensalada-frutas", display_name: "Ensalada de frutas", visual_kind: "fruit_salad", preparation_s: 180 },
      { product_id: "helado", display_name: "Helado", visual_kind: "ice_cream", preparation_s: 60 },
      { product_id: "granizado", display_name: "Granizado", visual_kind: "slush", preparation_s: 90 },
    ],
    baskets: [
      { probability: 0.4, items: [{ product_id: "ensalada-frutas", quantity: 1 }] },
      { probability: 0.3, items: [{ product_id: "helado", quantity: 1 }] },
      { probability: 0.3, items: [{ product_id: "granizado", quantity: 1 }] },
    ],
  };
}

export function enableArrivalSchedule(scenario: ScenarioDraft): ScenarioDraft {
  const next = structuredClone(scenario);
  next.arrival_schedule_enabled = true;
  if (!next.arrival_schedule?.length) next.arrival_schedule = defaultArrivalSchedule(next);
  return next;
}

export function disableArrivalSchedule(scenario: ScenarioDraft): ScenarioDraft {
  return { ...structuredClone(scenario), arrival_schedule_enabled: false };
}

export function enableMenu(scenario: ScenarioDraft): ScenarioDraft {
  const next = structuredClone(scenario);
  next.menu_enabled = true;
  if (!next.menu) next.menu = defaultMenu();
  return next;
}

export function disableMenu(scenario: ScenarioDraft): ScenarioDraft {
  return { ...structuredClone(scenario), menu_enabled: false };
}

export function addArrivalScheduleWindow(scenario: ScenarioDraft): ScenarioDraft {
  const next = structuredClone(scenario);
  const schedule = next.arrival_schedule ?? [];
  const last = schedule.at(-1);
  if (!last || !finite(last.start_s) || !finite(last.end_s) || !finite(last.orders_per_hour)
    || last.end_s <= last.start_s) return next;
  const middle = last.start_s + (last.end_s - last.start_s) / 2;
  if (middle <= last.start_s || middle >= last.end_s) return next;
  schedule[schedule.length - 1] = { ...last, end_s: middle };
  schedule.push({ start_s: middle, end_s: last.end_s, orders_per_hour: last.orders_per_hour });
  next.arrival_schedule = schedule;
  return next;
}

export function removeArrivalScheduleWindow(scenario: ScenarioDraft, index: number): ScenarioDraft {
  const next = structuredClone(scenario);
  const schedule = next.arrival_schedule ?? [];
  if (!Number.isInteger(index) || index < 0 || index >= schedule.length || schedule.length <= 1) return next;
  if (index === 0) {
    const first = schedule[0];
    const second = schedule[1];
    if (first && second) schedule[1] = { ...second, start_s: first.start_s };
    schedule.shift();
  } else {
    const previous = schedule[index - 1];
    const removed = schedule[index];
    if (previous && removed) schedule[index - 1] = { ...previous, end_s: removed.end_s };
    schedule.splice(index, 1);
  }
  next.arrival_schedule = schedule;
  return next;
}

export function addMenuBasket(scenario: ScenarioDraft): ScenarioDraft {
  const next = structuredClone(scenario);
  if (!next.menu) next.menu = defaultMenu();
  next.menu.baskets.push({ probability: 0, items: [] });
  return next;
}

export function removeMenuBasket(scenario: ScenarioDraft, index: number): ScenarioDraft {
  const next = structuredClone(scenario);
  if (next.menu) next.menu.baskets = next.menu.baskets.filter((_basket, itemIndex) => itemIndex !== index);
  return next;
}

export function scenarioConfigurationIssues(scenario: ScenarioDraft): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  const scheduleEnabled = scenario.arrival_schedule_enabled ?? Boolean(scenario.arrival_schedule?.length);
  if (scheduleEnabled) {
    const schedule = scenario.arrival_schedule ?? [];
    const horizon = scenario.engine_config.horizon_s;
    if (scenario.interarrival.kind !== "exponential") {
      issues.push({
        path: "interarrival.kind",
        message: "Las llegadas por franja requieren interarribos exponenciales. Cambia la forma o desactiva el horario; el borrador se conservó.",
      });
    }
    if (schedule.length === 0) {
      issues.push({ path: "arrival_schedule_enabled", message: "Añade al menos una franja de llegadas." });
    }
    if (schedule.length > 48) {
      issues.push({ path: "arrival_schedule[47].end_s", message: "El horario admite como máximo 48 franjas." });
    }
    let previousEnd: number | null = 0;
    schedule.forEach((entry, index) => {
      if (!finite(entry.start_s) || !finite(entry.end_s) || !finite(entry.orders_per_hour)) {
        issues.push({ path: `arrival_schedule[${index}].end_s`, message: `Completa los límites y la tasa de la franja ${index + 1}.` });
        previousEnd = finite(entry.end_s) ? entry.end_s : null;
        return;
      }
      if (entry.orders_per_hour < 0) {
        issues.push({ path: `arrival_schedule[${index}].orders_per_hour`, message: "La tasa debe ser cero o mayor y se expresa en órdenes por hora." });
      }
      if (entry.end_s <= entry.start_s) {
        issues.push({ path: `arrival_schedule[${index}].end_s`, message: `La franja ${index + 1} debe durar más de cero segundos.` });
      }
      if (entry.start_s !== previousEnd) {
        issues.push({ path: `arrival_schedule[${index}].start_s`, message: `Las franjas deben ser contiguas y ordenadas; la franja ${index + 1} no continúa la anterior.` });
      }
      previousEnd = entry.end_s;
    });
    const last = schedule.at(-1);
    if (!finite(horizon) || !last || !finite(last.end_s) || last.end_s !== horizon) {
      issues.push({ path: `arrival_schedule[${Math.max(0, schedule.length - 1)}].end_s`, message: "El horario debe terminar exactamente al cierre actual. Ajusta el límite final; el valor guardado no se cambió al editar la ventana." });
    }
  }

  const menuEnabled = scenario.menu_enabled ?? scenario.menu != null;
  if (!menuEnabled) return issues;
  const menu = scenario.menu;
  if (!menu) {
    issues.push({ path: "menu.products", message: "Activa el menú para configurar sus productos y tipos de pedido." });
    return issues;
  }
  if (menu.products.length === 0) issues.push({ path: "menu.products", message: "El menú necesita al menos un producto." });
  if (menu.products.length > 24) issues.push({ path: "menu.products", message: "El menú admite como máximo 24 productos." });
  const productIds = new Set<string>();
  menu.products.forEach((product, index) => {
    if (!product.product_id.trim() || productIds.has(product.product_id)) {
      issues.push({ path: `menu.products[${index}].product_id`, message: "Cada producto necesita un identificador único y no vacío." });
    }
    productIds.add(product.product_id);
    if (!product.display_name.trim()) {
      issues.push({ path: `menu.products[${index}].display_name`, message: "Cada producto necesita un nombre visible." });
    }
    if (!finite(product.preparation_s) || product.preparation_s < 0) {
      issues.push({ path: `menu.products[${index}].preparation_s`, message: "Indica un tiempo por unidad de cero segundos o más." });
    }
  });
  if (menu.baskets.length === 0) issues.push({ path: "menu.baskets", message: "Añade al menos un tipo de pedido." });
  if (menu.baskets.length > 32) issues.push({ path: "menu.baskets[31].probability", message: "El menú admite como máximo 32 tipos de pedido." });
  let probabilityTotal = 0;
  menu.baskets.forEach((basket, index) => {
    if (!finite(basket.probability) || basket.probability < 0 || basket.probability > 1) {
      issues.push({ path: `menu.baskets[${index}].probability`, message: "La probabilidad de cada tipo de pedido debe estar entre 0 y 1." });
    } else {
      probabilityTotal += basket.probability;
    }
    if (basket.items.length === 0) {
      issues.push({ path: `menu.baskets[${index}].items`, message: `El tipo de pedido ${index + 1} está vacío. Elige al menos un producto.` });
    }
    let units = 0;
    for (const item of basket.items) {
      if (!productIds.has(item.product_id)) {
        issues.push({ path: `menu.baskets[${index}].items`, message: `El tipo de pedido ${index + 1} referencia un producto que no existe.` });
      }
      if (item.quantity == null || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50) {
        issues.push({ path: `menu.baskets[${index}].items`, message: "Cada cantidad debe ser un entero de 1 a 50; usa 0 para quitar un producto." });
      }
      units += item.quantity ?? 0;
    }
    if (units > 50) issues.push({ path: `menu.baskets[${index}].items`, message: `El tipo de pedido ${index + 1} supera 50 unidades.` });
  });
  if (menu.baskets.length > 0 && Math.abs(probabilityTotal - 1) > 1e-9) {
    issues.push({ path: "menu.baskets[0].probability", message: "Las probabilidades de los tipos de pedido deben sumar exactamente 1 (con tolerancia 1e-9)." });
  }
  return issues;
}

function draftIsComplete(draft: ScenarioDraft): boolean {
  const config = draft.engine_config;
  const initialPeople = draft.initial_state.reduce((total, order) => total + order.person_ids.length, 0);
  return draft.scenario_id.trim().length > 0
    && draft.display_name.trim().length > 0
    && finite(config.horizon_s) && config.horizon_s > 0
    && finite(config.cashiers) && Number.isInteger(config.cashiers)
    && config.cashiers <= WORK_LIMITS.max_workers_per_pool
    && finite(config.preparers) && Number.isInteger(config.preparers)
    && config.preparers <= WORK_LIMITS.max_workers_per_pool
    && finite(config.integrated_workers) && Number.isInteger(config.integrated_workers)
    && config.integrated_workers <= WORK_LIMITS.max_workers_per_pool
    && distributionIsComplete(draft.interarrival)
    && distributionIsComplete(draft.payment_active)
    && distributionIsComplete(draft.preparation)
    && distributionIsComplete(draft.transfer_confirmation)
    && (draft.patience == null || distributionIsComplete(draft.patience))
    && draft.group_sizes.length <= WORK_LIMITS.max_group_size
    && draft.group_sizes.every((group) => finite(group.size) && Number.isInteger(group.size)
      && group.size > 0 && group.size <= WORK_LIMITS.max_group_size
      && finite(group.probability))
    && finite(draft.transfer_probability)
    && finite(draft.default_root_seed) && Number.isSafeInteger(draft.default_root_seed)
    && draft.initial_state.length <= WORK_LIMITS.max_initial_orders
    && initialPeople <= WORK_LIMITS.max_people_per_run
    && draft.initial_state.every((order) => order.order_id.trim().length > 0
      && order.person_ids.length <= WORK_LIMITS.max_group_size
      && order.person_ids.every((personId) => personId.trim().length > 0)
      && order.arrival_s !== undefined
      && order.queue_rank !== undefined
      && order.worker_id !== undefined
      && order.remaining_s !== undefined
      && order.patience_remaining_s !== undefined
      && order.payment_active_s !== undefined
      && order.transfer_wait_s !== undefined
      && order.preparation_s !== undefined);
}

export function scenarioToDraft(scenario: Scenario): ScenarioDraft {
  const copy = structuredClone(scenario) as unknown as ScenarioDraft;
  copy.contract_version = String(scenario.contract_version) as ScenarioDraft["contract_version"];
  copy.arrival_schedule_enabled = Boolean(scenario.arrival_schedule?.length);
  copy.menu_enabled = scenario.menu != null;
  return simplifyPayment(copy);
}

export function scenarioDraftToWire(draft: ScenarioDraft): Scenario | null {
  draft = simplifyPayment(structuredClone(draft));
  const version = Number(draft.contract_version);
  if ((version !== 1 && version !== 2) || draft.engine_config.contract_version !== version || !draftIsComplete(draft)
    || scenarioConfigurationIssues(draft).length > 0) {
    return null;
  }
  if (version === 1) {
    if (draft.engine_config.preparation_interruption_policy !== undefined
      || draft.engine_config.cashier_interruptions !== undefined) return null;
  } else if (interruptionDraftIssues(draft).length > 0) {
    return null;
  }
  const wire = {
    ...structuredClone(draft),
    contract_version: version,
    engine_config: {
      ...structuredClone(draft.engine_config),
      contract_version: version,
    },
  } as unknown as Record<string, unknown>;
  const scheduleEnabled = draft.arrival_schedule_enabled ?? Boolean(draft.arrival_schedule?.length);
  if (scheduleEnabled) {
    wire.arrival_schedule = structuredClone(draft.arrival_schedule ?? []) as ArrivalScheduleEntry[];
  } else {
    delete wire.arrival_schedule;
  }
  const menuEnabled = draft.menu_enabled ?? draft.menu != null;
  if (menuEnabled) {
    wire.menu = structuredClone(draft.menu) as MenuConfiguration;
  } else if (Object.prototype.hasOwnProperty.call(draft, "menu")) {
    wire.menu = null;
  } else {
    delete wire.menu;
  }
  delete wire.arrival_schedule_enabled;
  delete wire.menu_enabled;
  return wire as unknown as Scenario;
}

export function enableInterruptionPolicy(scenario: ScenarioDraft): ScenarioDraft {
  const next = structuredClone(scenario);
  next.contract_version = "2";
  next.engine_config.contract_version = 2;
  next.engine_config.preparation_interruption_policy = "scripted_cashier";
  next.engine_config.cashier_interruptions = [];
  return next;
}

export function clearInterruptionSchedule(scenario: ScenarioDraft): ScenarioDraft {
  const next = structuredClone(scenario);
  if (next.contract_version === "2") next.engine_config.cashier_interruptions = [];
  return next;
}

export function disableInterruptionPolicy(scenario: ScenarioDraft): ScenarioDraft {
  const next = structuredClone(scenario);
  const { preparation_interruption_policy: _policy, cashier_interruptions: _schedule, ...config } = next.engine_config;
  next.contract_version = "1";
  next.engine_config = { ...config, contract_version: 1 };
  return next;
}

export function resolveInterruptionCompatibility(scenario: ScenarioDraft): ScenarioDraft {
  const next = structuredClone(scenario);
  if (next.contract_version !== "2") return next;
  next.engine_config.mode = "regular";
  next.engine_config.cashiers = 0;
  next.engine_config.preparers = 0;
  next.engine_config.integrated_workers = 1;
  return next;
}

export function addInterruptionScheduleEntry(scenario: ScenarioDraft): ScenarioDraft {
  const next = structuredClone(scenario);
  if (next.contract_version === "2") {
    next.engine_config.cashier_interruptions = [
      ...(next.engine_config.cashier_interruptions ?? []),
      { at_s: null, suspended_order_id: "", cashier_order_id: "" },
    ];
  }
  return next;
}

export function removeInterruptionScheduleEntry(scenario: ScenarioDraft, index: number): ScenarioDraft {
  const next = structuredClone(scenario);
  if (next.contract_version === "2") {
    next.engine_config.cashier_interruptions = (next.engine_config.cashier_interruptions ?? [])
      .filter((_entry, entryIndex) => entryIndex !== index);
  }
  return next;
}

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

export function timeWindowEditable(scenario: ScenarioDraft): boolean {
  const opening = timeSeconds(scenario.engine_config.opening_time);
  const horizon = scenario.engine_config.horizon_s;
  return opening != null
    && horizon != null
    && Number.isInteger(horizon)
    && horizon > 0
    && opening + horizon < 86_400;
}

function closingTime(scenario: ScenarioDraft): string {
  const opening = timeSeconds(scenario.engine_config.opening_time);
  const horizon = scenario.engine_config.horizon_s;
  if (opening == null || horizon == null || !timeWindowEditable(scenario)) return "";
  return timeText(opening + horizon);
}

function distributionValue(scenario: ScenarioDraft, key: DistributionKey): TimeDistributionDraft | null {
  return scenario[key] ?? null;
}

function distributionMarkup(key: DistributionKey, title: string, note: string, value: TimeDistributionDraft): string {
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

export function renderPatienceEditor(value: TimeDistributionDraft | null): string {
  return value
    ? `<div data-patience-editor>${distributionMarkup("patience", "Tiempo máximo de espera", "Solo afecta a grupos que aún no iniciaron el pago", value)}</div>`
    : `<p class="help-text" data-patience-empty>La paciencia está desactivada; el grupo espera hasta que empiece el pago.</p>`;
}

function groupWeightMarkup(weights: ScenarioDraft["group_sizes"]): string {
  return weights.map((weight, index) => `
    <div class="weight-row" data-group-row="${index}">
      <div class="compact-field"><label for="group-size-${index}">Personas en el grupo</label>
        <input id="group-size-${index}" type="number" min="1" max="${WORK_LIMITS.max_group_size}" step="1" required name="group_size_${index}" data-group-field="size" data-integer-field value="${String(weight.size)}"></div>
      <div class="compact-field"><label for="group-prob-${index}">Probabilidad</label>
        <input id="group-prob-${index}" type="number" min="0" max="1" step="any" required name="group_probability_${index}" data-group-field="probability" value="${inputValue(weight.probability)}"></div>
        <button class="quiet-button remove-weight" type="button" data-remove-group="${index}" aria-label="Quitar tamaño de grupo ${formatNumber(weight.size ?? 0, 0)}">Quitar</button>
    </div>`).join("");
}

function arrivalScheduleMarkup(scenario: ScenarioDraft): string {
  const enabled = scenario.arrival_schedule_enabled ?? Boolean(scenario.arrival_schedule?.length);
  const schedule = scenario.arrival_schedule?.length ? scenario.arrival_schedule : defaultArrivalSchedule(scenario);
  const horizon = scenario.engine_config.horizon_s;
  const rows = schedule.map((entry, index) => `
    <div class="arrival-window" data-arrival-window="${index}">
      <div class="arrival-window-heading"><strong>Franja ${formatNumber(index + 1, 0)}</strong>
        <button class="quiet-button" type="button" data-remove-arrival-window="${index}" aria-label="Quitar franja ${formatNumber(index + 1, 0)}" ${schedule.length <= 1 ? "disabled" : ""}>Quitar</button></div>
      <input type="hidden" data-arrival-window-start="${index}" value="${inputValue(entry.start_s)}">
      <div class="field-grid three">
        <div class="compact-field"><label for="arrival-start-${index}">Desde (minutos desde apertura)</label>
          <output id="arrival-start-${index}" data-arrival-start-label>${finite(entry.start_s) ? formatNumber(entry.start_s / 60) : "—"}</output></div>
        <div class="compact-field"><label for="arrival-end-${index}">Hasta (minutos desde apertura)</label>
          <input id="arrival-end-${index}" type="number" min="0" max="${finite(horizon) ? inputValue(horizon / 60) : ""}" step="any" required data-arrival-window-end="${index}" value="${finite(entry.end_s) ? inputValue(entry.end_s / 60) : ""}" aria-describedby="arrival-schedule-help"></div>
        <div class="compact-field"><label for="arrival-rate-${index}">Órdenes por hora</label>
          <input id="arrival-rate-${index}" type="number" min="0" step="any" required data-arrival-orders-per-hour="${index}" value="${inputValue(entry.orders_per_hour)}" aria-describedby="arrival-schedule-help"></div>
      </div>
    </div>`).join("");
  return `
    <div class="field arrival-schedule-control">
      <label class="checkbox-row" for="arrival-schedule-enabled"><input id="arrival-schedule-enabled" type="checkbox" name="arrival_schedule_enabled" data-arrival-schedule-enabled ${enabled ? "checked" : ""}>
        <span>Definir llegadas por franja</span></label>
      <p id="arrival-schedule-help" class="help-text">Las franjas usan minutos desde apertura y se encadenan en orden hasta el cierre. La tasa cuenta órdenes o grupos por hora, no personas. Cada franja usa llegadas exponenciales (Poisson por tramos), sin una media global. Al desactivar el horario vuelve a regir la distribución base guardada.</p>
    </div>
    ${enabled ? `<div class="arrival-schedule-editor" data-arrival-schedule>
      <div class="arrival-window-list">${rows}</div>
      <div class="button-row"><span class="help-text">El inicio de cada franja sigue el límite anterior. La última debe terminar exactamente al cierre.</span>
        <button class="secondary-button" type="button" data-add-arrival-window ${schedule.length >= 48 ? "disabled" : ""}>Añadir franja</button></div>
    </div>` : ""}`;
}

function productTypeLabel(kind: MenuProduct["visual_kind"]): string {
  if (kind === "fruit_salad") return "Ensalada de frutas";
  if (kind === "ice_cream") return "Helado";
  return "Granizado";
}

function menuMarkup(scenario: ScenarioDraft): string {
  const enabled = scenario.menu_enabled ?? scenario.menu != null;
  const menu = scenario.menu ?? (enabled ? defaultMenu() : null);
  const products = menu?.products ?? [];
  const baskets = menu?.baskets ?? [];
  const productRows = products.map((product, index) => `
    <div class="menu-product" data-menu-product="${index}" data-menu-product-id="${escapeHtml(product.product_id)}">
      <div class="menu-product-name"><strong>${escapeHtml(product.display_name)}</strong><small>${escapeHtml(productTypeLabel(product.visual_kind))}</small></div>
      <div class="compact-field"><label for="menu-product-time-${index}">Preparación por unidad (s)</label>
        <input id="menu-product-time-${index}" type="number" min="0" step="any" required data-menu-product-time="${index}" value="${inputValue(product.preparation_s)}" aria-label="Preparación por unidad de ${escapeHtml(product.display_name)} en segundos"></div>
    </div>`).join("");
  const basketRows = baskets.map((basket, index) => {
    const quantityByProduct = new Map<string, number | null>();
    for (const item of basket.items) {
      if (quantityByProduct.has(item.product_id)) {
        const previous = quantityByProduct.get(item.product_id);
        quantityByProduct.set(item.product_id, previous == null || item.quantity == null
          ? null
          : previous + item.quantity);
      } else {
        quantityByProduct.set(item.product_id, item.quantity);
      }
    }
    return `
      <section class="menu-basket" data-menu-basket="${index}" aria-labelledby="menu-basket-title-${index}">
        <div class="menu-basket-heading"><h3 id="menu-basket-title-${index}">Tipo de pedido ${formatNumber(index + 1, 0)}</h3>
          <button class="quiet-button" type="button" data-remove-menu-basket="${index}" aria-label="Quitar tipo de pedido ${formatNumber(index + 1, 0)}" ${baskets.length <= 1 ? "disabled" : ""}>Quitar</button></div>
        <div class="compact-field menu-probability"><label for="menu-basket-probability-${index}">Probabilidad</label>
          <input id="menu-basket-probability-${index}" type="number" min="0" max="1" step="any" required data-menu-basket-probability="${index}" value="${inputValue(basket.probability)}" aria-describedby="menu-basket-help"></div>
        <div class="menu-quantity-list" aria-label="Productos del tipo de pedido ${formatNumber(index + 1, 0)}">
          ${products.map((product, productIndex) => {
            const id = `menu-basket-${index}-quantity-${productIndex}`;
            const quantity = quantityByProduct.has(product.product_id)
              ? quantityByProduct.get(product.product_id)
              : 0;
            return `<div class="compact-field"><label for="${id}">${escapeHtml(product.display_name)}</label>
              <input id="${id}" type="number" min="0" max="50" step="1" required data-menu-basket-quantity="${index}" data-menu-quantity="${escapeHtml(product.product_id)}" value="${quantity == null ? "" : String(quantity)}" aria-label="Unidades de ${escapeHtml(product.display_name)} en el tipo de pedido ${formatNumber(index + 1, 0)}" aria-describedby="menu-basket-help"></div>`;
          }).join("")}
        </div>
      </section>`;
  }).join("");
  return `
    <fieldset class="scenario-section menu-section">
      <legend>Menú para nuevas órdenes</legend>
      <div class="field">
        <label class="checkbox-row" for="menu-enabled"><input id="menu-enabled" type="checkbox" name="menu_enabled" data-menu-enabled ${enabled ? "checked" : ""}>
        <span>Generar órdenes con productos del menú</span></label>
        <p class="help-text">Tiempos de ejemplo editables, no medidos; este menú no representa toda la oferta del negocio. Un grupo comparte una orden y un pago, y la preparación es una tarea completa según el modo. El tiempo de preparación de la orden es la suma de unidades por tiempo por unidad. Las órdenes que ya estaban al abrir conservan sus tiempos explícitos.</p>
      </div>
      ${enabled && menu ? `<div class="menu-editor" data-menu-editor>
        <div class="menu-products"><h3>Productos del ejemplo</h3><div class="menu-product-list">${productRows}</div></div>
        <div class="menu-baskets"><div class="surface-heading"><div><h3>Tipos de pedido</h3>
          <p id="menu-basket-help" class="help-text">Usa 0 para quitar un producto. Cada tipo de pedido necesita al menos una unidad; máximo 50 por orden. Las probabilidades deben sumar 1.</p></div></div>
          <div class="menu-basket-list">${basketRows}</div>
          <div class="button-row"><span class="help-text">Máximo 32 tipos de pedido.</span>
            <button class="secondary-button" type="button" data-add-menu-basket ${baskets.length >= 32 ? "disabled" : ""}>Añadir tipo de pedido</button></div>
        </div>
        <p class="subtle-note menu-preparation-note">Los pedidos nuevos usan estos productos y la preparación global queda inactiva mientras el menú está encendido. Al apagarlo, se conserva y vuelve a usarse.</p>
      </div>` : ""}
    </fieldset>`;
}

function allowedStages(scenario: ScenarioDraft): string[] {
  return scenario.engine_config.mode === "regular"
    ? STAGES.filter((stage) => stage !== "waiting_preparation")
    : STAGES;
}

function workerIds(scenario: ScenarioDraft, stage: string): string[] {
  const config = scenario.engine_config;
  const boundedCount = (count: number | null | undefined): number =>
    Number.isSafeInteger(count)
      && (count ?? 0) >= 0
      && (count ?? 0) <= WORK_LIMITS.max_workers_per_pool
      ? count ?? 0
      : 0;
  if (stage === "payment_active") {
    const count = config.mode === "regular" ? config.integrated_workers : config.cashiers;
    const pool = config.mode === "regular" ? "integrated" : "cashier";
    return Array.from({ length: boundedCount(count) }, (_, index) => `${pool}-${index + 1}`);
  }
  if (stage === "payment_pending" && config.mode === "regular") {
    return Array.from({ length: boundedCount(config.integrated_workers) }, (_, index) => `integrated-${index + 1}`);
  }
  if (stage === "preparing") {
    const count = config.mode === "regular" ? config.integrated_workers : config.preparers;
    const pool = config.mode === "regular" ? "integrated" : "preparer";
    return Array.from({ length: boundedCount(count) }, (_, index) => `${pool}-${index + 1}`);
  }
  return [];
}

function countNonemptyLines(value: string): number {
  let count = 0;
  let lineStart = 0;
  for (let index = 0; index <= value.length; index += 1) {
    if (index !== value.length && value[index] !== "\n") continue;
    if (value.slice(lineStart, index).trim().length > 0) count += 1;
    lineStart = index + 1;
  }
  return count;
}

export function validateInitialPersonLimits(form: HTMLFormElement): HTMLTextAreaElement | null {
  const controls = [...form.querySelectorAll<HTMLTextAreaElement>('textarea[data-initial-field$=".person_ids"]')];
  let totalPeople = 0;
  let firstInvalid: HTMLTextAreaElement | null = null;
  for (const control of controls) {
    const count = countNonemptyLines(control.value);
    totalPeople += count;
    const message = count > WORK_LIMITS.max_group_size
      ? `Cada orden inicial admite como máximo ${WORK_LIMITS.max_group_size} personas.`
      : totalPeople > WORK_LIMITS.max_people_per_run
        ? `El estado inicial supera el máximo computacional de ${formatNumber(WORK_LIMITS.max_people_per_run, 0)} personas. Reduce los identificadores antes de ejecutar.`
        : "";
    control.setCustomValidity(message);
    if (message && !firstInvalid) firstInvalid = control;
  }
  return firstInvalid;
}

export function refreshInitialWorkerOptions(form: HTMLFormElement, scenario: ScenarioDraft): void {
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

function initialOrderMarkup(initial: InitialOrderDraft, index: number, scenario: ScenarioDraft): string {
  const stage = String(initial.stage);
  const stages = allowedStages(scenario);
  if (!stages.includes(stage)) stages.push(stage);
  const queued = stage === "waiting_payment" || stage === "waiting_preparation";
  const needsWorker = stage === "payment_active" || stage === "preparing"
    || (stage === "payment_pending" && scenario.engine_config.mode === "regular");
  const needsRemaining = stage === "payment_active" || stage === "preparing";
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
    <div class="compact-field"><label for="initial-${index}-payment">Tiempo de pago (s)</label>
      <input id="initial-${index}-payment" type="number" min="0" step="any" required name="initial_payment_${index}" data-initial-field="${index}.payment_active_s" value="${inputValue(initial.payment_active_s)}"></div>
    ` : "";
  const paymentMethod = `
    <div class="compact-field"><label for="initial-${index}-method">Medio de pago</label>
      <select id="initial-${index}-method" name="initial_method_${index}" data-initial-field="${index}.payment_method">
        <option value="" ${!initial.payment_method ? "selected" : ""}>Sin especificar</option>
        <option value="cash" ${initial.payment_method === "cash" ? "selected" : ""}>Efectivo</option>
        <option value="transfer" ${initial.payment_method === "transfer" ? "selected" : ""}>Transferencia</option>
      </select></div>`;
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
          <textarea id="initial-${index}-people" required rows="2" name="initial_people_${index}" data-initial-field="${index}.person_ids" aria-describedby="initial-people-limit-${index}">${escapeHtml(ids)}</textarea>
          <p id="initial-people-limit-${index}" class="help-text">Máximo ${WORK_LIMITS.max_group_size} personas por orden.</p></div>
        ${rankControl}${workerControl}${remainingControl}${paymentControls}${paymentMethod}${preparationControl}${patienceControl}
      </div>
    </article>`;
}

function modeMarkup(scenario: ScenarioDraft): string {
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

function staffMarkup(scenario: ScenarioDraft): string {
  const config = scenario.engine_config;
  if (config.mode === "regular") {
    return `
      <div class="field-grid">
        <div class="field"><label for="integrated-workers">Personas en el equipo integrado</label>
          <input id="integrated-workers" type="number" min="1" max="${WORK_LIMITS.max_workers_per_pool}" step="1" required name="integrated_workers" data-integer-field data-scenario-field="engine_config.integrated_workers" value="${inputValue(config.integrated_workers, 0)}">
          <p class="help-text">La misma persona cobra y prepara la orden.</p></div>
      </div>`;
  }
  return `
    <div class="field-grid">
      <div class="field"><label for="cashiers">Cajeros</label>
        <input id="cashiers" type="number" min="1" max="${WORK_LIMITS.max_workers_per_pool}" step="1" required name="cashiers" data-integer-field data-scenario-field="engine_config.cashiers" value="${inputValue(config.cashiers, 0)}">
        <p class="help-text">Cuántas órdenes pueden cobrarse al mismo tiempo.</p></div>
      <div class="field"><label for="preparers">Preparadores</label>
        <input id="preparers" type="number" min="1" max="${WORK_LIMITS.max_workers_per_pool}" step="1" required name="preparers" data-integer-field data-scenario-field="engine_config.preparers" value="${inputValue(config.preparers, 0)}">
        <p class="help-text">Cuántas órdenes pueden prepararse al mismo tiempo.</p></div>
    </div>`;
}

function initialStateSideNote(scenario: ScenarioDraft): string {
  return scenario.initial_state.length === 0
    ? "El estado inicial está vacío; no se supone trabajo que no esté descrito."
    : `${formatNumber(scenario.initial_state.length, 0)} órdenes iniciales definidas. Llegadas previas en blanco siguen como desconocidas.`;
}

function interruptionEntries(scenario: ScenarioDraft): InterruptionScheduleEntryDraft[] {
  return scenario.contract_version === "2"
    ? scenario.engine_config.cashier_interruptions ?? []
    : [];
}

function interruptionCompatibilityIssues(
  scenario: ScenarioDraft,
): Array<{ path: string; message: string }> {
  if (scenario.contract_version !== "2") return [];
  const config = scenario.engine_config;
  const issues: Array<{ path: string; message: string }> = [];
  if (config.mode !== "regular") {
    issues.push({ path: "engine_config.mode", message: "Las pausas programadas solo están disponibles en el modo normal." });
  }
  if (config.integrated_workers !== 1) {
    issues.push({ path: "engine_config.integrated_workers", message: "Esta opción requiere exactamente una persona en el equipo integrado." });
  }
  if (config.cashiers !== 0) {
    issues.push({ path: "engine_config.cashiers", message: "Esta opción no admite un equipo de cajeros separado." });
  }
  if (config.preparers !== 0) {
    issues.push({ path: "engine_config.preparers", message: "Esta opción no admite un equipo de preparación separado." });
  }
  return issues;
}

export function interruptionDraftIssues(
  scenario: ScenarioDraft,
): Array<{ path: string; message: string }> {
  if (scenario.contract_version !== "2") return [];
  const issues = interruptionCompatibilityIssues(scenario);
  const entries = interruptionEntries(scenario);
  if (scenario.engine_config.preparation_interruption_policy !== "scripted_cashier") {
    issues.push({
      path: "engine_config.preparation_interruption_policy",
      message: "Elige la política de pausas programadas para validar este escenario V2.",
    });
  }

  let previousTime: number | null = null;
  entries.forEach((entry, index) => {
    const basePath = `engine_config.cashier_interruptions[${index}]`;
    if (entry.at_s == null || !Number.isFinite(entry.at_s) || entry.at_s < 0) {
      issues.push({
        path: `${basePath}.at_s`,
        message: "Indica un tiempo finito igual o mayor que cero, en segundos desde la apertura.",
      });
    } else if (previousTime != null && entry.at_s <= previousTime) {
      issues.push({
        path: `${basePath}.at_s`,
        message: "Los tiempos de la programación deben aumentar estrictamente.",
      });
    } else {
      previousTime = entry.at_s;
    }
    if (!entry.suspended_order_id.trim()) {
      issues.push({
        path: `${basePath}.suspended_order_id`,
        message: "Indica el identificador de la orden cuya preparación se pausará.",
      });
    }
    if (!entry.cashier_order_id.trim()) {
      issues.push({
        path: `${basePath}.cashier_order_id`,
        message: "Indica el identificador de la orden que pasará a cobrar.",
      });
    } else if (entry.cashier_order_id === entry.suspended_order_id) {
      issues.push({
        path: `${basePath}.cashier_order_id`,
        message: "La orden de caja debe ser distinta de la preparación pausada.",
      });
    }
  });
  return issues;
}

function interruptionRowsMarkup(entries: InterruptionScheduleEntryDraft[]): string {
  if (entries.length === 0) {
    return `<p class="subtle-note" data-interruption-empty>No hay pausas programadas; no se infiere ninguna interrupción.</p>`;
  }
  return entries.map((entry, index) => `
    <div class="initial-order interruption-row" data-interruption-row="${index}">
      <div class="initial-order-head"><h3>Pausa programada ${index + 1}</h3>
        <button class="quiet-button" type="button" data-remove-interruption="${index}" aria-label="Quitar pausa programada ${index + 1}">Quitar</button></div>
      <div class="initial-grid">
        <div class="compact-field"><label for="interruption-${index}-at">Tiempo programado (s desde la apertura)</label>
          <input id="interruption-${index}-at" type="number" min="0" step="any" required name="interruption_at_${index}" data-interruption-at="${index}" aria-describedby="interruption-schedule-help" value="${inputValue(entry.at_s)}"></div>
        <div class="compact-field"><label for="interruption-${index}-suspended">Orden cuya preparación se pausa</label>
          <input id="interruption-${index}-suspended" type="text" required maxlength="100" name="interruption_suspended_${index}" data-suspended-order-id="${index}" aria-describedby="interruption-schedule-help" autocorrect="off" autocapitalize="off" spellcheck="false" value="${escapeHtml(entry.suspended_order_id)}"></div>
        <div class="compact-field"><label for="interruption-${index}-cashier">Orden que pasa a cobrar</label>
          <input id="interruption-${index}-cashier" type="text" required maxlength="100" name="interruption_cashier_${index}" data-cashier-order-id="${index}" aria-describedby="interruption-schedule-help" autocorrect="off" autocapitalize="off" spellcheck="false" value="${escapeHtml(entry.cashier_order_id)}"></div>
      </div>
    </div>`).join("");
}

function interruptionPolicyMarkup(scenario: ScenarioDraft, pending: boolean): string {
  if (scenario.contract_version !== "2") {
    return `
      <fieldset class="scenario-section interruption-section">
        <legend>Pausas programadas para cobrar</legend>
        <p id="interruption-schedule-help" class="help-text">Solo para una persona integrada en modo normal. Define cada pausa.</p>
        <button class="secondary-button" type="button" data-enable-interruptions ${pending ? "disabled" : ""}>Activar pausas programadas</button>
      </fieldset>`;
  }
  const entries = interruptionEntries(scenario);
  const compatibilityIssues = interruptionCompatibilityIssues(scenario);
  const compatibility = compatibilityIssues.length
    ? `<p class="subtle-note warning-box" data-interruption-compatibility role="status" aria-live="polite">${escapeHtml(compatibilityIssues.map((issue) => issue.message).join(" "))} La programación se conserva y no se enviará hasta resolver esta incompatibilidad.</p>`
    : `<p class="subtle-note" data-interruption-compatibility hidden></p>`;
  return `
    <fieldset class="scenario-section interruption-section" data-interruption-schedule>
      <legend>Pausas programadas para cobrar</legend>
      <p id="interruption-schedule-help" class="help-text"><strong>Supuesto explícito del usuario.</strong> Tú defines las pausas; no se infieren de datos reales. Solo se admite una persona integrada en modo normal.</p>
      <p class="help-text">Indica segundo desde apertura, orden pausada y orden cobrada. La primera se reanuda tras el pago.</p>
      <p class="help-text">Los identificadores deben existir en cada réplica; no se sustituyen ni ajustan automáticamente.</p>
      <p class="help-text"><strong>Política activa:</strong> pausas programadas para cobrar.</p>
      ${compatibility}${interruptionRowsMarkup(entries)}
      <div class="button-row">
        ${compatibilityIssues.length ? `<button class="secondary-button" type="button" data-resolve-interruption-compatibility ${pending ? "disabled" : ""}>Resolver incompatibilidad: usar modo normal con una persona integrada</button>` : ""}
        <button class="secondary-button" type="button" data-add-interruption ${pending ? "disabled" : ""}>Añadir pausa programada</button>
        ${entries.length ? `<button class="quiet-button" type="button" data-clear-interruptions ${pending ? "disabled" : ""}>Limpiar programación</button>` : ""}
        <button class="quiet-button" type="button" data-disable-interruptions ${pending ? "disabled" : ""}>Desactivar y borrar programación</button>
      </div>
    </fieldset>`;
}

export function updateInterruptionCompatibilityStatus(
  form: HTMLFormElement,
  scenario: ScenarioDraft,
): void {
  const target = form.querySelector<HTMLElement>("[data-interruption-compatibility]");
  if (!target) return;
  const messages = interruptionCompatibilityIssues(scenario).map((issue) => issue.message);
  target.textContent = messages.length
    ? `${messages.join(" ")} La programación se conserva y no se enviará hasta resolver esta incompatibilidad.`
    : "";
  target.hidden = messages.length === 0;
}

export function renderScenarioView(options: {
  scenario: ScenarioDraft;
  scenarios: ScenarioDraft[];
  activeScenarioIndex: number;
  replications: number;
  advancedOpen: boolean;
  comparisonOpen: boolean;
  helpOpen: boolean;
  pending: boolean;
  error: string | null;
  failedFields: Array<{ path: string; message: string }>;
}): string {
  const { scenario } = options;
  const scenarioNavigator = `
    <details class="scenario-section scenario-roster comparison-options" data-comparison-options ${options.comparisonOpen ? "open" : ""}>
      <summary class="scenario-disclosure-summary"><span><strong>Comparar alternativas</strong><small>Copia un escenario para revisar resultados lado a lado.</small></span></summary>
      <div class="comparison-content">
        <div class="surface-heading"><div><h2 id="scenario-roster-title">Escenarios disponibles</h2>
          <p>La primera configuración es la referencia. Edita cada copia antes de comparar.</p></div>
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
        <div class="button-row"><span class="help-text">${options.scenarios.length < 2 ? "Añade un candidato para habilitar la comparación." : `${formatNumber(options.scenarios.length, 0)} escenarios listos para revisar; las diferencias quedan visibles en los resultados.`}</span>
          <button class="primary-button" type="button" data-run-experiment ${options.pending || options.scenarios.length < 2 ? "disabled" : ""}>${options.pending ? "Calculando…" : "Comparar escenarios"}</button></div>
        <p class="help-text">El servicio verifica la carga real de la comparación: máximo ${formatNumber(WORK_LIMITS.max_experiment_orders, 0)} órdenes, ${formatNumber(WORK_LIMITS.max_experiment_people, 0)} personas y ${formatNumber(WORK_LIMITS.max_experiment_work_units, 0)} unidades de trabajo.</p>
      </div>
    </details>`;
  const editableWindow = timeWindowEditable(scenario);
  const defaultSeed = scenario.default_root_seed;
  const patience = distributionValue(scenario, "patience");
  const distributionRows = DISTRIBUTIONS.map(({ key, title, note }) =>
    distributionMarkup(key, title, note, scenario[key]),
  ).join("");
  const patienceMarkup = renderPatienceEditor(patience);
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
  const advancedOptions = `
      <details class="scenario-section scenario-options" data-advanced-options ${options.advancedOpen ? "open" : ""}>
        <summary class="scenario-disclosure-summary"><span><strong>Opciones avanzadas</strong><small>Identificación, órdenes iniciales, pausas y repetición.</small></span></summary>
        <div class="advanced-content">
          <fieldset class="scenario-section">
            <legend>Identificación del escenario</legend>
            <div class="field-grid">
              <div class="field"><label for="scenario-id">Identificador</label>
                <input id="scenario-id" type="text" required maxlength="100" name="scenario_id" data-scenario-field="scenario_id" value="${escapeHtml(scenario.scenario_id)}">
                <p class="help-text">Código para distinguir este escenario en archivos y comparaciones.</p>
              </div>
              <div class="field"><label for="scenario-name">Nombre visible</label>
                <input id="scenario-name" type="text" required maxlength="120" name="display_name" data-scenario-field="display_name" value="${escapeHtml(scenario.display_name)}">
                <p class="help-text">Nombre que aparece en pantalla y en los resultados.</p>
              </div>
            </div>
            <p class="help-text">Procedencia: <strong>${escapeHtml(translateEnum(scenario.provenance))}</strong>. Los cambios son supuestos.</p>
          </fieldset>

          <fieldset class="scenario-section">
            <legend>Tamaño de los grupos</legend>
            <p class="help-text">El grupo llega y termina junto; hay una preparación por orden.</p>
            <div class="weight-list" data-group-list>${groupWeightMarkup(scenario.group_sizes)}</div>
            <div class="button-row"><span class="help-text">Las probabilidades deben sumar 1. Máximo ${WORK_LIMITS.max_group_size} tamaños de grupo.</span>
              <button class="secondary-button" type="button" data-add-group ${scenario.group_sizes.length >= WORK_LIMITS.max_group_size ? "disabled" : ""}>Añadir tamaño</button></div>
          </fieldset>

          <fieldset class="scenario-section">
            <legend>Estado al abrir</legend>
            <p class="help-text">Registra aquí las órdenes presentes al abrir y los datos requeridos para su etapa.</p>
            <div class="initial-list" data-initial-list>${initialMarkup || `<p class="subtle-note">${escapeHtml(initialStateSideNote(scenario))}</p>`}</div>
            <div class="button-row"><span class="help-text">Las etapas incompatibles se conservan hasta que las corrijas.</span>
              <button class="secondary-button" type="button" data-add-initial ${scenario.initial_state.length >= WORK_LIMITS.max_initial_orders ? "disabled" : ""}>Añadir orden inicial</button></div>
          </fieldset>

          ${interruptionPolicyMarkup(scenario, options.pending)}

          <fieldset class="scenario-section">
            <legend>Repetición</legend>
            <div class="field-grid three">
              <div class="field"><label for="root-seed">Semilla raíz</label>
                <input id="root-seed" type="number" min="0" step="1" required name="root_seed" data-integer-field data-scenario-field="default_root_seed" value="${String(defaultSeed)}">
                <p class="help-text">La misma semilla, escenario e índice repiten la réplica.</p></div>
              <div class="field"><label for="replications">Réplicas para comparar</label>
                <input id="replications" type="number" min="1" max="200" step="1" required name="replications" data-integer-field data-experiment-field="replications" value="${String(options.replications)}">
                <p class="help-text">Solo se usan al comparar escenarios. Máximo 200.</p></div>
              <div class="field"><label for="confidence-level">Intervalo de confianza</label>
                <input id="confidence-level" type="text" value="95 %" readonly aria-describedby="confidence-help">
                <p id="confidence-help" class="help-text">El servicio calcula intervalos pareados por réplica.</p></div>
            </div>
          </fieldset>
        </div>
      </details>`;

  return `
    <div class="page-intro">
      <h1>Escenarios</h1>
      <p>Una réplica ejecuta esta configuración una vez. Revisa su procedencia y sus supuestos; los escenarios no están calibrados con la tienda.</p>
      <p class="help-text">Límites de cómputo: ${WORK_LIMITS.max_workers_per_pool} personas por equipo, ${WORK_LIMITS.max_group_size} por grupo, ${WORK_LIMITS.max_initial_orders} órdenes iniciales y ${WORK_LIMITS.max_new_orders} órdenes nuevas por réplica. La carga real también se limita a ${WORK_LIMITS.max_people_per_run} personas por ejecución. No representan la capacidad de la tienda.</p>
    </div>
    ${errorPanel}
    <div class="scenario-layout">
      <form id="scenario-form" class="scenario-main" novalidate>
        <div class="form-footer">
          <div class="form-footer-copy">
            <p class="active-scenario-label">Configurando: <strong data-active-scenario-name>${escapeHtml(scenario.display_name)}</strong></p>
            <span id="scenario-request-status" class="help-text" role="status" aria-live="polite">${options.pending ? "La ejecución está en curso." : "Descarga JSON para conservar el escenario."}</span>
          </div>
          <div class="inline-actions">
            <button class="secondary-button" type="button" data-save-scenario>Descargar escenario JSON</button>
            <button class="primary-button" type="button" data-run-scenario ${options.pending ? "disabled" : ""}>${options.pending ? "Calculando…" : "Ejecutar una réplica"}</button>
          </div>
        </div>

        <section class="scenario-section live-simulation" aria-labelledby="live-simulation-title">
          <h2 id="live-simulation-title">Simulación en vivo</h2>
          <label class="checkbox-row" for="live-simulation-enabled">
            <input id="live-simulation-enabled" type="checkbox" data-live-toggle aria-describedby="live-simulation-help">
            <span>Actualizar simulación en vivo</span>
          </label>
          <p id="live-simulation-help" class="help-text">Cada cambio válido vuelve a ejecutar la réplica con la semilla del escenario. Puedes seguir editando mientras se calcula.</p>
          <div data-live-load></div>
          <p class="help-text" data-live-status role="status"></p>
          <div data-live-metrics></div>
          <button class="secondary-button" type="button" data-open-live-result disabled>Ver resultado y reproducción</button>
        </section>

        <fieldset class="scenario-section">
          <legend>Modo y capacidad</legend>
          ${modeMarkup(scenario)}
          ${staffMarkup(scenario)}
          <p class="subtle-note scenario-context-note">El modo cambia el equipo; conserva los demás valores.</p>
          ${scenario.initial_state.some((item) => !allowedStages(scenario).includes(item.stage))
            ? `<p class="alert-box warning-box" role="status">Hay una etapa inicial que no existe en este modo. Se conserva para que puedas corregirla; no se quitará ni se cambiará automáticamente.</p>` : ""}
        </fieldset>

        <fieldset class="scenario-section">
          <legend>Ventana de simulación</legend>
          ${timeInputs}
          <p class="subtle-note simulation-window-note">Al cerrar admisiones, no entran más órdenes; las pendientes siguen hasta terminar.</p>
        </fieldset>

        <fieldset class="scenario-section">
          <legend>Tiempos del sistema</legend>
          <p class="help-text">Constante usa siempre la misma duración. Exponencial usa una media y admite duraciones largas. Triangular usa un mínimo, un valor más probable y un máximo.</p>
          <div class="distribution-list">${distributionRows}</div>
          ${arrivalScheduleMarkup(scenario)}
          <div class="field-grid transfer-settings">
            <div class="field"><label for="transfer-probability">Probabilidad de transferencia</label>
              <input id="transfer-probability" type="number" min="0" max="1" step="any" required name="transfer_probability" data-scenario-field="transfer_probability" value="${inputValue(scenario.transfer_probability)}">
              <p class="help-text">Valor entre 0 y 1. Las demás órdenes pagan en efectivo.</p></div>
          </div>
          <div class="field patience-field">
            <label class="checkbox-row" for="patience-enabled"><input id="patience-enabled" type="checkbox" name="patience_enabled" data-patience-enabled ${patience ? "checked" : ""}>
              <span>Aplicar paciencia mientras se espera el primer pago</span></label>
          </div>
          <div data-patience-slot>${patienceMarkup}</div>
        </fieldset>

        ${menuMarkup(scenario)}

        ${advancedOptions}
        ${scenarioNavigator}
      </form>

      <aside class="scenario-side" aria-label="Notas del modelo y archivos">
        <details class="work-surface side-surface scenario-help" data-model-help ${options.helpOpen ? "open" : ""}>
          <summary>Ayuda del modelo</summary>
          <ul class="assumption-list">
            <li>Una orden compartida tiene un pago y una preparación.</li>
            <li>El tamaño del grupo no cambia el tiempo de preparación.</li>
            <li>La paciencia solo cuenta antes de empezar el pago.</li>
            <li>El estado vacío al abrir es una decisión explícita.</li>
            <li>Los intervalos de confianza describen la variación entre simulaciones.</li>
          </ul>
        </details>
        <section class="work-surface side-surface">
          <h2>Reabrir un archivo</h2>
          <p>Abre un escenario, réplica o experimento sin volver a ejecutarlo.</p>
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

export function collectScenarioDraft(
  form: HTMLFormElement,
  base: ScenarioDraft,
): { scenario: ScenarioDraft; replications: number } {
  const data = new FormData(form);
  const next = structuredClone(base);
  const engine = next.engine_config;
  const mode = String(data.get("mode") ?? engine.mode) as EngineConfigDraft["mode"];
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
    if (path === "scenario_id") next.scenario_id = String(value ?? "");
    else if (path === "display_name") next.display_name = String(value ?? "");
    else if (path === "transfer_probability") next.transfer_probability = value as number | null;
    else if (path === "default_root_seed") next.default_root_seed = value as number | null;
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
  for (const [key, value] of distributions) {
    const definition = DISTRIBUTIONS.find((candidate) => candidate.key === key);
    if (definition) next[definition.key] = value as unknown as TimeDistributionDraft;
  }

  const scheduleEnabled = data.get("arrival_schedule_enabled") === "on";
  next.arrival_schedule_enabled = scheduleEnabled;
  if (scheduleEnabled) {
    const baseSchedule = base.arrival_schedule ?? [];
    const rows = [...form.querySelectorAll<HTMLElement>("[data-arrival-window]")];
    if (rows.length > 0) {
      next.arrival_schedule = rows.map((row, index) => {
        const start = readNumber(row.querySelector<HTMLInputElement>(`[data-arrival-window-start="${index}"]`)?.value ?? "");
        const endMinutes = readNumber(row.querySelector<HTMLInputElement>(`[data-arrival-window-end="${index}"]`)?.value ?? "");
        const rate = readNumber(row.querySelector<HTMLInputElement>(`[data-arrival-orders-per-hour="${index}"]`)?.value ?? "");
        const previousBaseEnd = baseSchedule[index - 1]?.end_s;
        const previousEndInput = rows[index - 1]?.querySelector<HTMLInputElement>(`[data-arrival-window-end="${index - 1}"]`);
        const editedPreviousEnd = previousEndInput ? readNumber(previousEndInput.value) : null;
        const previousEndSeconds = editedPreviousEnd == null ? null : editedPreviousEnd * 60;
        const previousBoundaryChanged = index > 0 && finite(previousBaseEnd) && finite(previousEndSeconds)
          && Math.abs(previousBaseEnd - previousEndSeconds) > 1e-7;
        return {
          start_s: previousBoundaryChanged ? previousEndSeconds : start,
          end_s: endMinutes == null ? null : endMinutes * 60,
          orders_per_hour: rate,
        };
      });
    } else {
      next.arrival_schedule = base.arrival_schedule?.length ? base.arrival_schedule : defaultArrivalSchedule(next);
    }
  }

  const menuEnabled = data.get("menu_enabled") === "on";
  next.menu_enabled = menuEnabled;
  if (menuEnabled) {
    const baseMenu = base.menu ?? defaultMenu();
    const productRows = [...form.querySelectorAll<HTMLElement>("[data-menu-product]")];
    if (productRows.length > 0) {
      const products = productRows.map((row, index) => {
        const previous = baseMenu.products[index];
        const productId = row.dataset.menuProductId ?? previous?.product_id ?? "";
        const preparation = readNumber(row.querySelector<HTMLInputElement>(`[data-menu-product-time="${index}"]`)?.value ?? "");
        return previous
          ? { ...previous, product_id: productId, preparation_s: preparation }
          : { product_id: productId, display_name: productId, visual_kind: "fruit_salad" as const, preparation_s: preparation };
      });
      const basketRows = [...form.querySelectorAll<HTMLElement>("[data-menu-basket]")];
      const baskets = basketRows.map((row, index) => {
        const probability = readNumber(row.querySelector<HTMLInputElement>(`[data-menu-basket-probability="${index}"]`)?.value ?? "");
        const items = [...row.querySelectorAll<HTMLInputElement>(`[data-menu-basket-quantity="${index}"]`)]
          .map((input) => ({
            product_id: input.dataset.menuQuantity ?? "",
            quantity: readNumber(input.value),
          }))
          .filter((item) => item.quantity !== 0);
        const represented = new Set(productRows.map((productRow) => productRow.dataset.menuProductId ?? ""));
        const unrepresented = baseMenu.baskets[index]?.items.filter((item) => !represented.has(item.product_id)) ?? [];
        return { probability, items: [...items, ...unrepresented] };
      });
      next.menu = { products, baskets };
    } else {
      next.menu = base.menu ?? defaultMenu();
    }
  }

  if (data.get("patience_enabled") === "on") {
    const patienceRow = form.querySelector<HTMLElement>('[data-distribution-row="patience"]');
    if (patienceRow) {
      const kind = patienceRow.querySelector<HTMLSelectElement>("[data-distribution-kind]")?.value ?? "triangular";
      const value: Record<string, unknown> = { kind };
      for (const input of patienceRow.querySelectorAll<HTMLInputElement>("[data-distribution-field]")) {
        const path = input.dataset.distributionField?.split(".")[1];
        if (path) value[path] = readNumber(input.value);
      }
      next.patience = value as unknown as TimeDistributionDraft;
    } else {
      next.patience = base.patience ?? buildDistribution("constant");
    }
  } else {
    next.patience = null;
  }

  const initial: InitialOrderDraft[] = [];
  for (const row of form.querySelectorAll<HTMLElement>("[data-initial-order]")) {
    const index = Number(row.dataset.initialOrder);
    const baseItems = base.initial_state[index]?.items;
    const stage = row.querySelector<HTMLSelectElement>(`[data-initial-stage="${index}"]`)?.value ?? "waiting_payment";
    const item: InitialOrderDraft = {
      order_id: row.querySelector<HTMLInputElement>(`[data-initial-field="${index}.order_id"]`)?.value ?? "",
      person_ids: (row.querySelector<HTMLTextAreaElement>(`[data-initial-field="${index}.person_ids"]`)?.value ?? "")
        .split(/\r?\n/).map((person) => person.trim()).filter(Boolean),
      arrival_s: null,
      stage: stage as InitialOrderDraft["stage"],
      queue_rank: null,
      worker_id: null,
      remaining_s: null,
      patience_remaining_s: null,
      payment_active_s: null,
      transfer_wait_s: null,
      preparation_s: null,
    };
    const optionalNumberFields: Array<
      "arrival_s" | "queue_rank" | "remaining_s" | "patience_remaining_s"
      | "payment_active_s" | "transfer_wait_s" | "preparation_s"
    > = ["arrival_s", "queue_rank", "remaining_s", "patience_remaining_s", "payment_active_s", "transfer_wait_s", "preparation_s"];
    for (const field of optionalNumberFields) {
      const input = row.querySelector<HTMLInputElement>(`[data-initial-field="${index}.${field}"]`);
      if (input) item[field] = readNumber(input.value);
    }
    const worker = row.querySelector<HTMLSelectElement>(`[data-initial-field="${index}.worker_id"]`);
    if (worker) item.worker_id = worker.value || null;
    const method = row.querySelector<HTMLSelectElement>(`[data-initial-field="${index}.payment_method"]`)?.value;
    if (method === "cash" || method === "transfer") item.payment_method = method;
    if (baseItems !== undefined) item.items = structuredClone(baseItems);
    initial.push(item);
  }
  next.initial_state = initial;

  if (next.contract_version === "2") {
    next.engine_config.cashier_interruptions = [
      ...form.querySelectorAll<HTMLElement>("[data-interruption-row]"),
    ].map((row) => {
      const index = Number(row.dataset.interruptionRow);
      return {
        at_s: readNumber(row.querySelector<HTMLInputElement>(`[data-interruption-at="${index}"]`)?.value ?? ""),
        suspended_order_id: row.querySelector<HTMLInputElement>(`[data-suspended-order-id="${index}"]`)?.value ?? "",
        cashier_order_id: row.querySelector<HTMLInputElement>(`[data-cashier-order-id="${index}"]`)?.value ?? "",
      };
    });
  }

  if (base.provenance === "synthetic_demo" && JSON.stringify(next) !== JSON.stringify(base)) {
    next.provenance = "user_assumptions";
    const assumptions = Array.isArray(next.assumptions) ? next.assumptions as string[] : [];
    const userAssumption = "Los parámetros editados en la interfaz son supuestos del usuario y no provienen de una calibración de las observaciones.";
    next.assumptions = assumptions.includes(userAssumption) ? assumptions : [...assumptions, userAssumption];
  }

  const replications = readNumber(String(data.get("replications") ?? "")) ?? 1;
  return { scenario: simplifyPayment(next), replications };
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

export function buildDistribution(kind: string): TimeDistributionDraft {
  if (kind === "constant") return { kind, value_s: null };
  if (kind === "exponential") return { kind, mean_s: null };
  return { kind: "triangular", low_s: null, mode_s: null, high_s: null };
}

export function newInitialOrder(): InitialOrderDraft {
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
  };
}
