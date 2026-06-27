"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client for client components (login, sign-out). Uses the
 * anon key — RLS protects everything; this client only ever sees the signed-in
 * user's own rows. Never the service-role key.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
