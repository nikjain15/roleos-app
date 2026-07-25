import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { hasGoogleConnected } from "@/lib/google-auth";
import ReplyDeskClient from "@/components/ReplyDeskClient";

/**
 * X9 — the reply desk: every recruiter thread waiting on you, ranked by urgency,
 * each with a reply you can review. Scheduling rows come with real, conflict-free
 * times. Server component: RLS-scoped, Gate-2 gated. RO drafts; you send — every
 * outbound stays your own click through your mail client.
 */
export const dynamic = "force-dynamic";

export default async function ReplyDesk() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/reply-desk");

  const connected = await hasGoogleConnected(user.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx2">
          ← back to your feed
        </Link>
        <span className="font-mono text-xs text-tx3">reply desk · you send</span>
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Threads waiting on you</h1>
      <p className="mt-2 max-w-xl text-[15px] text-tx2">
        The live threads where the ball&apos;s in your court — most urgent first. I&apos;ve got a
        reply ready for each; scheduling ones already have times that don&apos;t clash with your
        calendar. You send them yourself, from your own inbox.
      </p>

      <div className="mt-6">
        {connected ? (
          <ReplyDeskClient />
        ) : (
          <section className="rounded-lg border border-bd bg-bg2 p-5">
            <h2 className="text-base font-semibold">Connect Gmail to turn the desk on</h2>
            <p className="mt-2 text-[15px] text-tx2">
              The reply desk reads your recruiter threads (read-only) so I can spot what&apos;s
              waiting and draft it for you. Nothing is ever sent — I draft, you send. Connect your
              Google account and I&apos;ll have your desk ready in a moment.
            </p>
            <Link
              href="/settings"
              className="mt-3 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white"
            >
              Connect Gmail →
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
