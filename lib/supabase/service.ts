import { createClient } from "@supabase/supabase-js";

/**
 * SERVICE-ROLE client — bypasses RLS. Use ONLY for:
 *   • seed / ingestion (roles + embeddings)
 *   • admin server routes that have ALREADY re-checked role === 'admin'
 *   • writing agent_runs (no user write path exists for that table)
 *
 * NEVER import this into a client component or expose the key to the browser.
 * The CI "no secrets in client bundle" check guards against that.
 */
export function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service-role env not set");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
