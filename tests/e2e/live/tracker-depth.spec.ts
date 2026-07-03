import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { seedArtifact, seedMatch, someRoleIds } from "./seed";

/**
 * Slice W5 — tracker depth, live: auto next_action on create/advance, the
 * timeline view over the append-only stage_history, per-stage SLA chips, and
 * artifact links on the card. All seeded, zero model calls.
 */
test.describe("tracker depth (W5)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("create + advance auto-derive a real next_action with a due date", async ({ request, newUser }) => {
    const u = await newUser("w5-next");
    const roles = await someRoleIds(u.db, 1);

    const create = await request.post("/api/applications", {
      headers: { cookie: u.cookie },
      data: { role_id: roles[0].id, stage: "saved" },
    });
    expect(create.status()).toBe(200);
    const { data: created } = await u.db.from("applications").select("id, next_action").eq("user_id", u.userId).single();
    expect((created!.next_action as { label: string }).label).toContain("résumé");

    const adv = await request.patch("/api/applications", {
      headers: { cookie: u.cookie },
      data: { id: created!.id, stage: "applied" },
    });
    expect(adv.status()).toBe(200);
    const { data: after } = await u.db.from("applications").select("next_action, sent_at").eq("id", created!.id).single();
    const na = after!.next_action as { label: string; due?: string };
    expect(na.label).toContain("follow-up");
    expect(na.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(after!.sent_at).not.toBeNull();

    // Terminal stage clears the next action honestly.
    await request.patch("/api/applications", { headers: { cookie: u.cookie }, data: { id: created!.id, stage: "rejected" } });
    const { data: closed } = await u.db.from("applications").select("next_action").eq("id", created!.id).single();
    expect(closed!.next_action).toBeNull();
  });

  test("board shows SLA overdue chip, timeline, and the linked résumé", async ({ browser, newUser }) => {
    const u = await newUser("w5-board");
    const roles = await someRoleIds(u.db, 1);
    await seedMatch(u.db, u.userId, roles[0].id, "pursue", 85);
    await seedArtifact(u.db, u.userId, roles[0].id, { status: "approved" });
    // Seed an application that entered 'applied' 10 days ago (SLA 7 → overdue).
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    await u.db.from("applications").insert({
      user_id: u.userId,
      role_id: roles[0].id,
      stage: "applied",
      stage_history: [
        { stage: "saved", at: new Date(Date.now() - 14 * 86_400_000).toISOString() },
        { stage: "applied", at: old },
      ],
      sent_at: old,
    });

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();
    await page.goto("/tracker");

    await expect(page.getByText(/10d in applied — needs a move/)).toBeVisible();
    await expect(page.getByRole("link", { name: /résumé · approved/ })).toBeVisible();

    await page.getByRole("button", { name: "timeline" }).click();
    await expect(page.locator("ol li")).toHaveCount(2);
    await expect(page.locator("ol li").first()).toContainText("Saved");
    await context.close();
  });
});
