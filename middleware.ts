import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request (the SSR pattern) and gates
 * the private areas. Public: /, /onboarding, /login, /auth/*. Private: /feed,
 * /studio, /admin → redirect to /login when signed out. Admin role is RE-checked
 * server-side in admin routes (RLS + server check, never UI alone) — this is
 * just the convenience redirect.
 */
const PRIVATE = ["/feed", "/studio", "/admin", "/settings"];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  if (!user && PRIVATE.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  // Run on everything except static assets + the auth callback.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|auth/callback).*)"],
};
