import { expect, test } from "@playwright/test";

test("both visits are ready for audit and independent exploratory simulations", async ({ page }, testInfo) => {
  const imports: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/observations/import")) imports.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Visitas precargadas", exact: true })).toBeVisible();
  await expect(page.locator(".audit-result")).toContainText("119");
  await expect(page.locator(".audit-result")).toContainText("6 intervalos de entrega coinciden");
  const metrics = page.locator(".observed-visit-metrics");
  await expect(metrics).toHaveCount(2);
  for (const [index, day] of ["Martes", "Viernes"].entries()) {
    const visitMetrics = metrics.nth(index);
    await expect(visitMetrics.locator("summary")).toContainText(day);
    await visitMetrics.locator("summary").click();
    const stations = visitMetrics.locator("[data-observed-station]");
    await expect(stations).toHaveCount(2);
    for (const station of await stations.all()) {
      await expect(station.locator("dt")).toHaveText([/^Lq ·/, /^L ·/, /^Wq ·/, /^W ·/, /^P\(ocupada\)/, /^P\(vacía\)/]);
      await expect(station.locator("dd").first()).toBeVisible();
    }
  }
  await page.locator('[data-visit-report="visit_2026-10-23_regular"]').click();
  await expect(page.locator(".audit-result")).toContainText("16");
  await expect(page.locator(".audit-result")).toContainText("2026-10-23");
  await page.getByRole("button", { name: "Ver viernes 23 de octubre", exact: true }).click();
  await expect(page.locator("#observed-record option")).toHaveCount(16);
  await page.screenshot({ path: testInfo.outputPath("visits-observed.png"), fullPage: true });
  expect(imports).toEqual([]);

  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await expect(page.locator("[data-scenario-select]")).toHaveCount(2);
  await expect(page.locator("#scenario-name")).toHaveValue("Martes 20/10 · exploratorio");
  await expect(page.getByRole("heading", { name: "Escenarios de las visitas", exact: true })).toBeVisible();
  for (const [visitId, label] of [
    ["visit_2026-10-20_tuesday_promotion", "Martes 20/10 · exploratorio"],
    ["visit_2026-10-23_regular", "Viernes 23/10 · exploratorio"],
  ]) {
    await page.locator(`[data-visit-scenario="${visitId}"]`).click();
    await expect(page.locator("#scenario-name")).toHaveValue(label);
    const runResponse = page.waitForResponse(response => response.url().endsWith("/api/v1/runs") && response.request().method() === "POST");
    await page.locator("[data-run-scenario]").click();
    expect((await runResponse).status()).toBe(200);
    await expect(page.locator("#view-root")).toContainText(label);
    await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  }
  await page.locator('[data-visit-scenario="visit_2026-10-20_tuesday_promotion"]').click();
  await page.locator("[data-advanced-options] > summary").click();
  await page.locator("#scenario-name").fill("Mi análisis del martes");
  await page.locator('[data-visit-scenario="visit_2026-10-23_regular"]').click();
  await page.locator('[data-visit-scenario="visit_2026-10-20_tuesday_promotion"]').click();
  await expect(page.locator("#scenario-name")).toHaveValue("Mi análisis del martes");
  await page.screenshot({ path: testInfo.outputPath("visits-scenarios.png"), fullPage: true });
});

test("preloaded visits fit on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("[data-visit-report]")).toHaveCount(2);
  await page.locator('[data-visit-report="visit_2026-10-23_regular"]').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await expect(page.locator("[data-visit-scenario]")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
