import Link from "next/link";
import { RETENTION_RULES, windowLabel } from "@/lib/retention";
import { NOT_COVERED_BY_DELETE } from "@/lib/account-delete";

/**
 * The privacy notice, in the product. `docs/PRIVACY.md` is the canonical text and
 * this page carries the same content; both must be edited together.
 *
 * The retention windows and the "what deletion misses" list are IMPORTED from the
 * modules that enforce them (`lib/retention.ts` drives the nightly purge job,
 * `lib/account-delete.ts` drives the delete route), so this page cannot promise a
 * window nothing deletes on or omit a caveat the code knows about. That was the
 * specific failure being fixed here: a retention policy that lived only in prose.
 */

export const metadata = {
  title: "Privacy at RoleOS",
  description:
    "Exactly what RoleOS stores about you, where it goes, how long it stays, and how to delete it. Written from the code, with the gaps named.",
};

const KEPT_WHILE_ACCOUNT_EXISTS: { what: string; table: string; why: string }[] = [
  { what: "Your CV or profile text, the LinkedIn URL you pasted, and the structured profile derived from it", table: "master_profile", why: "It is what every match, draft and answer is grounded in" },
  { what: "A numeric vector derived from that text", table: "profile_embeddings", why: "Fast role matching" },
  { what: "RO's reasoning about you per role: fit score, why, gaps", table: "matches", why: "Your shortlist" },
  { what: "Résumés, cover letters, screening answers and counters RO drafted", table: "artifacts", why: "Your drafts" },
  { what: "Where you applied, the stage, your notes", table: "applications, pipeline", why: "The tracker" },
  { what: "Your goal, deadline, target comp and location", table: "goals, intents", why: "Pace and planning" },
  { what: "Your notes on individual roles", table: "role_notes", why: "Your notes" },
  { what: "People from your LinkedIn connections export or typed by hand: name, employer, title, email, your relationship note", table: "connections", why: "Warm-intro paths" },
  { what: "What RO has written down about you, with a confidence score", table: "ro_memory", why: "So you do not repeat yourself" },
  { what: "Recent verbatim question-and-answer turns with RO", table: "ro_threads", why: "Conversation continuity" },
  { what: "What RO has inferred about your taste, and the evidence for it", table: "taste_model, taste_dimensions", why: "Ranking that improves" },
  { what: "An append-only log of your actions: sent, skipped, edited, rejected, corrected, approved, viewed", table: "decision_events", why: "The substrate the taste model is derived from" },
  { what: "Notification cadence and quiet hours", table: "profiles", why: "Your settings" },
  { what: "Your Google refresh token, only if you connected Google", table: "google_tokens", why: "Read-only Gmail and Calendar, to spot interview threads" },
];

