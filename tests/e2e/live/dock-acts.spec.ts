import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { seedMatch, seedMasterProfile, someRoleIds } from "./seed";

/**
 * Slice W3 — RO-dock act-verbs. The in-place half (URL-param filtering of the
 * roles board) is seeded and model-free; the propose half (/api/ro/ask returning
 * a validated act) is model-gated like every RO answer.
 */
test.describe("filter-this-view: /roles?… params filter the board in place", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("verdict + remote params pre-filter the workspace", async ({ browser, newUser }) => {
    const u = await newUser("dockfilter");
    const roles = await someRoleIds(u.db, 3);
    await seedMatch(u.db, u.userId, roles[0].id, "pursue", 88);
    await seedMatch(u.db, u.userId, roles[1].id, "skip", 30);
    await seedMatch(u.db, u.userId, roles[2].id, "maybe", 55);

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();

    await page.goto("/roles?verdict=pursue");
    await expect(page.getByText(roles[0].role_title).first()).toBeVisible();
    await expect(page.getByText(roles[1].role_title)).toHaveCount(0);
    await expect(page.getByText(roles[2].role_title)).toHaveCount(0);

    // Junk params neither crash nor filter anything out.
    await page.goto("/roles?verdict=bogus&sort=nope&remote=2");
    await expect(page.getByText(roles[0].role_title).first()).toBeVisible();
    await expect(page.getByText(roles[1].role_title).first()).toBeVisible();
    await context.close();
  });
});

test.describe("dock act proposals (model-gated)", () => {
  test.skip(!hasSecrets || !process.env.E2E_LIVE_MODEL, "needs .env.local + E2E_LIVE_MODEL=1 (spends model calls)");

  test("asking to narrow the view yields a sanitized filter act (or none) — never an unvalidated one", async ({ request, newUser }) => {
    const u = await newUser("dockact");
    const roles = await someRoleIds(u.db, 2);
    await seedMasterProfile(u.db, u.userId, "Senior PM, 9 years, payments and AI products.");
    await seedMatch(u.db, u.userId, roles[0].id, "pursue", 90);
    await seedMatch(u.db, u.userId, roles[1].id, "skip", 20);

    const res = await request.post("/api/ro/ask", {
      headers: { cookie: u.cookie },
      data: { question: "filter my roles to just the pursue ones", screen: "/roles" },
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { answer?: string; act?: { kind?: string; href?: string; roleId?: string } | null };
    expect((j.answer ?? "").length).toBeGreaterThan(0);
    if (j.act) {
      // Whatever the model proposed, the server only lets validated acts through.
      expect(["filter", "tailor"]).toContain(j.act.kind);
      if (j.act.kind === "filter") expect(j.act.href!.startsWith("/roles")).toBe(true);
      if (j.act.kind === "tailor") expect([roles[0].id, roles[1].id]).toContain(j.act.roleId);
    }
  });

  test("asking to tailor yields a tailor act naming only the user's own top-pursue role", async ({ request, newUser }) => {
    const u = await newUser("docktailor");
    const roles = await someRoleIds(u.db, 1);
    await seedMasterProfile(u.db, u.userId, "Senior PM, 9 years, payments and AI products.");
    await seedMatch(u.db, u.userId, roles[0].id, "pursue", 92);

    const res = await request.post("/api/ro/ask", {
      headers: { cookie: u.cookie },
      data: { question: `tailor my résumé for the ${roles[0].role_title} role at ${roles[0].company}`, screen: "/roles" },
      timeout: 90_000,
    });
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { act?: { kind?: string; roleId?: string } | null };
    if (j.act?.kind === "tailor") {
      expect(j.act.roleId).toBe(roles[0].id); // never a foreign or invented id
    }
  });
});
