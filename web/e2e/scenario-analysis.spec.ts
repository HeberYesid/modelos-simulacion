import { expect, test } from "@playwright/test";

test("shows a plain-language diagnosis for a completed demo run", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();

  const runResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ejecutar una réplica", exact: true }).click();
  expect((await runResponse).status()).toBe(200);

  const diagnosis = page.locator('section[aria-labelledby="congestion-analysis-title"]');
  await expect(diagnosis.getByRole("heading", { name: "Dónde se acumula la espera" })).toBeVisible();
  await expect(diagnosis).toContainText("Una prueba de");
  await expect(diagnosis.getByRole("heading", { name: "Qué podrías probar" })).toBeVisible();
  await expect(diagnosis.locator(".analysis-assumptions")).toBeVisible();
  await diagnosis.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("scenario-analysis-run-desktop.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("scenario-analysis-run-mobile.png") });
});

test("changes the comparison goal without rerunning and keeps it across views", async ({ page }, testInfo) => {
  let experimentRequests = 0;
  let runRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/experiments") && request.method() === "POST") experimentRequests += 1;
    if (request.url().endsWith("/api/v1/runs") && request.method() === "POST") runRequests += 1;
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await page.locator("details[data-comparison-options] > summary").click();
  await page.getByRole("button", { name: "Copiar referencia como candidato", exact: true }).click();
  await page.locator("details[data-advanced-options] > summary").click();
  await page.locator("#scenario-id").fill("two-preparers");
  await page.locator("#scenario-name").fill("Dos preparadores");
  await page.locator("#replications").fill("2");
  await page.locator("#preparers").fill("2");

  const experimentResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/experiments") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Comparar escenarios", exact: true }).click();
  expect((await experimentResponse).status()).toBe(200);
  expect(experimentRequests).toBe(1);

  const selectedRunResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Inspeccionar esta réplica", exact: true }).click();
  expect((await selectedRunResponse).status()).toBe(200);
  expect(runRequests).toBe(1);

  const objective = page.getByRole("combobox", { name: "¿Qué quieres mejorar?" });
  const content = page.locator("#analysis-objective-content");
  const diagnosis = page.locator('section[aria-labelledby="congestion-analysis-title"]');
  await expect(diagnosis).toContainText("La prueba elegida de");
  await expect(diagnosis).toContainText("No resume todas las pruebas de la comparación.");
  const replayReadout = await page.locator("#replay-readout").innerText();
  await expect(objective).toHaveValue("time");
  await expect(objective.locator("option")).toHaveCount(3);
  await expect(content).toContainText("Referencia:");
  await expect(content).toContainText("Dos preparadores");
  const timeReport = await content.innerText();

  await objective.focus();
  await objective.press("ArrowDown");
  await objective.press("Enter");
  await expect(objective).toHaveValue("withdrawals");
  await expect(objective).toBeFocused();
  await expect(content).not.toHaveText(timeReport, { useInnerText: true });
  const withdrawalsReport = await content.innerText();
  expect(experimentRequests).toBe(1);
  expect(runRequests).toBe(1);
  await expect(page.locator("#replay-readout")).toHaveText(replayReadout);

  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  await expect(objective).toHaveValue("withdrawals");
  await expect(content).toHaveText(withdrawalsReport, { useInnerText: true });
  await content.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("scenario-analysis-comparison-desktop.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await content.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("scenario-analysis-comparison-mobile.png") });
});
