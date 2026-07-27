// End-to-end verification of RO memory against a target deployment (default: prod).
// Forges a test session (admin.generateLink → verifyOtp, per AGENTS gotchas), seeds
// one real action (a profile-target correction), hits the live /api/ro/ask dock —
// which runs syncMemory (derive → embed → write) then recall — and asserts a note
// was written + is recalled. Cleans up the test user (cascades ro_memory) always.
//
// Usage: BASE_URL=https://ro.roleos.fyi node scripts/verify-ro-memory.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE_URL || "https://ro.roleos.fyi";
if (!URL || !ANON || !SERVICE) throw new Error("Supabase env not set (source .dev.vars)");

const ref = URL.match(/https:\/\/([^.]+)/)[1];
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `ro.memtest+${Date.now()}@roleos.dev`;
const ok = (b, m) => console.log(`${b ? "✓" : "✗"} ${m}`) || b;
let userId = null;
let pass = true;

try {
  // 1. test user + forged session
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (cErr) throw cErr;
  userId = created.user.id;
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (lErr) throw lErr;
  const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: verified, error: vErr } = await anonClient.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });
  if (vErr) throw vErr;
  const session = verified.session;
  pass = ok(!!session?.access_token, "forged an authed session for a fresh test user") && pass;

  // 2. seed one real action: the user corrected their target role
  const { error: eErr } = await admin.from("decision_events").insert({
    user_id: userId,
    kind: "profile",
    action: "correct",
    payload: { field: "target.role", to: "Staff AI PM at Scale (e2e)" },
    weight: 3,
  });
  if (eErr) throw eErr;
  pass = ok(true, "seeded a decision_event (profile-target correction)") && pass;

  // 3. hit the LIVE dock with the forged cookie → runs syncMemory + recall
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;
  const res = await fetch(`${BASE}/api/ro/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ question: "what role am I targeting?" }),
  });
  const body = await res.json().catch(() => ({}));
  pass = ok(res.ok && typeof body.answer === "string", `dock answered (HTTP ${res.status})`) && pass;

  // 4. the notebook was written from that action
  const { data: notes } = await admin.from("ro_memory").select("text, kind, embedding").eq("user_id", userId);
  const noteWritten = (notes ?? []).some((n) => /Staff AI PM/i.test(n.text));
  pass = ok(noteWritten, `a note was derived + written: ${JSON.stringify((notes ?? []).map((n) => n.text))}`) && pass;
  pass = ok((notes ?? []).every((n) => n.embedding), "notes were embedded (for recall)") && pass;

  // 5. the dock's answer reflects what RO remembers (used the recalled note)
  pass = ok(/staff|ai\s*pm|scale/i.test(body.answer ?? ""), `answer reflects the target: "${(body.answer ?? "").slice(0, 120)}"`) && pass;
} catch (err) {
  pass = ok(false, `threw: ${err?.message ?? err}`) && pass;
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId).then(
      () => console.log("· cleaned up test user (cascades ro_memory + decision_events)"),
      (e) => console.log(`· cleanup failed: ${e?.message}`),
    );
  }
}

console.log(pass ? "\nRO MEMORY E2E: PASS" : "\nRO MEMORY E2E: FAIL");
process.exit(pass ? 0 : 1);
