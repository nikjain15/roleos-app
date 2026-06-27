/**
 * Embed every role into public.role_embeddings via Cloudflare Workers AI.
 * Uses the SAME model as the runtime binding (@cf/baai/bge-base-en-v1.5) so the
 * corpus and query share one vector space (Flag A). Run: `npm run seed:embeddings`.
 *
 * Seeding runs in Node (not a Worker), so it calls Workers AI over the REST API.
 * Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (Workers AI Read),
 *      NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Idempotent: upserts on (role_id, chunk). Re-run safely.
 */
import { createClient } from "@supabase/supabase-js";
import registry from "../../agent/registry.json" assert { type: "json" };

const MODEL = registry.jobs.embed.model; // @cf/baai/bge-base-en-v1.5

// The text we embed per role — the fields that carry matchable meaning.
function embedText(doc: Record<string, any>): string {
  const must = (doc.must_haves ?? []).map((m: any) => m.raw_text_from_jd).filter(Boolean);
  return [
    `${doc.role_title} at ${doc.company}`,
    doc.archetype && `Archetype: ${doc.archetype}`,
    doc.scope?.surface && `Surface: ${doc.scope.surface}`,
    must.length && `Requirements: ${must.join("; ")}`,
    Array.isArray(doc.top_keywords) && `Keywords: ${doc.top_keywords.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

async function embedBatch(account: string, token: string, texts: string[]): Promise<number[][]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texts }),
    },
  );
  if (!res.ok) throw new Error(`Workers AI ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result: { data: number[][] } };
  return json.result.data;
}

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= tries) throw e;
      const backoff = 500 * attempt;
      console.log(`  …transient error, retry ${attempt}/${tries - 1} in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

async function main() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!account || !token) throw new Error("Set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN");
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");

  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: allRoles, error } = await db.from("roles").select("id, doc");
  if (error) throw error;

  // Resumable: skip roles already embedded with this model.
  const done = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await db
      .from("role_embeddings")
      .select("role_id")
      .eq("model", MODEL)
      .range(from, from + 999);
    if (e) throw e;
    data!.forEach((r) => done.add(r.role_id));
    if (!data!.length || data!.length < 1000) break;
  }
  const roles = allRoles!.filter((r) => !done.has(r.id));
  console.log(`${done.size} already embedded; embedding ${roles.length} remaining with ${MODEL}…`);

  const BATCH = 25;
  let n = 0;
  for (let i = 0; i < roles.length; i += BATCH) {
    const slice = roles.slice(i, i + BATCH);
    await withRetry(async () => {
      const vectors = await embedBatch(account, token, slice.map((r) => embedText(r.doc)));
      const rows = slice.map((r, j) => ({
        role_id: r.id,
        chunk: "full",
        model: MODEL,
        embedding: JSON.stringify(vectors[j]),
      }));
      const { error: upErr } = await db
        .from("role_embeddings")
        .upsert(rows, { onConflict: "role_id,chunk" });
      if (upErr) throw new Error(upErr.message);
    });
    n += slice.length;
    console.log(`  ${n}/${roles.length}`);
  }
  console.log("Embeddings done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
