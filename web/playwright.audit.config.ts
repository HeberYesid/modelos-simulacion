import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(webRoot, "..");

export default defineConfig({
  testDir: "./e2e-audit",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: "list",
  outputDir: resolve(projectRoot, "docs/audit-remediation-2026-10-24/playwright-results"),
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.BOQUITAS_AUDIT_URL ?? "http://127.0.0.1:8011",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
