import Link from "next/link";

// Landing — tell → show → prove (journey.html §3). Voice governed by
// ro-voice.html: confident + inviting, never hypey; lead with the inversion;
// CTAs are agency verbs ("Hand RO your hunt"), never "Sign up now".
// Goal-driven: lead with the goal, then the journey RO works across.

const ICON = "h-5 w-5";

// The journey RO works across, in three beats — Find → Apply → Land. Icons
// styled per the design system (docs/specs/design-system.md): grape glyph, soft tile.
const STAGES: { label: string; sub: string; icon: React.ReactNode }[] = [
  {
    label: "Find",
    sub: "Set your goal, then surface the roles that actually fit.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    ),
  },
  {
    label: "Apply",
    sub: "Draft the work — you approve every word.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
        <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M13 3v5h5M8.5 13h7M8.5 17h7" />
      </svg>
    ),
  },
  {
    label: "Land",
    sub: "Prep the rounds and close the offer.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
        <path d="M12 3 3.5 6.5v5c0 4.5 3.2 7.8 8.5 9.5 5.3-1.7 8.5-5 8.5-9.5v-5L12 3Z" />
        <path d="m8.5 12 2.5 2.5 4.5-4.5" />
      </svg>
    ),
  },
];

export default function Landing() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <span className="inline-flex items-center gap-2 text-sm font-semibold">
        <span className="rounded-md bg-primary px-2 py-0.5 text-[13px] text-white">
          RO
        </span>
        RoleOS
      </span>

      <h1 className="mt-6 text-4xl font-bold tracking-tight">
        RO runs your job hunt. You make the calls.
      </h1>

      <p className="mt-4 max-w-2xl text-lg text-tx2">
        RO helps you set your goal, then works with you across the whole
        journey — from finding roles to closing the offer.
      </p>

      {/* The journey RO works across, in three beats — Find → Apply → Land. */}
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
        {STAGES.map((s) => (
          <div key={s.label} className="flex flex-col items-start gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-bd bg-surf2 text-primary">
              {s.icon}
            </span>
            <span className="text-base font-semibold text-tx">{s.label}</span>
            <span className="text-sm text-tx2">{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="mt-10 flex gap-3">
        <Link
          href="/onboarding"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          Hand RO your hunt
        </Link>
        <Link
          href="/explore"
          className="rounded-md border border-bd px-4 py-2 text-sm text-tx2"
        >
          Ask RO about a real posting
        </Link>
      </div>
    </main>
  );
}
