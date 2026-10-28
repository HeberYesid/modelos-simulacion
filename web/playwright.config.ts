import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(webRoot, "..");
const apiUrl = "http://127.0.0.1:8000/api/v1/health";
const webUrl = "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: webUrl,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm dev --host 127.0.0.1 --port 5173 --strictPort",
      cwd: webRoot,
      url: webUrl,
      reuseExistingServer: true,
      name: "Boquitas web",
    },
    {
      command: "uv run uvicorn boquitas.api:app --host 127.0.0.1 --port 8000",
      cwd: projectRoot,
      url: apiUrl,
      reuseExistingServer: true,
      name: "Boquitas API",
      timeout: 120_000,
    },
  ],
});
