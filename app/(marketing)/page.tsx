// Landing — tell → show → prove (journey.html §3). Voice governed by
// ro-voice.html: confident + inviting, never hypey; lead with the inversion;
// CTAs are agency verbs ("Hand RO your hunt"), never "Sign up now".
// Phase 1 is a static placeholder hero; the demo-as-hero lands in Phase 2.

export default function Landing() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <span className="inline-flex items-center gap-2 text-sm font-semibold">
        <span className="rounded-md bg-info px-2 py-0.5 text-[13px] text-white">
          RO
        </span>
        RoleOS
      </span>

      <h1 className="mt-6 text-4xl font-bold tracking-tight">
        RO runs your job hunt. You make the calls.
      </h1>

      <p className="mt-4 max-w-xl text-lg text-tx2">
        You stop applying. RO finds the roles worth your time, reasons about fit
        and trajectory, drafts the work, builds the take-homes, and coaches the
        rounds. A human presses send on anything that leaves the building.
      </p>

      <div className="mt-8 flex gap-3">
        <a
          href="/onboarding"
          className="rounded-md bg-info px-4 py-2 text-sm font-medium text-white"
        >
          Hand RO your hunt
        </a>
        <a
          href="/onboarding"
          className="rounded-md border border-bd px-4 py-2 text-sm text-tx2"
        >
          Ask RO about a real posting
        </a>
      </div>

      <p className="mt-10 font-mono text-xs text-tx3">
        Phase 1 foundation · the demo-as-hero arrives in Phase 2
      </p>
    </main>
  );
}
