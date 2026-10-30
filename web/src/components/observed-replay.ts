import { escapeHtml, formatClockFromOpening } from "../domain/format";
import { advance_playback_clock, create_playback_clock, pause, play, restart, seek, set_speed, type PlaybackSpeed } from "../replay/clock";
import { observedEvents, observedSceneState, observedSceneTrace, observedTimeSeconds, observedVisits, observedWarnings, projectObservedVisit, type ObservedRecord, type ObservedVisit } from "../replay/observed";
import { createShopScene, type ShopScene } from "../replay/scene";

const memories = new Map<string, { time: number; record: string }>();
let selectedVisitId: string | null = null;
const stationName = (record: ObservedRecord): string => record.station === "caja" ? "Caja" : "Entrega";
const recordName = (record: ObservedRecord): string => `${stationName(record)} · ${record.station_local_id}`;
const localClock = (visit: ObservedVisit, time: number): string => formatClockFromOpening(visit.start_time, Math.floor(time));

export interface ObservedSectionHandle { dispose(): void }

export function renderObservedSection(): string {
  return `<section class="work-surface results-surface observed-surface" aria-labelledby="observed-title">
    <div class="surface-heading"><div><h2 id="observed-title">Reproducir días medidos en 3D</h2>
      <p>Visitas del 20 y 23 de octubre de 2026. Sus registros ya están incluidos; no necesitas importar un archivo.</p></div></div>
    <div class="button-row" role="group" aria-label="Elegir día medido">
      ${observedVisits.map((visit) => `<button class="secondary-button" type="button" data-observed-visit="${escapeHtml(visit.visit_id)}" aria-pressed="${visit.visit_id === selectedVisitId}">Ver ${visit.date === "2026-10-20" ? "martes 20" : "viernes 23"} de octubre</button>`).join("")}
    </div><div data-observed-player></div>
  </section>`;
}

function playerMarkup(visit: ObservedVisit): string {
  return `<h3 id="observed-visit-title" tabindex="-1">${escapeHtml(visit.label)} · ${visit.start_time}–${visit.end_time}</h3>
    <p>Datos medidos · ${visit.records.length} registros de estación. Cada cubo representa un registro, no una persona ni un trabajador. Las posiciones son ilustrativas.</p>
    <details class="details-block"><summary>Qué se conoce y qué falta</summary>
      <ul>${observedWarnings(visit).map((text) => `<li>${escapeHtml(text)}</li>`).join("")}
      <li>No se registraron tamaños de grupo, medios de pago ni productos. No se calculan personas, trabajo activo ni indicadores de simulación.</li></ul>
      <p>La fila inicial y el trabajo previo sin identificar no se dibujan. Un espacio sin marcadores no demuestra que el local estuviera vacío.</p>
      <p>Las filas de caja y entrega se muestran por separado, incluso cuando el vínculo del pedido está confirmado. No se inventan recorridos entre estaciones ni límites de pausas.</p>
    </details>
    <div class="replay-controls" role="group" aria-label="Reproducción de datos medidos">
      <div class="replay-transport">
        <button class="primary-button" type="button" data-observed-play aria-pressed="false">Reproducir datos medidos</button>
        <button class="secondary-button" type="button" data-observed-restart>Volver al inicio del día</button>
        <div class="field replay-speed"><label for="observed-speed">Velocidad de datos medidos</label><select id="observed-speed"><option value="1">1×</option><option value="5">5×</option><option value="20" selected>20×</option><option value="60">60×</option></select></div>
      </div>
      <div class="replay-camera-controls" role="group" aria-label="Cámara de datos medidos">
        <button class="secondary-button" type="button" data-observed-camera="reset">Restablecer cámara</button>
        <button class="quiet-button" type="button" data-observed-camera="out" aria-label="Alejar cámara de datos medidos">−</button>
        <button class="quiet-button" type="button" data-observed-camera="in" aria-label="Acercar cámara de datos medidos">+</button>
      </div>
    </div>
    <div id="observed-stage" class="replay-stage" data-state="loading">
      <canvas aria-label="Local ilustrativo con cubos de registros medidos. Consulta sus datos en el inspector."></canvas>
      <div id="observed-render-status" class="replay-render-status" role="status">Preparando la vista de datos medidos…</div>
    </div>
    <button class="secondary-button" type="button" data-observed-retry hidden>Reintentar vista 3D de datos medidos</button>
    <div class="observed-clock"><label for="observed-slider">Reloj del día medido</label>
      <input id="observed-slider" type="range" min="0" max="${visit.duration_s}" step="1" value="0" aria-describedby="observed-readout">
      <output id="observed-readout" for="observed-slider" aria-live="off"></output>
    </div>
    <p id="observed-summary"></p>
    <div class="field"><label for="observed-record">Inspeccionar registro medido</label>
      <select id="observed-record">${visit.records.map((record) => `<option value="${escapeHtml(record.record_id)}">${escapeHtml(recordName(record))}</option>`).join("")}</select></div>
    <div id="observed-detail" class="observed-detail"></div>
    <details class="details-block" open><summary>Últimos eventos hasta este instante</summary>
      <p id="observed-last-event"></p><ol id="observed-events" class="observed-events"></ol>
    </details>`;
}

