// End-to-end verification of RO conversation memory (M2) against a deployment.
// Forges a session, asks the dock TWO questions in sequence, and asserts (a) the
// thread persisted both turns and (b) the second answer RECALLS what the first said
// — i.e. RO remembers the back-and-forth. Cleans up the test user always.
//
// Usage: BASE_URL=https://ro.roleos.fyi node scripts/verify-ro-thread.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE_URL || "https://ro.roleos.fyi";
if (!URL || !ANON || !SERVICE) throw new Error("Supabase env not set (source .dev.vars)");

const ref = URL.match(/https:\/\/([^.]+)/)[1];
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `ro.thrtest+${Date.now()}@roleos.dev`;
const ok = (b, m) => (console.log(`${b ? "✓" : "✗"} ${m}`), b);
let userId = null;
let pass = true;

try {
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (cErr) throw cErr;
  userId = created.user.id;
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: verified } = await anonClient.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(verified.session)).toString("base64")}`;
  pass = ok(!!verified.session, "forged session for a fresh test user") && pass;

  const ask = async (question) => {
    const res = await fetch(`${BASE}/api/ro/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(60_000),
    });
    return res.json().catch(() => ({}));
  };

  const a1 = await ask("Remember this for our chat: I'm targeting a Staff Product Manager role at Scale AI.");
  pass = ok(typeof a1.answer === "string", "turn 1 answered") && pass;

  const a2 = await ask("Based on what I just told you, what role am I going for?");
  pass = ok(typeof a2.answer === "string", "turn 2 answered") && pass;

  const { data: thread } = await admin
    .from("ro_threads")
    .select("turns, summary")
    .eq("user_id", userId)
    .eq("surface", "dock")
    .maybeSingle();
  pass = ok(Array.isArray(thread?.turns) && thread.turns.length === 2, `thread persisted ${thread?.turns?.length ?? 0} turns`) && pass;

  const recalled = /staff|product manager|\bpm\b|scale/i.test(a2.answer ?? "");
  pass = ok(recalled, `turn 2 RECALLS the role from turn 1: "${(a2.answer ?? "").slice(0, 140)}"`) && pass;
} catch (err) {
  pass = ok(false, `threw: ${err?.message ?? err}`) && pass;
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId).then(() => console.log("· cleaned up test user"), (e) => console.log(`· cleanup failed: ${e?.message}`));
}

console.log(pass ? "\nRO THREAD (M2) E2E: PASS" : "\nRO THREAD (M2) E2E: FAIL");
process.exit(pass ? 0 : 1);
