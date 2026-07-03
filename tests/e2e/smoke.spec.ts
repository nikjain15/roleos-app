import { test, expect } from "@playwright/test";
import { expectNoSeriousA11y } from "./helpers/axe";

/**
 * Baseline harness proof for Slice T: the app boots, a public page renders, and
 * the three audit gates it must feed all fire — responsive (D5), a11y (D7), and
 * "honest, no crash" (D3). Later slices add persona/edge specs beside this one.
 *
 * Targets `/` (public landing) so it needs no Supabase/Anthropic secrets. If the
 * server can't serve it, the harness fails loudly here rather than silently
 * passing an empty suite.
 */
const PUBLIC_PAGES = ["/", "/login"];

for (const path of PUBLIC_PAGES) {
  test(`public page ${path} renders without crashing`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res, `no response for ${path}`).not.toBeNull();
    // A 5xx means the route threw — an honest empty state would still be 2xx/3xx/4xx.
    expect(res!.status(), `server error on ${path}`).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  });

  test(`public page ${path} has no horizontal overflow (D5)`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      // 1px tolerance for sub-pixel rounding.
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow, "body horizontal scroll").toBeLessThanOrEqual(1);
  });

  test(`public page ${path} passes a11y (D7)`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expectNoSeriousA11y(page, path);
  });
}
