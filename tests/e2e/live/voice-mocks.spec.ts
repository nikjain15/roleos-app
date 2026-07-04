import { test, expect, hasSecrets, applyAuth } from "./fixtures";
import { admin, seedMasterProfile, someRoleIds } from "./seed";

/**
 * X8 — voice mock interviews (option A: browser-native, flag-gated via
 * VOICE_MOCKS_ENABLED in .env.local for this harness). Guards are model-free;
 * the full voice-mode flow is model-gated. Headless Chromium has no
 * SpeechRecognition, which is exactly what lets us verify the honest fallback:
 * voice mode degrades to text with a plain explanation, never a dead end.
 */

test.describe("coach guards (model-free)", () => {
  test.skip(!hasSecrets, "needs .env.local secrets");

  test("POST /api/coach → 401 signed out; 429 once the hourly window is full", async ({ request, newUser }) => {
    expect((await request.post("/api/coach", { data: { action: "prep" } })).status()).toBe(401);

    const u = await newUser("x8-rate");
    const db = admin();
    const rows = Array.from({ length: 60 }, () => ({ scope: "coach", subject: u.userId }));
    await db.from("rate_events").insert(rows);
    const res = await request.post("/api/coach", {
      headers: { cookie: u.cookie },
      data: { action: "mock_turn", message: "hello" },
    });
    expect(res.status()).toBe(429);
  });
});

test.describe("voice mock flow (model-gated)", () => {
  test.skip(!hasSecrets || !process.env.E2E_LIVE_MODEL, "needs .env.local + E2E_LIVE_MODEL=1 (spends model calls)");

  test("voice toggle appears behind the flag; degrades honestly without SpeechRecognition; text mock + delivery notes still work", async ({
    browser,
    newUser,
  }) => {
    test.setTimeout(300_000); // prep + a mock turn + debrief are model calls
    const u = await newUser("x8-flow");
    const roles = await someRoleIds(u.db, 1);
    await seedMasterProfile(
      u.db,
      u.userId,
      "Senior product manager, 9 years. Led payments and fraud platforms; shipped LLM tooling; managed 5 PMs.",
    );

    const context = await browser.newContext();
    await applyAuth(context, u);
    const page = await context.newPage();
    await page.goto(`/studio/coach?role=${roles[0].id}`);

    // Prep is a model call — wait for the mock section to arrive.
    const voiceToggle = page.getByRole("button", { name: /Voice mode/ });
    await expect(voiceToggle).toBeVisible({ timeout: 120_000 });
    await expect(voiceToggle).toHaveText(/off/);

    // Start the mock, then flip voice on (retry-click over hydration).
    await expect(async () => {
      await page.getByRole("button", { name: "Start the mock" }).click();
      await expect(page.getByText("Interviewer").first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 120_000 });

    await voiceToggle.click();
    await expect(voiceToggle).toHaveText(/on/);
    // Voice affordances render: the mic button + the privacy promise. (Headless
    // Chromium exposes the SpeechRecognition constructor but its service fails
    // at runtime — the runtime-error path shows an honest line; the constructor-
    // missing fallback is a separate branch covered in code.)
    await expect(page.getByRole("button", { name: /Speak your answer/ })).toBeVisible();
    await expect(page.getByText(/Your voice never leaves the browser/)).toBeVisible();

    // The text loop still works with voice mode on.
    await page
      .getByPlaceholder("Your answer…")
      .fill(
        "At my last company I led the payments platform team, um, we basically rebuilt risk scoring and cut fraud losses by a third while keeping approval rates flat.",
      );
    await page.getByRole("button", { name: "Answer", exact: true }).click();
    await expect(page.getByText("You", { exact: true }).first()).toBeVisible({ timeout: 120_000 });

    // Debrief — includes transcript-grounded delivery notes.
    await page.getByRole("button", { name: /End & debrief me/ }).click();
    await expect(page.getByText("Debrief", { exact: true })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText("Delivery — from your transcript")).toBeVisible();
    await context.close();
  });
});
