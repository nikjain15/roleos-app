import { test, expect, hasSecrets, applyAuth } from "./fixtures";

/**
 * Slice W7 — goal switching (multi-goal-lite), live. save_as_new parks the
 * current active goal; PATCH activate swaps which goal is active (one-active
 * invariant holds) and recomputes the plan; archive tidies. Model-free.
 */
test.describe("goal switching (W7)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("save_as_new parks the active goal; activate swaps back; one active always", async ({ request, newUser }) => {
    const u = await newUser("w7-switch");
    const H = { cookie: u.cookie };

    // Goal A.
    const a = await request.post("/api/goal", {
      headers: H,
      data: { target: { archetype: "AI Product Manager", seniority: "Senior" }, deadline_date: "2026-10-01" },
    });
    expect(a.status()).toBe(200);

    // Goal B as NEW (A becomes a paused alternate).
    const b = await request.post("/api/goal", {
      headers: H,
      data: { target: { archetype: "Chief of Staff" }, save_as_new: true, also_open_to: { text: "BizOps" } },
    });
    expect(b.status()).toBe(200);

    const { data: goals } = await u.db.from("goals").select("id, status, target").eq("user_id", u.userId);
    expect(goals).toHaveLength(2);
    const active = goals!.filter((g) => g.status === "active");
    expect(active).toHaveLength(1);
    expect((active[0].target as { archetype: string }).archetype).toBe("Chief of Staff");
    const goalA = goals!.find((g) => (g.target as { archetype: string }).archetype === "AI Product Manager")!;
    expect(goalA.status).toBe("paused");

    // Switch back to A.
    const sw = await request.patch("/api/goal", { headers: H, data: { goalId: goalA.id, action: "activate" } });
    expect(sw.status()).toBe(200);
    const { data: after } = await u.db.from("goals").select("id, status, plan").eq("user_id", u.userId);
    expect(after!.filter((g) => g.status === "active")).toHaveLength(1);
    const activeA = after!.find((g) => g.id === goalA.id)!;
    expect(activeA.status).toBe("active");
    expect(activeA.plan).not.toBeNull(); // plan recomputed on activation

    // Archive B.
    const goalB = after!.find((g) => g.id !== goalA.id)!;
    const arch = await request.patch("/api/goal", { headers: H, data: { goalId: goalB.id, action: "archive" } });
    expect(arch.status()).toBe(200);
    const { data: final } = await u.db.from("goals").select("id, status").eq("id", goalB.id).single();
    expect(final!.status).toBe("archived");
  });

  test("goal page lists alternates and switches on click", async ({ browser, request, newUser }) => {
    const u = await newUser("w7-ui");
    const H = { cookie: u.cookie };
    await request.post("/api/goal", { headers: H, data: { target: { archetype: "AI Product Manager", seniority: "Senior" } } });
    await request.post("/api/goal", { headers: H, data: { target: { archetype: "Chief of Staff" }, save_as_new: true } });

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();
    await page.goto("/goal");

    await expect(page.getByText("Other goals")).toBeVisible();
    await expect(page.getByText("Senior AI Product Manager", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Switch to this goal" }).click();
    // After the swap the alternate list shows the parked Chief of Staff goal.
    await expect(page.getByText("Chief of Staff")).toBeVisible({ timeout: 20_000 });
    const { data: goals } = await u.db.from("goals").select("status, target").eq("user_id", u.userId);
    const active = goals!.find((g) => g.status === "active")!;
    expect((active.target as { archetype: string }).archetype).toBe("AI Product Manager");
    await context.close();
  });

  test("RLS: user A cannot switch user B's goal", async ({ request, newUser }) => {
    const A = await newUser("w7-rls-a");
    const B = await newUser("w7-rls-b");
    await request.post("/api/goal", { headers: { cookie: B.cookie }, data: { target: { archetype: "PM" } } });
    const { data: bGoal } = await B.db.from("goals").select("id").eq("user_id", B.userId).single();

    const res = await request.patch("/api/goal", {
      headers: { cookie: A.cookie },
      data: { goalId: bGoal!.id, action: "archive" },
    });
    expect(res.status()).toBe(404); // RLS filters B's goal to nothing under A
    const { data: still } = await B.db.from("goals").select("status").eq("id", bGoal!.id).single();
    expect(still!.status).toBe("active");
  });
});
