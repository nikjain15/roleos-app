import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
