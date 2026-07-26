import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Card } from "@/components/ui";

/**
 * Studio — the craft workspace (nav/IA restructure 2026-07-26). One home for the
 * things RO makes WITH you: tailor a résumé, build a piece, practice the interview
 * (+ outreach, negotiation). Most are entered per-role from the feed; this hub is
 * where you see them in one place and start fresh. Design system only.
 */
export const dynamic = "force-dynamic";

const CRAFT = [
  {
    href: "/roles",
    emoji: "📄",
    title: "Tailor a résumé",
    body: "Role-perfect and grounded in your real work — RO drafts, you steer, every line traceable. Pick a role to start.",
    primary: true,
  },
  {
    href: "/studio/build",
    emoji: "🛠️",
    title: "Build a piece",
    body: "A prototype, teardown, or artifact that proves your edge — the thing that makes you unskippable.",
    primary: true,
  },
  {
    href: "/studio/coach",
    emoji: "🎤",
    title: "Practice the interview",
    body: "Prep + adaptive mock rounds with RO as the interviewer, then an honest, gains-first debrief.",
    primary: true,
  },
];

const MORE = [
  { href: "/studio/recruiter", emoji: "✉️", title: "Recruiter desk", body: "Screen inbound, draft truth-gated replies — you send." },
  { href: "/studio/negotiate", emoji: "🤝", title: "Negotiate an offer", body: "Benchmarks, levers, and a drafted counter — every round yours to send." },
];

export default async function Studio() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/studio");

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-small font-medium text-tx3">Studio</p>
      <h1 className="mt-1 font-display text-h1 font-bold text-tx">What RO crafts <span className="text-primary">with you.</span></h1>
      <p className="mt-2 text-body leading-relaxed text-tx2">
        The work RO does alongside you — always grounded in your real experience, always yours to approve. Most start from a role in your feed; you can also start one here.
      </p>

      <div className="mt-7 flex flex-col gap-3">
        {CRAFT.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card elevation="flat" className="flex items-start gap-4 transition-shadow hover:shadow-md">
              <span className="text-2xl leading-none">{c.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-h3 font-semibold text-tx">{c.title}</p>
                <p className="mt-1 text-small leading-relaxed text-tx2">{c.body}</p>
              </div>
              <span className="mt-1 shrink-0 text-primary">→</span>
            </Card>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-overline font-semibold uppercase text-tx3">Also in your studio</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {MORE.map((c) => (
          <Link key={c.href} href={c.href}>
            <Card elevation="flat" className="h-full transition-shadow hover:shadow-md">
              <p className="font-semibold text-tx">{c.emoji} {c.title}</p>
              <p className="mt-1 text-small text-tx3">{c.body}</p>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
