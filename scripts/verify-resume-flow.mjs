// End-to-end verification of the résumé flow against a deployment (default: prod).
// Creates a test user with a multi-role master profile, tailors a résumé for a real
// role (POST /api/tailor), asserts the draft is SECTIONED with multiple experience
// blocks (the multi-role fix), then scores it (POST /api/artifact/[id]/score) and
// asserts an honest 0–100 + tier come back. Cleans up the test user always.
//
// Slow: tailoring + scoring are multi-minute model jobs. Usage:
//   ROLE_ID=<uuid> BASE_URL=https://ro.roleos.fyi node scripts/verify-resume-flow.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE_URL || "https://ro.roleos.fyi";
const ROLE_ID = process.env.ROLE_ID;
if (!URL || !ANON || !SERVICE || !ROLE_ID) throw new Error("need Supabase env (source .dev.vars) + ROLE_ID");

const ref = URL.match(/https:\/\/([^.]+)/)[1];
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `ro.restest+${Date.now()}@roleos.dev`;
const ok = (b, m) => (console.log(`${b ? "✓" : "✗"} ${m}`), b);

const RAW = `**SUMMARY**
AI Product Manager & founder. Ex-CredR ($29.5M raised, 150K+ transactions). IIT-Bombay, UVA Darden MBA.

**Director, Product & Program Lead | Fidelity (2023–Present)**
- Lead AI/ML product strategy for a $1.6T platform processing $4.5B daily trades.
- Designed a conversational AI chatbot for advisor support; 42% resolution-time reduction.
- Engineered ML-based advisor segmentation (K-means) over Snowflake data.

**Co-Founder, Product & Growth | CredR (2015–2021)**
- Co-founded India's largest used two-wheeler marketplace; owned roadmap end-to-end.
- Architected an NLP/AI B2C chatbot: preference discovery, lead qualification, geo-matching.
- Pioneered CredR Connect, a B2B AI agent for 1,050+ dealer partners.

**VP, Business Partnerships | EdCast (2013–2015)**
- Scaled a $500M edtech platform across 8 countries (Global 2000, NASSCOM, WEF).`;

const PROFILE = {
  version: 1,
  identity: { name: { value: "RO Tester", source: "user", confidence: 1, at: "" } },
  experience: [
    { title: "Director, Product & Program Lead", company: "Fidelity", highlights: ["Lead AI/ML product strategy for a $1.6T platform", "Designed a conversational AI chatbot; 42% resolution-time cut"], source: "resume", confidence: 1 },
    { title: "Co-Founder", company: "CredR", highlights: ["Co-founded India's largest used two-wheeler marketplace", "Architected an NLP/AI B2C chatbot"], source: "resume", confidence: 1 },
  ],
  skills: [{ canonical: "Conversational AI", source: "resume", confidence: 1 }, { canonical: "ML", source: "resume", confidence: 1 }],
  signals: { domains: ["ai"], strengths: [], seniority: "senior" },
};

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

  await admin.from("master_profile").upsert({ user_id: userId, data: { raw: RAW, profile: PROFILE } });
  pass = ok(true, "seeded a multi-role master profile (Fidelity · CredR · EdCast)") && pass;

  console.log("· tailoring (multi-minute model job)…");
  const tRes = await fetch(`${BASE}/api/tailor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ roleId: ROLE_ID }),
    signal: AbortSignal.timeout(320_000),
  });
  const tBody = await tRes.json().catch(() => ({}));
  pass = ok(tRes.ok && tBody.artifactId, `tailored (HTTP ${tRes.status}, artifact ${tBody.artifactId ?? "none"})`) && pass;

  if (tBody.artifactId) {
    const { data: art } = await admin.from("artifacts").select("content").eq("id", tBody.artifactId).single();
    const exp = art?.content?.experience ?? [];
    pass = ok(Array.isArray(exp) && exp.length >= 2, `draft is SECTIONED — ${exp.length} experience block(s): ${JSON.stringify(exp.map((e) => e.company))}`) && pass;
    const totalLines = exp.reduce((n, e) => n + (e.lines?.length ?? 0), 0);
    pass = ok(totalLines >= 3, `draft has ${totalLines} bullet lines across roles (not thinned to one)`) && pass;

    console.log("· scoring (multi-minute model job)…");
    const sRes = await fetch(`${BASE}/api/artifact/${tBody.artifactId}/score`, {
      method: "POST",
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(320_000),
    });
    const sBody = await sRes.json().catch(() => ({}));
    const sc = sBody.score;
    pass = ok(sRes.ok && sc && typeof sc.score === "number" && sc.score >= 0 && sc.score <= 100, `scored: ${sc?.score}/100 · tier "${sc?.tier?.label}" · lift ${JSON.stringify(sBody.lift)}`) && pass;
    pass = ok(sc?.tier?.label && Array.isArray(sc?.sections), `honest tier + per-section strength (${sc?.sections?.length} sections)`) && pass;
  }
} catch (err) {
  pass = ok(false, `threw: ${err?.message ?? err}`) && pass;
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId).then(() => console.log("· cleaned up test user"), (e) => console.log(`· cleanup failed: ${e?.message}`));
}

console.log(pass ? "\nRÉSUMÉ FLOW E2E: PASS" : "\nRÉSUMÉ FLOW E2E: FAIL");
process.exit(pass ? 0 : 1);
