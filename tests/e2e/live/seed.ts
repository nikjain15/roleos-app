import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { paceOtp, isOtpRateLimit, OTP_WINDOW_MS } from "./otp-budget";

/**
 * Live E2E harness plumbing (local/preview only). Loads `.env.local`, forges a
 * real Supabase session cookie for a throwaway user, and seeds realistic data so
 * the authed flows + edge/RLS/injection scenarios can be driven against the live
 * app. Everything is created via the service role and torn down (deleteUser
 * cascades all user rows). If secrets are absent (e.g. CI), `hasSecrets` is false
 * and the specs skip — nothing here runs without real credentials.
 */
function loadEnvLocal(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* no .env.local (CI) — hasSecrets stays false */
  }
}
loadEnvLocal();

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const REF = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "";

/** True only when real credentials are present — the whole live suite gates on this. */
export const hasSecrets = Boolean(SUPABASE_URL && ANON && SERVICE && REF);

export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Cookie header the @supabase/ssr server client accepts (single cookie < 3180 chars). */
function sessionCookie(session: { access_token: string; refresh_token: string }): string {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  const name = `sb-${REF}-auth-token`;
  if (value.length <= 3180) return `${name}=${value}`;
  // Chunked form @supabase/ssr uses for long sessions.
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += 3180) chunks.push(value.slice(i, i + 3180));
  return chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
}

export interface SeededUser {
  userId: string;
  email: string;
  cookie: string; // Cookie header string for authed requests
  db: SupabaseClient; // service-role client for seeding this user's data
  cleanup: () => Promise<void>;
}

/**
 * Create a throwaway confirmed user + a forged session cookie. T2: OTP
 * verification is budget-paced (Supabase allows ~30/5min per IP; the ledger in
 * otp-budget.ts spaces us under it) and retried ONCE after a full window on a
 * rate-limit error — the whole suite runs green as ONE command instead of
 * hand-chunked with cooldowns.
 */
export async function createUser(tag = "e2e"): Promise<SeededUser> {
  const db = admin();
  const email = `${tag}-${Date.now()}-${Math.floor(performance.now())}@roleos.test`;
  const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created.user) throw error ?? new Error("createUser failed");
  const userId = created.user.id;

  const verify = async () => {
    const { data: link } = await db.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = (link?.properties as { hashed_token?: string } | undefined)?.hashed_token;
    if (!tokenHash) throw new Error("no magiclink token");
    const pub = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
    await paceOtp();
    const { data: verified, error: vErr } = await pub.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (vErr || !verified.session) throw vErr ?? new Error("verifyOtp failed");
    return verified.session;
  };

  let session: Awaited<ReturnType<typeof verify>>;
  try {
    session = await verify();
  } catch (err) {
    if (!isOtpRateLimit(err)) throw err;
    // Budget burned outside our ledger (an earlier manual run, another
    // checkout) — wait out one full window, then try once more.
    console.log("[otp-budget] rate-limited despite pacing — waiting out a full window");
    await new Promise((r) => setTimeout(r, OTP_WINDOW_MS + 2_000));
    session = await verify();
  }

  return {
    userId,
    email,
    cookie: sessionCookie(session),
    db,
    cleanup: async () => {
      await db.auth.admin.deleteUser(userId).catch(() => {});
    },
  };
}

/** A few real role ids from the corpus (matches/artifacts need a real role_id). */
export async function someRoleIds(db: SupabaseClient, n = 5): Promise<{ id: string; company: string; role_title: string }[]> {
  const { data } = await db.from("roles").select("id, company, role_title").limit(n);
  return (data ?? []) as { id: string; company: string; role_title: string }[];
}

export async function seedMasterProfile(db: SupabaseClient, userId: string, raw: string) {
  await db.from("master_profile").upsert({ user_id: userId, data: { raw, mirror: null, linkedin_url: null } });
}

export async function seedMatch(
  db: SupabaseClient,
  userId: string,
  roleId: string,
  recommendation: "pursue" | "maybe" | "skip",
  fit = 70,
) {
  await db.from("matches").upsert(
    {
      user_id: userId,
      role_id: roleId,
      fit_score: fit,
      reasoning: { why: `RO's calibrated reason for ${recommendation}.` },
      gaps: ["a real gap to close"],
      recommendation,
      status: "new",
    },
    { onConflict: "user_id,role_id" },
  );
}

export async function seedGoal(
  db: SupabaseClient,
  userId: string,
  goal: { deadline_date?: string | null; deadline_hard?: boolean; intensity?: { apps_per_week_ceiling?: number } },
): Promise<string> {
  const { data } = await db
    .from("goals")
    .insert({
      user_id: userId,
      target: { archetype: "Senior AI Product Manager", seniority: "Senior" },
      deadline_date: goal.deadline_date ?? null,
      deadline_hard: goal.deadline_hard ?? false,
      intensity: goal.intensity ?? { apps_per_week_ceiling: 8 },
      status: "active",
    })
    .select("id")
    .single<{ id: string }>();
  return data!.id;
}

export async function seedArtifact(
  db: SupabaseClient,
  userId: string,
  roleId: string,
  opts: { status?: string; summary?: string; bullets?: { text: string }[]; violations?: string[] } = {},
): Promise<string> {
  const { data } = await db
    .from("artifacts")
    .insert({
      user_id: userId,
      role_id: roleId,
      type: "resume",
      content: {
        summary: opts.summary ?? "Senior PM with a payments and fraud background.",
        bullets: opts.bullets ?? [{ text: "Shipped a billing platform used by millions.", rationale: "impact", evidence: "profile" }],
      },
      provenance: { truth: { ok: !(opts.violations?.length), violations: opts.violations ?? [] } },
      status: opts.status ?? "approved",
    })
    .select("id")
    .single<{ id: string }>();
  return data!.id;
}

/** A drafted cover-letter artifact (slice W2). */
export async function seedCoverArtifact(
  db: SupabaseClient,
  userId: string,
  roleId: string,
  opts: { status?: string; subject?: string; body?: string; violations?: string[] } = {},
): Promise<string> {
  const { data } = await db
    .from("artifacts")
    .insert({
      user_id: userId,
      role_id: roleId,
      type: "cover",
      content: {
        subject: opts.subject ?? "Application — a real drafted subject",
        body:
          opts.body ??
          "Dear team,\n\nA real drafted cover letter grounded in the profile.\n\nBest,\nThe Candidate",
        angle: "payments depth",
        truth_note: "",
      },
      provenance: {
        gate_status: opts.violations?.length ? "needs_your_eyes" : "passed",
        truth: { ok: !(opts.violations?.length), violations: opts.violations ?? [] },
      },
      status: opts.status ?? "approved",
    })
    .select("id")
    .single<{ id: string }>();
  return data!.id;
}

export async function seedApplication(
  db: SupabaseClient,
  userId: string,
  roleId: string,
  goalId: string | null,
  stage: string,
  artifactIds?: string[],
) {
  const now = new Date().toISOString();
  await db.from("applications").insert({
    user_id: userId,
    role_id: roleId,
    goal_id: goalId,
    stage,
    stage_history: [{ stage, at: now }],
    artifact_ids: artifactIds ?? null,
    sent_at: stage === "applied" ? now : null,
  });
}