/** Independent player: never constructs a RunResult or invokes simulation endpoints. */
function mountPlayer(root: HTMLElement, visit: ObservedVisit): ObservedSectionHandle {
  const required = <T extends Element>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing observed playback control: ${selector}`);
    return element;
  };
  const stage = required<HTMLElement>("#observed-stage");
  const slider = required<HTMLInputElement>("#observed-slider");
  const button = required<HTMLButtonElement>("[data-observed-play]");
  const recordSelect = required<HTMLSelectElement>("#observed-record");
  const status = required<HTMLElement>("#observed-render-status");
  const retry = required<HTMLButtonElement>("[data-observed-retry]");
  const events = observedEvents(visit);
  const memory = memories.get(visit.visit_id);
  let clock = create_playback_clock(visit.duration_s, memory?.time ?? 0);
  let scene: ShopScene | null = null;
  let disposed = false;
  let frame: number | null = null;
  let lastFrame: number | null = null;
  let lastSecond = -1;
  const abort = new AbortController();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  recordSelect.value = memory?.record ?? visit.records[0].record_id;

  const save = (): void => { memories.set(visit.visit_id, { time: clock.time_s, record: recordSelect.value }); };
  const selectedStage = (): string => {
    const record = visit.records.find((entry) => entry.record_id === recordSelect.value)!;
    const state = projectObservedVisit(visit, clock.time_s).records.find((entry) => entry.order_id === record.record_id);
    if (!state) return "Todavía sin llegada registrada a esta estación";
    if (state.stage === "completed") return record.station === "caja" ? "Fin de intervalo de caja registrado" : "Entrega registrada";
    return ({ waiting_payment: "Espera registrada en caja", payment_active: "Dentro del intervalo registrado de caja",
      waiting_preparation: "Espera registrada antes de preparación", preparing: "Dentro del intervalo registrado de preparación",
      withdrawn: "Salida registrada sin servicio" } as const)[state.stage];
  };
  const updateDetail = (): void => {
    const record = visit.records.find((entry) => entry.record_id === recordSelect.value)!;
    const fields = [
      ["Llegada a esta estación", "hora_llegada"], ["Inicio registrado", "hora_inicio"],
      ["Fin registrado", "hora_fin"], ["Salida sin servicio", "hora_se_fue"],
    ] as const;
    required<HTMLElement>("#observed-detail").innerHTML = `<dl class="replay-inspector-grid">
      <div><dt>Registro</dt><dd>${escapeHtml(recordName(record))}</dd></div>
      <div><dt>Estado al instante</dt><dd id="observed-record-state">${selectedStage()}</dd></div>
      <div><dt>Vínculo entre estaciones</dt><dd>${record.confirmed_link_id ? `Pedido ${escapeHtml(record.station_local_id)} · confirmado en esta visita` : "No confirmado"}</dd></div>
      <div><dt>Personas / trabajador asignado</dt><dd>No registrado</dd></div>
      <div><dt>Fuente y línea</dt><dd>${escapeHtml(record.source_id)} · línea ${record.source_line}</dd></div>
      ${fields.map(([label, field]) => `<div><dt>${label}</dt><dd>${record.raw_fields[field] ? `<button class="quiet-button" type="button" data-observed-time="${observedTimeSeconds(visit, record.raw_fields[field])}">${record.raw_fields[field]}</button>` : "No registrado"}</dd></div>`).join("")}
    </dl>`;
    scene?.setSelection(`record:${record.record_id}`);
    save();
  };
  const paint = (force = false): void => {
    slider.value = String(clock.time_s);
    button.textContent = clock.playing ? "Pausar datos medidos" : "Reproducir datos medidos";
    button.setAttribute("aria-pressed", String(clock.playing));
    const second = Math.floor(clock.time_s);
    if (force || second !== lastSecond) {
      lastSecond = second;
      const projection = projectObservedVisit(visit, clock.time_s);
      const selectedState = root.querySelector<HTMLElement>("#observed-record-state");
      if (selectedState) selectedState.textContent = selectedStage();
      scene?.setState(observedSceneState(visit, clock.time_s), null, false);
      scene?.setSimulationTime(clock.time_s);
      const applied = events.filter((event) => event.time_s <= clock.time_s);
      required<HTMLOutputElement>("#observed-readout").textContent = `${localClock(visit, clock.time_s)} · ${applied.length} de ${events.length} marcas registradas`;
      slider.setAttribute("aria-valuetext", localClock(visit, clock.time_s));
      const count = (phase: string): number => projection.records.filter((record) => record.stage === phase).length;
      required<HTMLElement>("#observed-summary").textContent = `${count("waiting_payment")} registros esperando en caja · ${count("payment_active")} intervalos de caja · ${count("waiting_preparation")} registros esperando preparación · ${count("preparing")} intervalos de preparación. Son registros e intervalos observados; no personas ni trabajadores activos.`;
      const last = applied.at(-1);
      required<HTMLElement>("#observed-last-event").textContent = last ? `Última marca: ${localClock(visit, last.time_s)} · ${last.label}` : "Todavía no hay marcas registradas en este instante.";
      required<HTMLOListElement>("#observed-events").innerHTML = applied.slice(-8).map((event) => {
        const record = visit.records.find((entry) => entry.record_id === event.record_id)!;
        return `<li><button class="quiet-button" type="button" data-observed-time="${event.time_s}" data-observed-record="${escapeHtml(record.record_id)}">${localClock(visit, event.time_s)} · ${escapeHtml(recordName(record))} · ${escapeHtml(event.label)}</button></li>`;
      }).join("");
    }
    scene?.render();
    save();
  };
  const stop = (): void => { if (frame !== null) cancelAnimationFrame(frame); frame = null; lastFrame = null; };
  const tick = (now: number): void => {
    frame = null;
    if (disposed || !clock.playing || document.hidden) return;
    const delta = lastFrame === null ? 0 : Math.max(0, (now - lastFrame) / 1000);
    lastFrame = now;
    clock = advance_playback_clock(clock, delta);
    paint();
    if (clock.playing) frame = requestAnimationFrame(tick);
  };
  const start = (): void => { if (!disposed && clock.playing && !document.hidden && frame === null) frame = requestAnimationFrame(tick); };
  const graphicsUnavailable = (): void => {
    scene?.dispose(); scene = null;
    stage.dataset.state = "unavailable";
    status.textContent = "Vista 3D no disponible. Puedes usar el reloj, los eventos y el inspector de datos medidos.";
    retry.hidden = false;
    root.querySelectorAll<HTMLButtonElement>("[data-observed-camera]").forEach((control) => { control.disabled = true; });
  };
  const initScene = (): void => {
    scene?.dispose(); scene = null;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-label", "Local ilustrativo: cada cubo representa un registro medido, no una persona.");
    stage.querySelector("canvas")?.replaceWith(canvas);
    try {
      scene = createShopScene(stage, canvas, observedSceneTrace(visit), {
        reducedMotion: motion.matches, recordMarkers: true,
        recordLabels: Object.fromEntries(visit.records.map((record) => [`record:${record.record_id}`, recordName(record)])),
        onPersonSelected(id) {
          if (!id) return;
          recordSelect.value = id.slice("record:".length);
          updateDetail();
        },
        onContextLost: graphicsUnavailable,
      });
      stage.dataset.state = "available";
      status.textContent = "Datos medidos · cubos = registros · posiciones ilustrativas";
      retry.hidden = true;
      root.querySelectorAll<HTMLButtonElement>("[data-observed-camera]").forEach((control) => { control.disabled = false; });
      paint(true); updateDetail();
    } catch { graphicsUnavailable(); }
  };
  root.addEventListener("click", (event) => {
    const control = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!control) return;
    if (control.hasAttribute("data-observed-play")) {
      clock = clock.playing ? pause(clock) : play(clock.time_s === visit.duration_s ? restart(clock) : clock);
      if (clock.playing) start(); else stop();
    } else if (control.hasAttribute("data-observed-restart")) { clock = restart(clock); stop(); }
    else if (control.hasAttribute("data-observed-time")) {
      clock = pause(seek(clock, Number(control.dataset.observedTime))); stop();
      if (control.dataset.observedRecord) { recordSelect.value = control.dataset.observedRecord; updateDetail(); }
    } else if (control.hasAttribute("data-observed-retry")) initScene();
    else if (control.dataset.observedCamera === "reset") scene?.resetCamera();
    else if (control.dataset.observedCamera === "in" || control.dataset.observedCamera === "out") scene?.zoom(control.dataset.observedCamera);
    paint(true);
  }, { signal: abort.signal });
  slider.addEventListener("input", () => { clock = seek(clock, Number(slider.value)); paint(true); }, { signal: abort.signal });
  recordSelect.addEventListener("change", updateDetail, { signal: abort.signal });
  required<HTMLSelectElement>("#observed-speed").addEventListener("change", (event) => {
    clock = set_speed(clock, Number((event.target as HTMLSelectElement).value) as PlaybackSpeed);
  }, { signal: abort.signal });
  document.addEventListener("visibilitychange", () => { stop(); start(); }, { signal: abort.signal });
  motion.addEventListener("change", () => { scene?.setReducedMotion(motion.matches); scene?.render(); }, { signal: abort.signal });
  initScene(); paint(true); updateDetail();
  return { dispose() { disposed = true; stop(); save(); abort.abort(); scene?.dispose(); scene = null; } };
}

export function mountObservedSection(root: HTMLElement): ObservedSectionHandle {
  const surface = root.querySelector<HTMLElement>(".observed-surface")!;
  const slot = surface.querySelector<HTMLElement>("[data-observed-player]")!;
  const abort = new AbortController();
  let player: ObservedSectionHandle | null = null;
  const open = (visit: ObservedVisit, focus: boolean): void => {
    player?.dispose(); selectedVisitId = visit.visit_id;
    surface.querySelectorAll<HTMLButtonElement>("[data-observed-visit]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.observedVisit === visit.visit_id)));
    slot.innerHTML = playerMarkup(visit);
    player = mountPlayer(slot, visit);
    if (focus) slot.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
  };
  surface.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-observed-visit]");
    const visit = observedVisits.find((entry) => entry.visit_id === button?.dataset.observedVisit);
    if (visit) open(visit, true);
  }, { signal: abort.signal });
  const selected = observedVisits.find((visit) => visit.visit_id === selectedVisitId);
  if (selected) open(selected, false);
  return { dispose() { abort.abort(); player?.dispose(); } };
}
