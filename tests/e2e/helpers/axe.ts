import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * D7 a11y gate: run axe against the current page and assert zero *serious* or
 * *critical* violations (the pass bar in AUDIT-DIMENSIONS). Returns the full
 * result so callers can log or inspect lesser (moderate/minor) findings.
 *
 * Scoped to WCAG 2.1 A/AA tags — the standard every RoleOS screen targets.
 */
export async function expectNoSeriousA11y(page: Page, context = "page") {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

  if (blocking.length) {
    const summary = blocking
      .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(`axe violations on ${context}:\n${summary}`);
  }
  expect(blocking, `serious/critical a11y violations on ${context}`).toEqual([]);
  return results;
}
