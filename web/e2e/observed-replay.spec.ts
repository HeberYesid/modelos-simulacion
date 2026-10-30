import { expect, test, type Page } from "@playwright/test";

async function seek(page: Page, seconds: number): Promise<void> {
  await page.locator("#observed-slider").evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, seconds);
}

test("measured visits replay their recorded timestamps without running a simulation", async ({ page }, testInfo) => {
  const runs: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/v1\/(runs|experiments)$/.test(request.url())) runs.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Ver martes 20 de octubre", exact: true }).click();
  await expect(page.locator("#observed-stage")).toHaveAttribute("data-state", "available");
  await expect(page.locator("#observed-readout")).toContainText("16:45:35");
  await expect(page.locator("#observed-record").locator("option")).toHaveCount(119);
  await seek(page, 875);
  await expect(page.locator("#observed-readout")).toContainText("17:00:10");
  await expect(page.locator("#observed-summary")).toContainText("6 intervalos de preparación");
  await page.screenshot({ path: testInfo.outputPath("tuesday-recorded.png"), fullPage: true });
  await seek(page, 6955);
  await expect(page.locator("#observed-readout")).toContainText("18:41:30");
  await expect(page.locator("#observed-last-event")).toContainText("18:41:30");
  await page.getByRole("button", { name: "Ver viernes 23 de octubre", exact: true }).click();
  await expect(page.locator("#observed-record").locator("option")).toHaveCount(16);
  await page.locator("#observed-record").selectOption({ label: "Caja · 1" });
  await expect(page.locator("#observed-detail")).toContainText("Pedido 1");
  await expect(page.locator("#observed-detail")).toContainText("17:20:23");
  await expect(page.locator("#observed-detail")).toContainText("No registrado");
  await expect(page.locator("#observed-record-state")).toContainText("Espera registrada en caja");
  await page.locator("#observed-detail").getByRole("button", { name: "17:20:44", exact: true }).click();
  await expect(page.locator("#observed-slider")).toHaveValue("21");
  await expect(page.locator("#observed-record-state")).toContainText("Dentro del intervalo registrado de caja");
  await seek(page, 49);
  await expect(page.locator("#observed-readout")).toContainText("17:21:12");
  await page.screenshot({ path: testInfo.outputPath("friday-recorded.png"), fullPage: true });
  await page.getByRole("button", { name: "Reproducir datos medidos", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pausar datos medidos", exact: true })).toBeVisible();
  await expect.poll(async () => Number(await page.locator("#observed-slider").inputValue())).toBeGreaterThan(49);
  await page.getByRole("button", { name: "Pausar datos medidos", exact: true }).click();
  await seek(page, 49);
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await page.getByRole("tab", { name: "Datos observados", exact: true }).click();
  await expect(page.locator("#observed-slider")).toHaveValue("49");
  await expect(page.getByRole("button", { name: "Reproducir datos medidos", exact: true })).toBeVisible();
  expect(runs).toEqual([]);
});

test("measured replay retains its timestamp and inspector through context loss and retry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ver viernes 23 de octubre", exact: true }).click();
  await expect(page.locator("#observed-stage")).toHaveAttribute("data-state", "available");
  await seek(page, 49);
  const lost = await page.locator("#observed-stage canvas").evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext("webgl2");
    const extension = context?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(lost).toBe(true);
  await expect(page.locator("#observed-stage")).toHaveAttribute("data-state", "unavailable");
  await seek(page, 3646);
  await expect(page.locator("#observed-readout")).toContainText("18:21:09");
  await page.getByRole("button", { name: "Reintentar vista 3D de datos medidos", exact: true }).click();
  await expect(page.locator("#observed-stage")).toHaveAttribute("data-state", "available");
  await expect(page.locator("#observed-stage canvas")).toHaveCount(1);
  await expect(page.locator("#observed-slider")).toHaveValue("3646");
});

test("recorded playback survives missing graphics and fits a mobile screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === "webgl2" || type === "webgl") return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Ver viernes 23 de octubre", exact: true }).click();
  await expect(page.locator("#observed-stage")).toHaveAttribute("data-state", "unavailable");
  await seek(page, 3646);
  await expect(page.locator("#observed-readout")).toContainText("18:21:09");
  await expect(page.locator("#observed-last-event")).toContainText("18:21:09");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("observed-mobile-fallback.png"), fullPage: true });
});
