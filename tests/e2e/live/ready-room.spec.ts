import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { admin, seedApplication, seedArtifact, seedGoal, seedMatch, someRoleIds } from "./seed";

/**
 * X10 — the ready-room. Server-rendered states are asserted request-level;
 * the decision flows (approve→apply handoff, keyboard skip) drive the real UI.
 * No model calls anywhere — the room reviews, it never generates.
 */

test.describe("ready-room (X10)", () => {
  test.skip(!hasSecrets, "needs .env.local secrets");

  test("empty queue → honest state with a way forward, never a dead end", async ({ request, newUser }) => {
    const u = await newUser("rr-empty");
    const res = await request.get("/ready-room", { headers: { cookie: u.cookie } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("Nothing queued right now");
    expect(html).toContain("overnight hunt");
    expect(html).toContain("/tracker");
  });

  test("a clean queued draft renders with summary, why, and Approve; FIFO order", async ({ request, newUser }) => {
    const u = await newUser("rr-cards");
    const roles = await someRoleIds(u.db, 2);
    const gid = await seedGoal(u.db, u.userId, {});
    // Older first-in card + a newer one — the OLDER company must render first.
    const artOld = await seedArtifact(u.db, u.userId, roles[0].id, { status: "draft", summary: "OLD-CARD-SUMMARY" });
    await seedApplication(u.db, u.userId, roles[0].id, gid, "ready", [artOld]);
    await new Promise((r) => setTimeout(r, 1_100)); // created_at tiebreak
    const artNew = await seedArtifact(u.db, u.userId, roles[1].id, { status: "draft", summary: "NEW-CARD-SUMMARY" });
    await seedApplication(u.db, u.userId, roles[1].id, gid, "ready", [artNew]);
    await seedMatch(u.db, u.userId, roles[0].id, "pursue", 82);

    const res = await request.get("/ready-room", { headers: { cookie: u.cookie } });
    const html = await res.text();
    expect(html).toContain("OLD-CARD-SUMMARY"); // first card is the oldest
    // (Both cards ride the RSC payload by design — one-at-a-time RENDERING is
    // proven visually in the flow test below.)
    expect(html).toMatch(/1(<!-- -->)? of (<!-- -->)?2/);
    expect(html).toContain("Approve &amp; apply");
  });

  test("a flagged draft shows its truth flags and offers NO one-click approve", async ({ request, newUser }) => {
    const u = await newUser("rr-flagged");
    const roles = await someRoleIds(u.db, 1);
    const art = await seedArtifact(u.db, u.userId, roles[0].id, {
      status: "needs_your_eyes",
      violations: ["claims a metric the profile does not contain"],
    });
    // Mark it as the hunt's output so the drafting row joins the room.
    await admin()
      .from("artifacts")
      .update({
        provenance: {
          gate_status: "needs_your_eyes",
          truth: { ok: false, violations: ["claims a metric the profile does not contain"] },
          source: "overnight_hunt",
        },
      })
      .eq("id", art);
    await seedApplication(u.db, u.userId, roles[0].id, null, "drafting", [art]);

    const res = await request.get("/ready-room", { headers: { cookie: u.cookie } });
    const html = await res.text();
    expect(html).toContain("claims a metric the profile does not contain");
    expect(html).toContain("review it in the editor first");
    expect(html).not.toContain("Approve &amp; apply");
    expect(html).toContain("Needs work");
  });

  test("approve hands off to the existing Apply page; keyboard S skips and withdraws", async ({ browser, newUser }) => {
    const u = await newUser("rr-flow");
    const roles = await someRoleIds(u.db, 2);
    const art1 = await seedArtifact(u.db, u.userId, roles[0].id, { status: "draft", summary: "FLOW-CARD-ONE" });
    await seedApplication(u.db, u.userId, roles[0].id, null, "ready", [art1]);
    await new Promise((r) => setTimeout(r, 1_100));
    const art2 = await seedArtifact(u.db, u.userId, roles[1].id, { status: "draft", summary: "FLOW-CARD-TWO" });
    await seedApplication(u.db, u.userId, roles[1].id, null, "ready", [art2]);

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();
    await page.goto("/ready-room");
    await expect(page.getByText("FLOW-CARD-ONE")).toBeVisible();

    // Keyboard-first: S skips card one → application withdrawn, card two up.
    await expect(async () => {
      await page.keyboard.press("s");
      await expect(page.getByText("FLOW-CARD-TWO")).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });
    const { data: skipped } = await admin()
      .from("applications")
      .select("stage")
      .eq("user_id", u.userId)
      .eq("role_id", roles[0].id)
      .single();
    expect(skipped!.stage).toBe("withdrawn");

    // Approve card two → artifact approved → the human-gated Apply page.
    await page.getByRole("button", { name: /Approve & apply/ }).click();
    await page.waitForURL(`**/apply/${art2}`, { timeout: 30_000 });
    const { data: approved } = await admin().from("artifacts").select("status").eq("id", art2).single();
    expect(approved!.status).toBe("approved");
    await expect(page.getByText(/apply · you send/)).toBeVisible();
    await context.close();
  });

  test("RLS: user B's ready-room never shows user A's queue", async ({ request, newUser }) => {
    const a = await newUser("rr-a");
    const b = await newUser("rr-b");
    const roles = await someRoleIds(a.db, 1);
    const art = await seedArtifact(a.db, a.userId, roles[0].id, { status: "draft", summary: "A-PRIVATE-QUEUE-CARD" });
    await seedApplication(a.db, a.userId, roles[0].id, null, "ready", [art]);

    const res = await request.get("/ready-room", { headers: { cookie: b.cookie } });
    const html = await res.text();
    expect(html).not.toContain("A-PRIVATE-QUEUE-CARD");
    expect(html).toContain("Nothing queued right now");
  });
});
