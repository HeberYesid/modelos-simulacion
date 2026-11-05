import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Scenario } from "../src/api/types";

const demo = JSON.parse(readFileSync(fileURLToPath(new URL("../contracts/fixtures/demo-scenario.json", import.meta.url)), "utf8")) as Scenario;

for (const [cashiers, preparers] of [[1, 1], [1, 2], [2, 1], [2, 2]]) {
  test(`Tuesday ${cashiers} payment and ${preparers} preparation servers`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    const scenario = structuredClone(demo);
    Object.assign(scenario.engine_config, { mode: "tuesday", cashiers, preparers, integrated_workers: 0, horizon_s: 3600 });
    Object.assign(scenario, {
      scenario_id: `queue-${cashiers}-${preparers}`, display_name: "Colas de prueba sintética",
      interarrival: { kind: "exponential", mean_s: 300 },
      payment_active: { kind: "exponential", mean_s: 60 },
      preparation: { kind: "exponential", mean_s: 120 },
      patience: null, initial_state: [], transfer_probability: 0,
    });
    // Import the scenario, then execute through the actual editor/run workflow.
    await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
    await page.locator("#saved-json-file").setInputFiles({ name: "queue-scenario.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(scenario)) });
    await expect(page.locator("#cashiers")).toHaveValue(String(cashiers));
    await expect(page.locator("#preparers")).toHaveValue(String(preparers));
    const response = page.waitForResponse((item) => item.url().endsWith("/api/v1/runs") && item.request().method() === "POST");
    await page.getByRole("button", { name: "Ejecutar una réplica", exact: true }).click();
    expect((await response).status()).toBe(200);
    const panel = page.locator('section[aria-labelledby="queue-models-title"]');
    await expect(panel).toBeVisible();
    await panel.locator("[data-queue-models] > summary").click();
    await expect(panel.locator('[data-queue-stage="payment"] [data-model-reference]')).toContainText(cashiers === 1 ? "M/M/1" : "M/M/s");
    await expect(panel.locator('[data-queue-stage="preparation"] [data-model-reference]')).toContainText(preparers === 1 ? "M/M/1" : "M/M/s");
    await expect(panel).toContainText("Referencia estacionaria aplicable");
    await expect(panel.locator("[data-queue-stage]")).toHaveCount(3);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("queue-models-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.locator("#queue-models-title").scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("queue-models-mobile.png") });
    const scrollRegion = panel.locator('[data-queue-stage="payment"] [role="region"]');
    await scrollRegion.focus();
    await page.keyboard.press("End");
    expect(await scrollRegion.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("non-exponential Tuesday services retain rates without claiming unstable payment", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await page.locator("[data-load-synthetic]").click();
  await expect(page.locator("#dist-interarrival-mean")).toHaveValue("180");
  const response = page.waitForResponse((item) => item.url().endsWith("/api/v1/runs") && item.request().method() === "POST");
  await page.getByRole("button", { name: "Ejecutar una réplica", exact: true }).click();
  expect((await response).status()).toBe(200);
  const panel = page.locator('section[aria-labelledby="queue-models-title"]');
  await panel.locator("[data-queue-models] > summary").click();
  const payment = panel.locator('[data-queue-stage="payment"]');
  const preparation = panel.locator('[data-queue-stage="preparation"]');
  await expect(payment.locator("h3")).toHaveText("Pago · 1 servidor");
  await expect(preparation.locator("h3")).toHaveText("Preparación · 4 servidores");
  await expect(payment.locator("[data-rate-lambda]")).toHaveText("20 órdenes/h");
  await expect(payment.locator("[data-rate-mu]")).toHaveText("120 órdenes/h por servidor");
  await expect(preparation.locator("[data-rate-lambda]")).toHaveText("20 órdenes/h");
  await expect(preparation.locator("[data-rate-mu]")).toHaveText("30 órdenes/h por servidor");
  await expect(payment).toContainText("Las fórmulas M/M no aplican");
  await expect(preparation).toContainText("No se puede asumir que las salidas de pago sean Poisson");
  await expect(preparation).not.toContainText("no tiene un régimen estacionario estable");
  await payment.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("configured-rates-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await payment.locator("h3").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("configured-rates-mobile.png") });
});

test("Friday has one integrated M/M/1 reference with aggregate-service qualification", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await page.locator("[data-load-synthetic]").click();
  await expect(page.locator("#dist-interarrival-mean")).toHaveValue("180");
  await page.locator('[data-mode="regular"]').check();
  const response = page.waitForResponse((item) => item.url().endsWith("/api/v1/runs") && item.request().method() === "POST");
  await page.getByRole("button", { name: "Ejecutar una réplica", exact: true }).click();
  expect((await response).status()).toBe(200);
  const panel = page.locator('section[aria-labelledby="queue-models-title"]');
  await panel.locator("[data-queue-models] > summary").click();
  await expect(panel.locator("[data-queue-stage]")).toHaveCount(1);
  await expect(panel).toContainText("Atención integrada · 1 servidor");
  await expect(panel.locator("[data-model-reference]")).toContainText("Modelo de referencia: M/M/1");
  await expect(panel).toContainText("Aproximación");
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("queue-models-friday.png") });
});

test("live editing reruns the latest valid scenario and opens its replay", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await expect(page.locator("[data-live-load]")).toContainText("Estable");
  await page.getByRole("checkbox", { name: "Actualizar simulación en vivo" }).check();
  await expect(page.locator("[data-live-status]")).toHaveText("Réplica actualizada.");
  const interval = page.locator("#dist-interarrival-mean");
  await interval.fill("");
  await expect(page.locator("[data-live-status]")).toContainText("Revisa");
  await expect(page.locator("[data-open-live-result]")).toBeDisabled();
  await interval.fill("20");
  await expect(interval).toBeFocused();
  await expect(page.locator("[data-live-load]")).toContainText("Inestable");
  await expect(page.locator("[data-live-status]")).toHaveText("Réplica actualizada.");
  await expect(page.locator("[data-live-metrics]")).toContainText("Lq");
  await expect(page.locator("[data-live-metrics]")).toContainText("P(vacío)");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".live-simulation").evaluate((panel) => panel.scrollIntoView({ block: "start" }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("live-simulation-mobile.png") });
  await page.locator("[data-open-live-result]").click();
  await expect(page.locator("#queue-models-title")).toBeVisible();
});

test("live simulation queues edits while a run occupies the engine", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  let releaseFirst!: () => void;
  const firstRun = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let requests = 0;
  await page.route("**/api/v1/runs", async (route) => {
    if (++requests === 1) await firstRun;
    await route.continue();
  });

  const submitted = page.waitForRequest((request) => request.url().endsWith("/api/v1/runs"));
  await page.getByRole("checkbox", { name: "Actualizar simulación en vivo" }).check();
  await submitted;
  const manual = page.getByRole("button", { name: "Ejecutar una réplica", exact: true });
  try {
    await expect(manual).toBeDisabled();
    await page.locator("#dist-interarrival-mean").fill("20");
    await expect(page.locator("[data-open-live-result]")).toBeDisabled();
  } finally {
    releaseFirst();
  }
  const latest = await page.waitForRequest((request) =>
    request.url().endsWith("/api/v1/runs") && request.postDataJSON().scenario.interarrival.mean_s === 20);
  expect(latest.postDataJSON().scenario.interarrival).toEqual({ kind: "exponential", mean_s: 20 });
  await expect(page.locator("[data-live-status]")).toHaveText("Réplica actualizada.");
  await expect(manual).toBeEnabled();
});
