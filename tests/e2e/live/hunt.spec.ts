import { readFileSync } from "node:fs";
import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { admin, seedGoal, seedMasterProfile } from "./seed";

/**
 * Overnight autonomous hunt (slice X1). Guard matrix + user control are
 * model-free; the full scoped hunt (re-match → truth-gated drafts → Tracker
 * queue → notification) is model-gated (E2E_LIVE_MODEL=1), same as tailoring.
 * Cron-fired tests are SCOPED to the seeded throwaway user (only_user_id) so a
 * test run never hunts — or spends for — real users. Prompt injection through
 * draft_resume is covered in injection.spec.ts (identical skill + gate path).
 */

/** The dev server reads CRON_SECRET from .dev.vars — read the same file here. */
function cronSecret(): string {
  try {
    const m = readFileSync(".dev.vars", "utf8").match(/^CRON_SECRET=(.*)$/m);
    return (m?.[1] ?? "").replace(/^"|"$/g, "").trim();
  } catch {
    return "";
  }
}
const CRON_SECRET = cronSecret();

/** The hunt only visits users who acted recently — give the seeded user a pulse. */
async function seedActivity(userId: string) {
  await admin().from("decision_events").insert({
    user_id: userId,
    kind: "application",
    action: "edit",
    payload: { seeded: true },
    weight: 1,
  });
}

test.describe("overnight hunt — guards and user control", () => {
  test.skip(!hasSecrets, "needs .env.local secrets");

  test("POST /api/cron/hunt → 403 without the cron secret", async ({ request }) => {
    const res = await request.post("/api/cron/hunt");
    expect(res.status()).toBe(403);
  });

  test("PATCH /api/hunt → 401 signed out, 400 on junk", async ({ request, newUser }) => {
    expect((await request.patch("/api/hunt", { data: { paused: true } })).status()).toBe(401);
    const u = await newUser("hunt-junk");
    const bad = await request.patch("/api/hunt", {
      headers: { cookie: u.cookie },
      data: { paused: "yes-please" },
    });
    expect(bad.status()).toBe(400);
  });

  test("tracker shows the hunt control; pausing persists and survives reload", async ({ browser, newUser }) => {
    const u = await newUser("hunt-toggle");
    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();

    await page.goto("/tracker");
    const region = page.getByRole("region", { name: "Overnight hunt" });
    await expect(region).toBeVisible();
    await expect(region.getByText("· on")).toBeVisible();

    // Re-click if the first click landed before hydration attached the handler.
    const pauseBtn = region.getByRole("button", { name: /Pause overnight hunt/ });
    await expect(async () => {
      if (await pauseBtn.isVisible()) await pauseBtn.click();
      await expect(region.getByText("· paused")).toBeVisible({ timeout: 2_500 });
    }).toPass({ timeout: 30_000 });

    // Persisted where the cron reads it…
    const { data: prof } = await admin().from("profiles").select("ambient").eq("id", u.userId).single();
    expect((prof?.ambient as { hunt_paused?: boolean })?.hunt_paused).toBe(true);

    // …and across a reload, with a way back.
    await page.reload();
    await expect(page.getByRole("region", { name: "Overnight hunt" }).getByText("· paused")).toBeVisible();
    await expect(page.getByRole("button", { name: /Resume overnight hunt/ })).toBeVisible();
    await context.close();
  });

  test("pausing me never touches another user's hunt state (cross-user probe)", async ({ request, newUser }) => {
    const a = await newUser("hunt-a");
    const b = await newUser("hunt-b");
    const res = await request.patch("/api/hunt", { headers: { cookie: b.cookie }, data: { paused: true } });
    expect(res.status()).toBe(200);
    const { data: profA } = await admin().from("profiles").select("ambient").eq("id", a.userId).single();
    expect(Boolean((profA?.ambient as { hunt_paused?: boolean })?.hunt_paused)).toBe(false);
  });
});

