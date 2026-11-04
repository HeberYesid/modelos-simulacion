import { processingDisclosure, serviceStatusMessage } from "../deployment";

export type MainView = "observations" | "scenario" | "results";

export function renderShell(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("The application root element is missing.");

  app.innerHTML = `
    <div class="app-frame">
      <aside class="app-sidebar">
        <a class="brand" href="#observations" aria-label="Boquitas, inicio">
          <svg class="brand-mark" viewBox="0 0 40 48" aria-hidden="true" focusable="false">
            <path d="M8 21h24L20 46 8 21Z" fill="#E4B66E" />
            <path d="m11 25 15 5M14 31l9 4m-5-11-6 11m13-5-6 11" fill="none" stroke="#B17E3B" stroke-linecap="round" stroke-width="1.2" />
            <path d="M7 20a13 13 0 0 1 26 0v1H7v-1Z" fill="#7041C9" />
            <path d="M12 17c2-4 7-6 12-4 2 .5 3.5 2 4 4-3-1-5-1-7 .5-3 2-6 2-9-.5Z" fill="#B93867" />
            <circle cx="28.5" cy="7.5" r="3" fill="#B93867" />
            <path d="M28.5 5.5c-.8-2 0-3.6 1.7-4.5" fill="none" stroke="#4E835D" stroke-linecap="round" stroke-width="1.6" />
          </svg>
          <span class="brand-copy"><strong>Boquitas</strong><span>modelo de atención</span></span>
        </a>

        <nav id="view-nav" class="view-nav" aria-label="Vistas principales" aria-orientation="vertical" role="tablist">
          <button class="view-tab" id="tab-observations" type="button" role="tab"
            aria-controls="view-root" aria-selected="true" data-view="observations">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 4.5h9l5 5V20H5z"/><path d="M14 4.5V10h5M8 13h8M8 16.5h8"/></svg>
            <span>Datos observados</span>
          </button>
          <button class="view-tab" id="tab-scenario" type="button" role="tab"
            aria-controls="view-root" aria-selected="false" data-view="scenario" tabindex="-1">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 6h14M5 12h14M5 18h14"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="18" r="2"/></svg>
            <span>Escenarios</span>
          </button>
          <button class="view-tab" id="tab-results" type="button" role="tab"
            aria-controls="view-root" aria-selected="false" data-view="results" tabindex="-1">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4.5 19.5h15M6 17V11m6 6V5m6 12v-8"/><path d="m5.5 8 6-4 6 4"/></svg>
            <span>Resultados</span>
          </button>
        </nav>
      </aside>

      <div class="app-workspace">
        <header class="topbar">
          <span class="topbar-label">Simulación de atención</span>
          <div class="topbar-meta">
            <button class="secondary-button theme-toggle" type="button" data-color-scheme-toggle aria-pressed="false">
              <svg class="theme-icon theme-icon--moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.1 15.6A8.4 8.4 0 0 1 8.4 3.9 8.6 8.6 0 1 0 20.1 15.6Z" /></svg>
              <svg class="theme-icon theme-icon--sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
              <span>Modo oscuro</span>
            </button>
            <span id="service-status" class="service-status" data-state="checking">
              <span class="status-dot" aria-hidden="true"></span><span>${serviceStatusMessage("checking")}</span>
            </span>
            <span id="scenario-dirty" class="dirty-indicator" hidden>Escenario con cambios sin ejecutar</span>
          </div>
        </header>

        <main class="app-main">
          <div id="view-root" class="view-root" role="tabpanel" aria-labelledby="tab-observations" tabindex="-1"></div>
        </main>

        <footer class="app-footer">
          <span>${processingDisclosure()}</span>
          <span>Observaciones y escenarios se manejan por separado</span>
        </footer>
      </div>
    </div>
    <div id="global-announcement" class="visually-hidden" aria-live="polite" aria-atomic="true"></div>
  `;
}

export function setActiveView(view: MainView): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    const active = button.dataset.view === view;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }
  const root = document.querySelector<HTMLElement>("#view-root");
  root?.setAttribute("aria-labelledby", `tab-${view}`);
}

export function setDirty(dirty: boolean): void {
  const indicator = document.querySelector<HTMLElement>("#scenario-dirty");
  if (indicator) indicator.hidden = !dirty;
}

export function announce(message: string): void {
  const live = document.querySelector<HTMLElement>("#global-announcement");
  if (!live) return;
  live.textContent = "";
  requestAnimationFrame(() => {
    live.textContent = message;
  });
}
