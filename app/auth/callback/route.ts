import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseService } from "@/lib/supabase/service";

/**
 * OAuth + magic-link callback. Supabase redirects here with a `code`; we
 * exchange it for a session (cookies set via the SSR client), then send the
 * user on to `next` (default the feed). The profiles row is auto-created by the
 * on_auth_user_created trigger (db/migrations/0003).
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/feed";

  if (code) {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Gate 2: if Google returned a refresh token (offline access + Gmail/Calendar
      // scopes), store it (service-role-only) so RO can read mail/calendar later.
      const refresh = data.session?.provider_refresh_token;
      if (refresh && data.user) {
        try {
          await supabaseService()
            .from("google_tokens")
            .upsert(
              { user_id: data.user.id, refresh_token: refresh, updated_at: new Date().toISOString() },
              { onConflict: "user_id" },
            );
        } catch {
          /* non-fatal — sign-in still succeeds; Gate 2 just won't have a token */
        }
      }
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
