import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4510",
    channel: "chrome",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && tsx scripts/e2e-server.ts",
    url: "http://127.0.0.1:4510/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
