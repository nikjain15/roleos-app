import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { seedMatch, someRoleIds } from "./seed";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./seed";

/**
 * Slice W4 — Roles workspace P1: compare 2–3 side by side · per-role notes
 * (RLS-scoped) · bulk dismiss from a filtered view. All seeded, no model calls.
 */
test.describe("workspace P1 (W4)", () => {
  test.skip(!hasSecrets, "live suite needs .env.local — skipped in CI");

  test("per-role note: save → survives reload → empty save clears it", async ({ browser, newUser }) => {
    const u = await newUser("p1-notes");
    const roles = await someRoleIds(u.db, 1);
    await seedMatch(u.db, u.userId, roles[0].id, "pursue", 80);

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();
    await page.goto("/roles");

    await page.getByRole("button", { name: /notes/ }).first().click();
    await page.getByPlaceholder(/Private to you/).fill("Spoke to Sam — comp band 180-220");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("📝 note")).toBeVisible();

    // Survives reload (RLS-scoped read on the server page).
    await page.reload();
    await expect(page.getByText("📝 note")).toBeVisible();
    const { data: saved } = await u.db.from("role_notes").select("note").eq("user_id", u.userId).single();
    expect(saved!.note).toContain("comp band 180-220");

    // Clearing the note deletes the row.
    await page.getByRole("button", { name: /notes/ }).first().click();
    await page.getByPlaceholder(/Private to you/).fill("");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("📝 note")).toHaveCount(0);
    const { data: gone } = await u.db.from("role_notes").select("id").eq("user_id", u.userId);
    expect(gone ?? []).toEqual([]);
    await context.close();
  });

  test("RLS: user B cannot read user A's notes", async ({ newUser }) => {
    const A = await newUser("p1-rls-a");
    const B = await newUser("p1-rls-b");
    const roles = await someRoleIds(A.db, 1);
    await A.db.from("role_notes").insert({ user_id: A.userId, role_id: roles[0].id, note: "A'S PRIVATE NOTE" });

    const cookieVal = B.cookie.split("=").slice(1).join("=");
    const session = JSON.parse(Buffer.from(cookieVal.replace(/^base64-/, ""), "base64").toString()) as { access_token: string };
    const asB = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      auth: { persistSession: false },
    });
    const { data } = await asB.from("role_notes").select("note");
    expect(data ?? []).toEqual([]);
    const { error } = await asB.from("role_notes").insert({ user_id: A.userId, role_id: roles[0].id, note: "hijack" });
    expect(error).not.toBeNull();
  });

  test("bulk dismiss clears the filtered view only; taste events keep per-role granularity", async ({ browser, newUser }) => {
    const u = await newUser("p1-bulk");
    const roles = await someRoleIds(u.db, 4);
    await seedMatch(u.db, u.userId, roles[0].id, "skip", 20);
    await seedMatch(u.db, u.userId, roles[1].id, "skip", 25);
    await seedMatch(u.db, u.userId, roles[2].id, "skip", 30);
    await seedMatch(u.db, u.userId, roles[3].id, "pursue", 90);

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();
    await page.goto("/roles");

    await page.getByLabel(/^Verdict/).selectOption("skip");
    await expect(page.getByText("3 shown", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Dismiss all 3 shown" }).click();
    const done = page.waitForResponse((r) => r.url().includes("/api/match/curate") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Yes, dismiss them" }).click();
    await expect(page.getByText(/0 shown · 3 dismissed/)).toBeVisible();
    expect((await done).status()).toBe(200);

    // The pursue match is untouched; events are per-role and marked bulk.
    const { data: ms } = await u.db.from("matches").select("role_id, status").eq("user_id", u.userId);
    expect(ms!.filter((m) => m.status === "dismissed")).toHaveLength(3);
    expect(ms!.find((m) => m.role_id === roles[3].id)!.status).toBe("new");
    const { data: evs } = await u.db
      .from("decision_events")
      .select("payload")
      .eq("user_id", u.userId)
      .eq("action", "skip");
    expect(evs!.length).toBe(3);
    expect(evs!.every((e) => (e.payload as { bulk?: boolean }).bulk === true)).toBe(true);
    await context.close();
  });

  test("compare 2 roles side by side shows fit, must-haves, gaps", async ({ browser, newUser }) => {
    const u = await newUser("p1-compare");
    const roles = await someRoleIds(u.db, 2);
    await seedMatch(u.db, u.userId, roles[0].id, "pursue", 88);
    await seedMatch(u.db, u.userId, roles[1].id, "maybe", 60);

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();
    await page.goto("/roles");

    const boxes = page.getByRole("checkbox", { name: "compare" });
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByRole("button", { name: "Compare 2 side by side" }).click();

    await expect(page.getByRole("heading", { name: "Side by side" })).toBeVisible();
    await expect(page.getByText(/fit 88/).last()).toBeVisible();
    await expect(page.getByText(/fit 60/).last()).toBeVisible();
    await expect(page.getByText("Your gaps").first()).toBeVisible(); // seeded gap renders
    await context.close();
  });
});
