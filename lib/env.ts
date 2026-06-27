import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Typed access to Cloudflare bindings + server secrets. NEVER import this into
 * a client component — everything here is server-only.
 *
 * Bindings (wrangler.jsonc): AI (Workers AI), BUILD_STUDIO + AMBIENT (DOs).
 * Secrets (.dev.vars / wrangler secret): ANTHROPIC_API_KEY, SUPABASE_*.
 */
export interface RoleOSEnv {
  // Workers AI binding — embeddings (bge) in dev and prod.
  AI: { run: (model: string, input: unknown) => Promise<unknown> };
  // Durable Objects
  BUILD_STUDIO: DurableObjectNamespace;
  AMBIENT: DurableObjectNamespace;
  // Secrets
  ANTHROPIC_API_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // Public (safe) — also available as NEXT_PUBLIC_* at build for the client.
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
}

// Minimal DO namespace shape so we don't depend on @cloudflare/workers-types here.
export interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): unknown;
}

export function env(): RoleOSEnv {
  return getCloudflareContext().env as unknown as RoleOSEnv;
}
