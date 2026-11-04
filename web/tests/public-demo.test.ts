import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderShell } from "../src/components/shell";
import { renderObservationsView } from "../src/components/observations";
import { renderObservedSection } from "../src/components/observed-replay";
import { ServiceError } from "../src/services/api";

function observationImportText(): string {
  const root = document.createElement("div");
  root.innerHTML = renderObservationsView({
    report: null,
    failureReport: null,
    mode: "file",
    pending: false,
    error: null,
  });
  return root.querySelector(".input-surface")?.textContent ?? "";
}

describe("public demo disclosure", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("keeps the local defaults and measured replay outside public demo mode", () => {
    renderShell();

    expect(document.querySelector(".app-footer")?.textContent).toContain("Procesamiento local · sin envío externo");
    expect(document.querySelector("#service-status")?.textContent).toContain("servicio local");
    expect(observationImportText()).toContain("procesamiento local");
    expect(renderObservedSection()).toContain("Reproducir días medidos en 3D");
    expect(new ServiceError(0, {}).message).toBe("No se pudo completar la solicitud al servicio local. Verifica que la aplicación siga activa e inténtalo de nuevo.");
  });

  it("discloses synthetic server processing and omits measured replay UI in public demo mode", () => {
    vi.stubEnv("VITE_PUBLIC_DEMO", "true");

    renderShell();
    const footer = document.querySelector(".app-footer")?.textContent ?? "";
    const serviceStatus = document.querySelector("#service-status")?.textContent ?? "";
    const observedMarkup = document.createElement("div");
    observedMarkup.innerHTML = renderObservedSection();

    expect(footer).toContain("Demostración pública");
    expect(footer).toContain("escenarios sintéticos");
    expect(footer).toContain("servidor");
    expect(footer).not.toContain("Procesamiento local");
    expect(serviceStatus).not.toContain("servicio local");
    expect(observationImportText()).toContain("archivo se procesa en el servidor");
    expect(observationImportText()).not.toContain("procesamiento local");
    expect(new ServiceError(0, {}).message).toContain("servicio de demostración pública");
    expect(new ServiceError(0, {}).message).not.toContain("servicio local");
    expect(observedMarkup.querySelector(".observed-surface")).toBeNull();
    expect(observedMarkup.textContent).toContain("datos observados reales y su reproducción 3D no están incluidos");
  });
});
