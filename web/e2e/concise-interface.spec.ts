import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import type { RunResult } from "../src/api/types";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`optional model help opens by keyboard without changing the draft at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
    await page.locator("details[data-advanced-options] > summary").click();
    await expect(page.locator("#root-seed")).toHaveValue("20261020");
    const formValues = () => page.locator("#scenario-form").evaluate((element) =>
      [...new FormData(element as HTMLFormElement).entries()],
    );
    const original = await formValues();
    const summary = page.getByText("Ayuda del modelo", { exact: true });
    const help = summary.locator("..");
    await expect(help).toHaveJSProperty("open", false);
    await expect(help.locator(".assumption-list")).toBeHidden();
    await summary.focus();
    await summary.press("Enter");
    await expect(help).toHaveJSProperty("open", true);
    await expect(help.locator(".assumption-list")).toBeVisible();
    await summary.press("Space");
    await expect(help).toHaveJSProperty("open", false);
    expect(await formValues()).toEqual(original);
    await expect(page.locator("#scenario-dirty")).toBeHidden();
    await expect(page.getByRole("button", { name: "Ejecutar una réplica", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("the metric overview keeps the complete saved breakdown available without rerunning", async ({ page }) => {
  let runRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/runs")) runRequests += 1;
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  const response = page.waitForResponse((item) => item.url().endsWith("/api/v1/runs") && item.request().method() === "POST");
  await page.getByRole("button", { name: "Ejecutar una réplica", exact: true }).click();
  const resultResponse = await response;
  expect(resultResponse.status()).toBe(200);
  const run = await resultResponse.json() as RunResult;
  const section = page.locator('section[aria-labelledby="run-metrics-title"]');
  await expect(section.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
  const summary = section.getByText("Ver todos los indicadores", { exact: true });
  const detail = summary.locator("..");
  await expect(detail).toHaveJSProperty("open", false);
  await expect(detail.locator("table")).toBeHidden();
  const visibleRows = await section.locator("tbody tr:visible").count();
  expect(visibleRows).toBeGreaterThan(0);
  expect(visibleRows).toBeLessThanOrEqual(8);
  expect(visibleRows).toBeLessThan(run.metrics.metric_summaries.length);
  const originalReadout = await page.locator("#replay-readout").innerText();
  await summary.focus();
  await summary.press("Enter");
  await expect(detail.locator("table")).toBeVisible();
  for (const metric of run.metrics.metric_summaries) {
    // Preserve every indicator previously displayed, including unavailable measures.
    if (metric.metric_id.includes(".external_confirmation.") && metric.value === 0) continue;
    await expect(section.getByText(metric.metric_id, { exact: true })).toHaveCount(1);
  }
  await summary.press("Enter");
  await expect(detail).toHaveJSProperty("open", false);
  await expect(page.locator("#replay-readout")).toHaveText(originalReadout);
  expect(runRequests).toBe(1);
  await expect(page.locator(".result-orders")).toBeVisible();
  await expect(page.getByRole("button", { name: "Descargar resultado JSON", exact: true })).toBeVisible();
});

test("script assumptions and incompatibility warnings stay visible with optional help closed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  const validation = page.waitForResponse((response) => response.url().endsWith("/api/v1/files/validate"));
  await page.locator("#saved-json-file").setInputFiles(fileURLToPath(new URL("../contracts/fixtures/sample-scenario-v2.json", import.meta.url)));
  expect((await validation).status()).toBe(200);
  await expect(page.locator("[data-interruption-schedule]")).toBeVisible();
  await expect(page.getByText("Supuesto explícito del usuario.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-interruption-at="0"]')).toHaveValue("5");
  await page.locator('[data-mode="tuesday"]').check();
  await expect(page.locator("[data-interruption-compatibility]")).toBeVisible();
  await expect(page.locator("[data-interruption-compatibility]")).toContainText("modo normal");
  await expect(page.locator('[data-interruption-at="0"]')).toHaveValue("5");
  await expect(page.locator('[data-suspended-order-id="0"]')).toHaveValue("A");
  await expect(page.locator('[data-cashier-order-id="0"]')).toHaveValue("B");
});
