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
  /** Base URL of the standalone build sandbox worker (gate 3 prototype canvas).
   *  Optional — unset means the studio runs in graceful offline mode (code only,
   *  no live preview). e.g. http://localhost:8788 in dev (wrangler dev). */
  SANDBOX_URL?: string;
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
  // In the Worker / OpenNext dev runtime, bindings + secrets come from the
  // Cloudflare context. Outside it (plain Node: seed + test scripts), fall back
  // to process.env so secrets resolve there too. The AI/DO *bindings* are only
  // present in the Worker context; the embeddings provider has a REST fallback.
  try {
    const cf = getCloudflareContext().env as unknown as Partial<RoleOSEnv>;
    return new Proxy({} as RoleOSEnv, {
      get(_t, key: string) {
        const v = (cf as Record<string, unknown>)[key];
        return v !== undefined ? v : process.env[key];
      },
    });
  } catch {
    return process.env as unknown as RoleOSEnv;
  }
}
