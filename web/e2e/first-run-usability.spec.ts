import { expect, test } from "@playwright/test";

test("a first-time user can run the synthetic demo without importing observations", async ({ page }) => {
  let importRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/observations/import")) {
      importRequests += 1;
    }
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "¿Primera vez? Empieza con una simulación", exact: true })).toBeVisible();
  await expect(page.getByText(/demostración sintética.*no está calibrada/i)).toBeVisible();
  await expect(page.locator("#observations-form")).toBeVisible();

  await page.getByRole("button", { name: "Preparar mi primera simulación", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Escenarios", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#scenario-form")).toBeVisible();

  const runResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ejecutar una réplica", exact: true }).click();
  expect((await runResponse).status()).toBe(200);
  expect(importRequests).toBe(0);
  await expect(page.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
});

test("advanced settings keep their values and disclosure state through view changes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();

  const advanced = page.locator("details[data-advanced-options]");
  const summary = advanced.locator("summary");
  await expect(page.locator("details[data-comparison-options]")).toHaveJSProperty("open", false);
  await expect(advanced).toHaveJSProperty("open", false);
  await summary.focus();
  await summary.press("Enter");
  await expect(advanced).toHaveJSProperty("open", true);

  await page.locator("#root-seed").fill("987654");
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await expect(advanced).toHaveJSProperty("open", true);
  await expect(page.locator("#root-seed")).toHaveValue("987654");

  await summary.press("Space");
  await expect(advanced).toHaveJSProperty("open", false);
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await expect(advanced).toHaveJSProperty("open", false);
  await expect(page.locator("#root-seed")).toHaveValue("987654");
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`the execute action stays in view without covering a focused field at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("tab", { name: "Escenarios", exact: true }).click();

    const execute = page.getByRole("button", { name: "Ejecutar una réplica", exact: true });
    await expect(execute).toBeInViewport({ ratio: 1 });
    const initialOverlap = await page.evaluate(() => {
      const footer = document.querySelector<HTMLElement>("#scenario-form .form-footer");
      if (!footer) return ["missing footer"];
      const footerRect = footer.getBoundingClientRect();
      return [...document.querySelectorAll<HTMLElement>("#scenario-form input:enabled, #scenario-form select:enabled, #scenario-form textarea:enabled, #scenario-form button:enabled")]
        .filter((element) => !footer.contains(element) && element.getClientRects().length > 0)
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top < footerRect.bottom && rect.bottom > footerRect.top
            && rect.left < footerRect.right && rect.right > footerRect.left;
        })
        .map((element) => element.id || element.textContent?.trim() || element.tagName);
    });
    expect(initialOverlap).toEqual([]);

    await page.locator("details[data-advanced-options] > summary").click();
    await page.locator("#root-seed").focus();
    await expect(page.locator("#root-seed")).toBeInViewport({ ratio: 1 });
    const focusedControlClearance = await page.evaluate(() => {
      const footer = document.querySelector<HTMLElement>("#scenario-form .form-footer");
      const focused = document.activeElement;
      if (!footer || !(focused instanceof HTMLElement)) return false;
      const footerRect = footer.getBoundingClientRect();
      const fieldRect = focused.getBoundingClientRect();
      return fieldRect.bottom <= footerRect.top || fieldRect.top >= footerRect.bottom;
    });
    expect(focusedControlClearance).toBe(true);
  });
}

test("a required advanced field is revealed and focused before validation", async ({ page }) => {
  let runRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/v1/runs")) runRequests += 1;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();

  const advanced = page.locator("details[data-advanced-options]");
  const summary = advanced.locator("summary");
  await expect(advanced).toHaveJSProperty("open", false);
  await summary.click();
  await page.locator("#root-seed").fill("");
  await summary.click();
  await expect(advanced).toHaveJSProperty("open", false);

  await page.getByRole("button", { name: "Ejecutar una réplica", exact: true }).click();
  await expect(advanced).toHaveJSProperty("open", true);
  await expect(page.locator("#root-seed")).toBeFocused();
  expect(runRequests).toBe(0);
});

test("the selected tab panel stays inside one main landmark across views", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main).toHaveCount(1);
  await expect(main.locator("#view-root")).toHaveAttribute("role", "tabpanel");
  await expect(main.locator("#view-root")).toBeVisible();

  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("main").locator("#scenario-form")).toBeVisible();
  await expect(page.locator("#view-root")).toHaveAttribute("role", "tabpanel");
});
