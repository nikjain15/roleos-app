import { test, expect, hasSecrets } from "./fixtures";
import { THREAD_STORAGE_KEY } from "@/lib/explore-thread";

/**
 * Slice W6 — anon Explore conversation persists across page loads. Model-free:
 * the thread is injected/asserted via localStorage; /explore renders it. (Runs
 * in the live config because /explore needs service-role SSR — absent in CI.)
 */
const THREAD = JSON.stringify([
  {
    q: "Which of these teams ship agentic tools?",
    a: "From what RO has read, these stand out…",
    cited: [],
    followups: ["What do they pay?"],
  },
]);

test.describe("anon explore thread persistence (W6)", () => {
  test.skip(!hasSecrets, "needs service-role SSR for /explore — skipped in CI");

  test("a stored thread renders after a fresh page load, and survives navigation", async ({ browser }) => {
    const context = await browser.newContext(); // anon — no auth cookie
    await context.addInitScript(
      ([k, v]) => window.localStorage.setItem(k, v),
      [THREAD_STORAGE_KEY, THREAD] as const,
    );
    const page = await context.newPage();
    await page.goto("/explore");

    await expect(page.getByText("Which of these teams ship agentic tools?")).toBeVisible();
    await expect(page.getByText("saved in this browser only")).toBeVisible();
    await expect(page.getByRole("button", { name: "What do they pay?" })).toBeVisible(); // follow-up chip restored

    // Navigating to another explore surface keeps the thread.
    await page.goto("/explore/companies");
    await expect(page.getByText("Which of these teams ship agentic tools?")).toBeVisible();
    await context.close();
  });

  test("clear conversation wipes the thread and the storage", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(
      ([k, v]) => window.localStorage.setItem(k, v),
      [THREAD_STORAGE_KEY, THREAD] as const,
    );
    const page = await context.newPage();
    await page.goto("/explore");
    await page.getByRole("button", { name: "clear conversation" }).click();
    await expect(page.getByText("Which of these teams ship agentic tools?")).toHaveCount(0);
    const stored = await page.evaluate((k) => window.localStorage.getItem(k), THREAD_STORAGE_KEY);
    expect(stored).toBeNull();

    // And a reload stays clean.
    await page.reload();
    await expect(page.getByText("Which of these teams ship agentic tools?")).toHaveCount(0);
    await context.close();
  });

  test("corrupted storage never crashes the page", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addInitScript(
      ([k, v]) => window.localStorage.setItem(k, v),
      [THREAD_STORAGE_KEY, 'garbage {{{ not json'] as const,
    );
    const page = await context.newPage();
    await page.goto("/explore");
    await expect(page.getByText(/Ask RO/).first()).toBeVisible(); // page intact, fresh state
    await context.close();
  });
});
