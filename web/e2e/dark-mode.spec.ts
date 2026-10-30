import { expect, test } from "@playwright/test";

test("follows the system theme and the keyboard toggle can return to it", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  const toggle = page.getByRole("button", { name: "Modo oscuro", exact: true });
  const colorScheme = page.locator('meta[name="color-scheme"]');
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(colorScheme).toHaveAttribute("content", "light dark");
  const darkBackground = await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(darkBackground).not.toBe("rgb(246, 245, 250)");

  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(colorScheme).toHaveAttribute("content", "light");
  const lightBackground = await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(lightBackground).not.toBe(darkBackground);

  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(colorScheme).toHaveAttribute("content", "light dark");
});

test("persists its override through OS changes, theme toggles, and in-app navigation", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Modo oscuro", exact: true });

  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  const preparationMode = page.locator("#dist-preparation-mode");
  await expect(preparationMode).toBeVisible();
  await preparationMode.fill("155");
  await expect(page.locator("#scenario-dirty")).toBeVisible();

  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(preparationMode).toHaveValue("155");
  await expect(page.locator("#scenario-dirty")).toBeVisible();

  await page.getByRole("tab", { name: "Datos observados", exact: true }).click();
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await expect(page.locator("#dist-preparation-mode")).toHaveValue("155");

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByRole("button", { name: "Modo oscuro", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "dark");
});

test("synchronizes the saved scheme with another open tab", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const otherTab = await context.newPage();
  await otherTab.emulateMedia({ colorScheme: "light" });
  await otherTab.goto("/");

  await page.getByRole("button", { name: "Modo oscuro", exact: true }).click();
  await expect(otherTab.getByRole("button", { name: "Modo oscuro", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(otherTab.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "dark");
  await otherTab.close();
});

test("still toggles when browser storage is blocked and fits a narrow mobile screen", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() { throw new DOMException("Storage is blocked", "SecurityError"); },
    });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  const toggle = page.getByRole("button", { name: "Modo oscuro", exact: true });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
