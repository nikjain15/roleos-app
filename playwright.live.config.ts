import { defineConfig, devices } from "@playwright/test";

/**
 * LIVE E2E config (local/preview only) — seeded-session flows against real Supabase
 * (+ optional real models). Separate from the fast public smoke (`playwright.config.ts`,
 * which ignores `live/`). Run with `npm run test:e2e:live` where `.env.local` has
 * real credentials; it self-skips when secrets are absent. Single worker + project
 * to keep throwaway-user churn minimal.
 */
const baseURL = process.env.PW_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e/live",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: { baseURL, trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [{ name: "live", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: process.env.PW_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://127.0.0.1:3000", reuseExistingServer: true, timeout: 120_000 },
});
