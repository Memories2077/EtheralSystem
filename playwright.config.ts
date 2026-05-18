import { defineConfig } from "@playwright/test";

const e2eTimeoutMs = Number(process.env.E2E_TEST_TIMEOUT_MS || 900_000);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: e2eTimeoutMs,
  expect: {
    timeout: 30_000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_FRONTEND_URL || "http://localhost:9002",
    trace: "retain-on-failure",
  },
});