test.describe("overnight hunt — scoped cron sweep (model-free paths)", () => {
  test.skip(!hasSecrets || !CRON_SECRET, "needs .env.local + CRON_SECRET in .dev.vars");

  test("malformed body with a valid secret → 400, no work done", async ({ request }) => {
    const res = await request.post("/api/cron/hunt", {
      headers: { "x-cron-secret": CRON_SECRET, "content-type": "application/json" },
      data: { only_user_id: "not-a-uuid" },
    });
    expect(res.status()).toBe(400);
  });

  test("a paused user is skipped entirely", async ({ request, newUser }) => {
    const u = await newUser("hunt-paused");
    await seedGoal(u.db, u.userId, {});
    await seedMasterProfile(u.db, u.userId, "Senior PM, 9 years across payments and AI tooling.");
    await seedActivity(u.userId);
    await admin().from("profiles").update({ ambient: { hunt_paused: true } }).eq("id", u.userId);

    const res = await request.post("/api/cron/hunt", {
      headers: { "x-cron-secret": CRON_SECRET },
      data: { only_user_id: u.userId },
    });
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { hunted: number; drafts: number };
    expect(j.hunted).toBe(0);
    expect(j.drafts).toBe(0);
    const { data: apps } = await admin().from("applications").select("id").eq("user_id", u.userId);
    expect(apps ?? []).toHaveLength(0);
  });

  test("a dormant user (no decisions in 30d) costs nothing and hears nothing", async ({ request, newUser }) => {
    const u = await newUser("hunt-dormant");
    await seedGoal(u.db, u.userId, {});
    await seedMasterProfile(u.db, u.userId, "Senior PM, 9 years across payments and AI tooling.");
    // no seedActivity — the user never acted

    const res = await request.post("/api/cron/hunt", {
      headers: { "x-cron-secret": CRON_SECRET },
      data: { only_user_id: u.userId },
    });
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { hunted: number };
    expect(j.hunted).toBe(0);
    const { data: notifs } = await admin().from("notifications").select("id").eq("user_id", u.userId);
    expect(notifs ?? []).toHaveLength(0);
  });
});

test.describe("overnight hunt — full sweep (model-gated)", () => {
  test.skip(
    !hasSecrets || !CRON_SECRET || !process.env.E2E_LIVE_MODEL,
    "needs .env.local + CRON_SECRET + E2E_LIVE_MODEL=1 (spends model calls)",
  );

  test("an eligible user wakes up to truth-gated drafts queued in the Tracker", async ({ request, newUser }) => {
    test.setTimeout(480_000); // re-match + a fully gated draft is minutes, by design
    const u = await newUser("hunt-full");
    await seedGoal(u.db, u.userId, {});
    await seedMasterProfile(
      u.db,
      u.userId,
      "Senior product manager, 9 years. Led payments and fraud platforms at a fintech; " +
        "shipped LLM-assisted support tooling used by 2M customers; managed 5 PMs; " +
        "deep experience with growth experiments, activation funnels, and ML-driven risk models.",
    );
    await seedActivity(u.userId);

    const res = await request.post("/api/cron/hunt", {
      headers: { "x-cron-secret": CRON_SECRET },
      data: { only_user_id: u.userId, draft_cap: 1 },
      timeout: 450_000,
    });
    expect(res.status()).toBe(200);
    const j = (await res.json()) as { hunted: number; drafts: number };
    expect(j.hunted).toBe(1);
    expect(j.drafts).toBe(1);

    const db = admin();
    // Queued in the Tracker — ready when the gate passed, drafting when flagged —
    // with the résumé artifact linked and a real next step.
    const { data: apps } = await db
      .from("applications")
      .select("stage, artifact_ids, next_action")
      .eq("user_id", u.userId);
    expect((apps ?? []).length).toBe(j.drafts);
    for (const a of apps ?? []) {
      expect(["ready", "drafting"]).toContain(a.stage as string);
      expect((a.artifact_ids as string[] | null)?.length).toBe(1);
      expect((a.next_action as { label?: string } | null)?.label).toBeTruthy();
    }

    // The artifacts carry gate provenance and the hunt's fingerprint. NO send:
    // nothing is 'approved' or 'sent' — the human gate is fully intact.
    const { data: arts } = await db
      .from("artifacts")
      .select("status, provenance")
      .eq("user_id", u.userId)
      .eq("type", "resume");
    expect((arts ?? []).length).toBe(j.drafts);
    for (const a of arts ?? []) {
      expect(["draft", "needs_your_eyes"]).toContain(a.status as string);
      expect((a.provenance as { source?: string })?.source).toBe("overnight_hunt");
    }

    // One calm note (digest-tier by default), and the metered trail exists.
    const { data: notifs } = await db
      .from("notifications")
      .select("kind, tier, title")
      .eq("user_id", u.userId)
      .eq("kind", "draft_ready");
    expect((notifs ?? []).length).toBe(1);
    expect(["digest", "in_feed", "push"]).toContain(notifs![0].tier as string);
    const { data: runs } = await db.from("agent_runs").select("id").eq("user_id", u.userId).limit(1);
    expect((runs ?? []).length).toBeGreaterThan(0);

    // Idempotent: the next sweep inside 20h leaves the user alone.
    const again = await request.post("/api/cron/hunt", {
      headers: { "x-cron-secret": CRON_SECRET },
      data: { only_user_id: u.userId },
    });
    expect(((await again.json()) as { hunted: number }).hunted).toBe(0);
  });
});