const THIRD_PARTIES: { who: string; what: string; when: string }[] = [
  { who: "Anthropic", what: "Your profile text and role descriptions, inside prompts, for matching, drafting and answering", when: "Every RO run, including anonymous onboarding" },
  { who: "Cloudflare", what: "Hosts the app and sees requests and IP addresses. Workers AI computes the profile embedding, so the profile text passes through it", when: "Always" },
  { who: "Supabase", what: "Hosts the database and authentication. Everything listed above sits here", when: "Always" },
  { who: "Apify or Bright Data", what: "The LinkedIn profile URL you pasted, to fetch that public profile", when: "Only if a scraper key is configured. Off by default" },
  { who: "GitHub", what: "Your GitHub username, via the public API", when: "Only if you supply a GitHub URL" },
  { who: "Google", what: "Read-only Gmail and Calendar access. RO reads to spot interview threads and has no send capability", when: "Only if you connect Google" },
];

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 text-xl font-bold tracking-tight text-tx">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[15px] leading-relaxed text-tx2">{children}</p>;
}

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-tx">
          <span className="rounded-md bg-primary px-2 py-0.5 text-[13px] font-bold text-white">RO</span>
          RoleOS
        </Link>
        <Link href="/settings" className="text-sm text-tx3">Settings</Link>
      </div>

      <h1 className="mt-10 text-3xl font-bold tracking-tight text-tx">Privacy at RoleOS</h1>
      <p className="mt-2 text-sm text-tx3">Last updated 2 August 2026.</p>

      <div className="mt-6 rounded-xl border border-bd bg-surf2 p-5">
        <p className="text-sm font-semibold text-tx">Read this first</p>
        <p className="mt-2 text-[15px] leading-relaxed text-tx2">
          RoleOS is built and run by one person. <strong className="text-tx">No external data
          protection review, audit or legal review has taken place.</strong> Nothing on this page is
          legal advice, and nothing here claims that RoleOS complies with the GDPR, the UK GDPR, the
          CCPA or any other regulation. Some of what a regulator would ask for is genuinely not in
          place yet. What this page is: an accurate description of what the software actually does
          with your data, written from the code, so you can decide whether that is acceptable to you.
        </p>
      </div>

      <H2>Why we hold anything at all</H2>
      <P>
        You hand RoleOS your CV so it can compare you against open roles, write drafts in your voice,
        and remember what you have already told it. That is the entire purpose, and everything below
        exists because one of those three jobs needs it.
      </P>
      <P>
        We have not written a lawful-basis statement, because doing that properly is a legal exercise
        that has not happened. The honest version is: you gave it to us to do this work, and you can
        take it back at any time from Settings.
      </P>
      <P>
        Your data is not sold and it is not used to advertise to you. RoleOS does not train any model
        on it. What the model providers do under their own terms is their policy, not ours.
      </P>

      <H2>What is stored while your account exists</H2>
      <P>
        All of it lives in one hosted Postgres database. Every row is tagged with your user id and
        locked by row-level security, so one signed-in account cannot read another&apos;s rows.
      </P>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-bd text-[11px] uppercase tracking-wide text-tx3">
              <th className="py-2 pr-4 font-semibold">What</th>
              <th className="py-2 pr-4 font-semibold">Table</th>
              <th className="py-2 font-semibold">Why</th>
            </tr>
          </thead>
          <tbody>
            {KEPT_WHILE_ACCOUNT_EXISTS.map((r) => (
              <tr key={r.table + r.what} className="border-b border-bd align-top">
                <td className="py-2.5 pr-4 text-tx2">{r.what}</td>
                <td className="py-2.5 pr-4 font-mono text-xs text-tx3">{r.table}</td>
                <td className="py-2.5 text-tx3">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <P>
        <strong className="text-tx">&ldquo;While your account exists&rdquo; is a real statement, not
        a dodge.</strong> There is no timer on your CV or your drafts. Deleting someone&apos;s work
        out from under them on a schedule would be a worse product, not a more private one. The
        control you have instead is the delete button, and it is immediate.
      </P>
      <P>
        Your email address and the identity from whichever provider you signed in with are held by
        Supabase Auth. RoleOS never sees or stores a password, because it never asks for one.
      </P>

      <H2>What is time-boxed and purged</H2>
      <P>
        These windows are enforced. They are read from the same file the nightly purge job deletes
        from, so this list cannot promise something no job does.
      </P>
      <ul className="mt-4 space-y-3">
        {RETENTION_RULES.map((rule) => (
          <li key={rule.table} className="rounded-xl border border-bd bg-surf p-4">
            <p className="text-sm font-semibold text-tx">
              <span className="font-mono text-xs text-tx3">{rule.table}</span>
              <span className="ml-2 rounded bg-surf2 px-2 py-0.5 text-xs text-tx2">
                deleted after {windowLabel(rule)}
              </span>
            </p>
            <p className="mt-2 text-sm text-tx2">{rule.why}</p>
          </li>
        ))}
      </ul>

      <H2>What is in logs</H2>
      <P>
        Application logs are structured JSON lines on Cloudflare&apos;s platform. Field values whose
        key looks like a secret are redacted. Routes log events, counts and error messages. No route
        logs CV text or profile content. Cloudflare&apos;s own request logs contain IP addresses,
        under Cloudflare&apos;s retention rather than ours.
      </P>

      <H2>Before you sign up</H2>
      <P>
        <strong className="text-tx">True:</strong> your CV file never leaves your browser. PDF and
        text extraction runs client-side, so only the extracted text is sent. Nothing you type or
        paste is written to any RoleOS table until you press save, which requires signing in. Until
        then the onboarding result is held in your browser.
      </P>
      <P>
        <strong className="text-tx">Also true, and previously unsaid:</strong> the extracted text is
        sent to our server so RO can work on it, and from there to Anthropic. If you pasted a
        LinkedIn URL and the optional scraper is switched on, that URL goes to the scraping provider.
        A rate-limit row containing your IP address is written on every onboarding run, before any of
        that. So &ldquo;nothing is stored&rdquo; was not accurate and the wording on the start screen
        has been corrected. The narrower claim, that nothing about you is saved to an account until
        you choose to save, is true and still stands.
      </P>

      <H2>Who else your data reaches</H2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-bd text-[11px] uppercase tracking-wide text-tx3">
              <th className="py-2 pr-4 font-semibold">Who</th>
              <th className="py-2 pr-4 font-semibold">What they get</th>
              <th className="py-2 font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {THIRD_PARTIES.map((r) => (
              <tr key={r.who} className="border-b border-bd align-top">
                <td className="py-2.5 pr-4 font-semibold text-tx">{r.who}</td>
                <td className="py-2.5 pr-4 text-tx2">{r.what}</td>
                <td className="py-2.5 text-tx3">{r.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <P>
        RoleOS cannot send email or messages on your behalf. There is no send tool in the agent layer
        and CI enforces that. Drafts stay drafts until you act on them yourself.
      </P>
      <P>
        Each provider holds data under their own terms and their own retention. Deleting your RoleOS
        data does not reach into them.
      </P>

      <H2>Deleting your data</H2>
      <P>
        <Link href="/settings" className="text-primary underline underline-offset-2">
          Settings, then Your data, then Delete everything.
        </Link>{" "}
        You type DELETE to confirm. It runs immediately. There is no grace period and no undo.
      </P>
      <P>
        It removes your profile, embeddings, matches, artifacts, applications, pipeline, goals,
        intents, role notes, connections, RO&apos;s memory of you, your threads, your taste model and
        dimensions, your decision log, your notifications, your Google token and your settings row.
        Then it deletes your authentication record, which removes your email address and your ability
        to sign back in to that account.
      </P>
      <p className="mt-6 text-sm font-semibold text-tx">What deletion does not cover</p>
      <ul className="mt-3 space-y-2">
        {NOT_COVERED_BY_DELETE.map((line) => (
          <li key={line} className="flex gap-2 text-sm leading-relaxed text-tx2">
            <span aria-hidden className="text-tx3">·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <P>
        Supabase point-in-time recovery also holds a backup copy until it rolls off. That is not
        reachable from application code and no manual backup-scrubbing procedure exists. Anonymous
        aggregate counts computed across all users before you deleted are not individually
        attributable and are not reversed.
      </P>
      <P>
        If you want something removed that the button cannot reach, contact Nik. There is no
        automated process for it and no promised turnaround.
      </P>

      <H2>Data you give us about other people</H2>
      <P>
        The connections table holds real people who are not RoleOS users: their names, employers,
        titles and sometimes email addresses, taken from your own LinkedIn data export or typed by
        you. They did not agree to this and they cannot see or delete it. RoleOS never contacts them.
        They are deleted when you delete your data, and individually from the Connections screen. If
        you are uncomfortable with that, do not upload the export. Every other part of the product
        works without it.
      </P>

      <H2>Changes and contact</H2>
      <P>
        This notice is versioned in git and the commit history is the change log. There is no
        notification mechanism for changes to it yet, no data protection officer, and no formal
        complaints process. Nik Jain is the contact, via the repository.
      </P>
    </main>
  );
}
