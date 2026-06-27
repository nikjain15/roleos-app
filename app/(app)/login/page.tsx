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
      options: { redirectTo },
    });
    if (error) setErr("Couldn't reach Google just now. Try the email link instead?");
  }

  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
        <span className="rounded-md bg-info px-2 py-0.5 text-[13px] text-white">RO</span>
        RoleOS
      </Link>

      <h1 className="mt-8 text-2xl font-bold tracking-tight">Save your hunt with RO</h1>
      <p className="mt-2 text-tx2">
        No passwords. I&apos;ll keep what we&apos;ve started safe, and pick up where you left off.
      </p>

      {sent ? (
        <div className="mt-8 rounded-xl border border-bd bg-surf2 p-5 text-[15px] text-tx">
          Check your inbox — I sent a sign-in link to <b>{email}</b>. It&apos;s yours when you&apos;re ready.
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          <button
            onClick={google}
            className="w-full rounded-md border border-bd bg-surf px-4 py-2.5 text-sm font-medium text-tx"
          >
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-xs text-tx3">
            <span className="h-px flex-1 bg-bd" /> or <span className="h-px flex-1 bg-bd" />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && magicLink()}
            placeholder="you@email.com"
            className="w-full rounded-md border border-bd bg-surf px-4 py-2.5 text-[15px] text-tx outline-none focus:border-info"
          />
          <button
            onClick={magicLink}
            disabled={busy || !email.includes("@")}
            className="w-full rounded-md bg-info px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </div>
      )}

      {err && <p className="mt-4 text-sm text-dng">{err}</p>}
      {params.get("error") && (
        <p className="mt-4 text-sm text-dng">That sign-in didn&apos;t complete. Let&apos;s try again.</p>
      )}
    </main>
  );
}

export default function Login() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
