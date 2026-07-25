"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Sign in — no passwords (architecture.md §0 decision 4). Google OAuth + magic
 * link. Voice per ro-voice.html: warm, plain, agency verbs. After auth the user
 * lands on `next` (the feed), where pending onboarding work is saved.
 */
function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") || "/feed";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function magicLink() {
    if (!email.includes("@") || busy) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (error) setErr("That didn't go through on my end — not you. Try again?");
    else setSent(true);
  }

  async function google() {
    setErr(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        // Offline access → Google returns a refresh token we store for Gate 2
        // (reading recruiter mail + calendar later). prompt=consent ensures it.
        scopes:
          "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) setErr("Couldn't reach Google just now. Try the email link instead?");
  }

  async function linkedin() {
    setErr(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "linkedin_oidc",
      options: { redirectTo },
    });
    if (error) setErr("Couldn't reach LinkedIn just now. Try the email link instead?");
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16 sm:py-20">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
        <span className="rounded-md bg-primary px-2 py-0.5 text-[13px] text-white">RO</span>
        RoleOS
      </Link>

      <h1 className="mt-8 text-2xl font-bold tracking-tight">Save your hunt with RO</h1>
      <p className="mt-2 text-tx2">
        No passwords. I&apos;ll keep what we&apos;ve started safe, and pick up right where you left off.
      </p>

      {/* what's waiting — makes signing in feel like continuing, not starting over */}
      <ul className="mt-5 space-y-1.5 text-[13px] text-tx2">
        {["Your matches and the reasons behind them", "Your résumé drafts and exports", "Your goal and where you're on pace"].map((t) => (
          <li key={t} className="flex items-start gap-2">
            <span className="mt-0.5 text-suc">✓</span>
            {t}
          </li>
        ))}
      </ul>

      {sent ? (
        <div className="mt-8 rounded-xl border border-bd bg-surf2 p-5 text-[15px] text-tx">
          Check your inbox — I sent a sign-in link to <b>{email}</b>. It&apos;s yours when you&apos;re ready.
        </div>
      ) : (
        <div className="mt-7 space-y-3">
          <button
            onClick={google}
            className="flex min-h-11 w-full items-center justify-center gap-2.5 rounded-md border border-bd bg-surf px-4 text-sm font-medium text-tx hover:bg-surf2"
          >
            <GoogleIcon /> Continue with Google
          </button>
          <button
            onClick={linkedin}
            className="flex min-h-11 w-full items-center justify-center gap-2.5 rounded-md border border-bd bg-surf px-4 text-sm font-medium text-tx hover:bg-surf2"
          >
            <LinkedInIcon /> Continue with LinkedIn
          </button>
          <div className="flex items-center gap-3 py-1 text-xs text-tx3">
            <span className="h-px flex-1 bg-bd" /> or use email <span className="h-px flex-1 bg-bd" />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && magicLink()}
            aria-label="Your email address"
            placeholder="you@email.com"
            className="min-h-11 w-full rounded-md border border-bd bg-surf px-4 text-[15px] text-tx outline-none focus:border-primary"
          />
          <button
            onClick={magicLink}
            disabled={busy || !email.includes("@")}
            className="min-h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
          <p className="pt-1 text-center text-[11px] text-tx3">
            No passwords · your data stays yours · nothing goes out without your click
          </p>
        </div>
      )}

      {err && <p className="mt-4 text-sm text-dng">{err}</p>}
      {params.get("error") && (
        <p className="mt-4 text-sm text-dng">That sign-in didn&apos;t complete. Let&apos;s try again.</p>
      )}
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.02-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95L3.98 7.28C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.75v20.5C0 23.2.8 24 1.77 24h20.45c.98 0 1.78-.8 1.78-1.75V1.75C24 .78 23.2 0 22.22 0z" />
    </svg>
  );
}

export default function Login() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
