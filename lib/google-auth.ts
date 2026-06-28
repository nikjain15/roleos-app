import { supabaseService } from "@/lib/supabase/service";
import { env } from "@/lib/env";

/**
 * Source a short-lived Google access token for a user (Gate 2). We store only
 * the refresh token (lib captured at /auth/callback, service-role-only table)
 * and exchange it for an access token on demand — so Gmail/Calendar reads work
 * long after sign-in, not just in the first hour. Returns null if the user
 * hasn't connected Google with the readonly scopes yet (the studio handles that
 * gracefully). READ-ONLY scopes; no send.
 */
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const db = supabaseService();
  const { data } = await db
    .from("google_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  const refresh = (data as { refresh_token?: string } | null)?.refresh_token;
  if (!refresh) return null;

  const e = env();
  if (!e.GOOGLE_OAUTH_CLIENT_ID || !e.GOOGLE_OAUTH_CLIENT_SECRET) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: e.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: e.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string };
  return j.access_token ?? null;
}

/** Has the user connected Google with API access (a refresh token on file)? */
export async function hasGoogleConnected(userId: string): Promise<boolean> {
  const db = supabaseService();
  const { data } = await db
    .from("google_tokens")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}
