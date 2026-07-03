import { defineConfig, devices } from "@playwright/test";

/**
 * E2E + a11y harness for the audit loop (docs/AUDIT-DIMENSIONS.md).
 * Drives D2 (happy path), D3 (edge/negative), D5 (responsive: 375/768/1280),
 * and D7 (a11y via @axe-core/playwright). Runs against `next dev` on 3000.
 *
 * Boots its own dev server unless PW_BASE_URL points at an already-running one
 * (CI / preview). Specs must degrade honestly if the server needs secrets it
 * doesn't have — see tests/e2e/smoke.spec.ts.
 */
const baseURL = process.env.PW_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false, // sequential — the repo corrupts under concurrent dev/build load
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // The three breakpoints every screen must survive (D5).
  projects: [
    { name: "mobile-375", use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } } },
    { name: "tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  // Only self-start a server when not pointed at an external one.
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
