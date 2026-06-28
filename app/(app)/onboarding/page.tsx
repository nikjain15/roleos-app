"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { extractDocumentText, ACCEPTED_TYPES } from "@/lib/parse-document";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Value-first onboarding (journey.html §3 A→B→C). One input → watch RO reason
 * (streamed) → the mirror (she reads you back + one insight) → your matches with
 * her reasoning. No signup wall — value before friction. Voice per ro-voice.html.
 */

type Match = {
  id: string;
  company: string;
  role_title: string;
  url: string | null;
  comp: { base_range_usd?: [number, number] | null } | null;
  fit: number;
  recommendation: "pursue" | "maybe" | "skip";
  why: string;
  gaps: { gap: string; bridgeable: "yes" | "maybe" | "no" }[];
};
type Mirror = { statements: string[]; insight: string };

const SAMPLE =
  "I'm a senior product manager with 8 years of experience, the last 4 on AI/ML products. I led a 0-to-1 launch of an LLM-powered support assistant that cut response time 40% and deflected 30% of tickets, and before that shipped a fraud-detection ML platform. Strong on technical PM, eval frameworks, and working with ML engineers. Looking for senior/staff AI PM roles. SF, open to hybrid.";

export default function Onboarding() {
  const [profile, setProfile] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [mirror, setMirror] = useState<Mirror | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [needsMore, setNeedsMore] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);
  // The RESOLVED profile text (fetched/normalized) — what we save, so the
  // master_profile is real content, not the URL the user typed.
  const [resolvedProfile, setResolvedProfile] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const { data } = await sb.auth.getUser();
      if (data.user) {
        setSignedIn(true);
        const m = data.user.user_metadata as Record<string, unknown> | undefined;
        const name = (m?.name ?? m?.full_name ?? m?.given_name) as string | undefined;
        if (name) setFirstName(String(name).split(" ")[0]);
        // RO remembers: if we already saved their work, don't re-ask — send them
        // to their feed (their saved profile + matches live there).
        const { count } = await sb
          .from("matches")
          .select("role_id", { count: "exact", head: true });
        if ((count ?? 0) > 0) {
          window.location.replace("/feed");
          return;
        }
      }
    })().catch(() => {});
    // Pre-fill the last LinkedIn URL on this device (one-time convenience).
    try {
      const saved = localStorage.getItem("roleos.linkedin_url");
      if (saved) setLinkedinUrl(saved);
    } catch {
      /* localStorage unavailable — fine */
    }
  }, []);

  const isLinkedInUrl = (s: string) => /linkedin\.com\/in\//i.test(s.trim());

  function pullLinkedIn() {
    const url = linkedinUrl.trim();
    if (!isLinkedInUrl(url) || running || parsing) return;
    try {
      localStorage.setItem("roleos.linkedin_url", url);
    } catch {
      /* ignore */
    }
    run(url);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setParsing(true);
    setError(null);
    setFileNote(null);
    try {
      const text = await extractDocumentText(file);
      if (text.trim().length < 30) {
        // likely an image-only / scanned PDF — be honest, don't pretend we read it
        setError(
          "I couldn't pull readable text from that — it may be a scanned image. Try the LinkedIn “Save to PDF” export, or paste your text.",
        );
      } else {
        setProfile(text);
        setFileNote(`Read ${file.name} — ${text.length.toLocaleString()} characters. Looks good? Show me what I see.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "I couldn't read that file — try a PDF or paste the text.");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function run(override?: string) {
    const p = (override ?? profile).trim();
    // Allow a short LinkedIn URL through (it auto-fetches); else require real text.
    if ((p.length < 30 && !isLinkedInUrl(p)) || running) return;
    setRunning(true);
    setStatus([]);
    setMirror(null);
    setMatches(null);
    setNeedsMore(null);
    setError(null);
    setSavedNote(false);

    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: p }),
      });
      if (!res.body) throw new Error("no stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let gotMirror: Mirror | null = null;
      let gotMatches: Match[] | null = null;
      let gotResolved: string | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.replace(/^data: /, "").trim();
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "status") setStatus((s) => [...s, ev.text]);
          else if (ev.type === "resolved") { gotResolved = ev.profile; setResolvedProfile(ev.profile); }
          else if (ev.type === "needs_more") setNeedsMore(ev.text);
          else if (ev.type === "mirror") { gotMirror = { statements: ev.statements, insight: ev.insight }; setMirror(gotMirror); }
          else if (ev.type === "matches") { gotMatches = ev.matches; setMatches(ev.matches); }
          else if (ev.type === "error") setError(ev.text);
        }
      }

      // RO remembers: a signed-in user's work is saved automatically — no
      // re-asking next time. (Anon users save via sign-in; see the CTA below.)
      if (signedIn && gotMatches?.length) {
        try {
          await fetch("/api/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              // Save the RESOLVED content (fetched profile), not the URL the
              // user typed — so the master_profile is a real source of truth.
              profile: gotResolved ?? p,
              mirror: gotMirror,
              matches: gotMatches,
              linkedin_url: isLinkedInUrl(p) ? p.trim() : undefined,
            }),
          });
          setSavedNote(true);
        } catch {
          /* best-effort — the user can still save from the feed */
        }
      }
    } catch {
      setError("That didn't go through on my end — not you. Try again in a moment.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold">
        <span className="rounded-md bg-info px-2 py-0.5 text-[13px] text-white">RO</span>
        RoleOS
      </Link>

      <h1 className="mt-8 text-3xl font-bold tracking-tight">
        {firstName
          ? `Welcome, ${firstName} — let's get RO your work.`
          : "Tell RO about your work. Watch what she sees."}
      </h1>
      <p className="mt-3 text-tx2">
        {firstName
          ? "Signing in tells me who you are, not what you've built — LinkedIn won't hand over your experience. Drop your profile URL and I'll pull the rest."
          : "Paste your CV, your LinkedIn, or just a few honest lines. No sign-up — RO works first, you decide after."}
      </p>

      {/* LinkedIn URL — one-tap auto-fetch (via Apify). The fastest path now. */}
      <div className="mt-6 rounded-xl border border-info/40 bg-info-bg/40 p-4">
        <label className="text-[11px] font-semibold uppercase tracking-wide text-info-tx">
          Pull straight from LinkedIn
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pullLinkedIn()}
            placeholder="https://www.linkedin.com/in/your-handle/"
            aria-label="Your LinkedIn profile URL"
            disabled={running || parsing}
            className="flex-1 rounded-md border border-bd bg-surf px-3 py-2 text-sm text-tx outline-none focus:border-info disabled:opacity-60"
          />
          <button
            onClick={pullLinkedIn}
            disabled={running || parsing || !isLinkedInUrl(linkedinUrl)}
            className="shrink-0 rounded-md bg-info px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {running ? "Pulling…" : "Pull my profile"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-tx3">
          I fetch your public profile and match on it — full experience, one tap. (One pull = one fetch.)
        </p>
      </div>

      <div className="my-4 flex items-center gap-3 text-xs text-tx3">
        <span className="h-px flex-1 bg-bd" /> or paste / upload <span className="h-px flex-1 bg-bd" />
      </div>

      <textarea
        value={profile}
        onChange={(e) => setProfile(e.target.value)}
        placeholder="Paste your CV / LinkedIn text, or just talk… (or drop a PDF below)"
        aria-label="Your CV, LinkedIn text, or a few lines about your work"
        rows={6}
        disabled={running}
        className="mt-6 w-full rounded-xl border border-bd bg-surf p-4 text-[15px] leading-relaxed text-tx outline-none focus:border-info disabled:opacity-60"
      />

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => run()}
          disabled={running || parsing || profile.trim().length < 30}
          className="rounded-md bg-info px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {running ? "RO is working…" : "Show me what RO sees"}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={running || parsing}
          className="rounded-md border border-bd px-3 py-2 text-sm text-tx2 disabled:opacity-40"
        >
          {parsing ? "Reading your file…" : "Upload LinkedIn PDF or CV"}
        </button>
        {!running && !parsing && !matches && (
          <button onClick={() => setProfile(SAMPLE)} className="text-sm text-tx3 underline">
            or use a sample
          </button>
        )}
      </div>

      <p className="mt-2 text-xs text-tx3">
        Tip: on LinkedIn, open your profile → <span className="text-tx2">More → Save to PDF</span>, then drop it here.
        Your file is read in your browser — it never leaves your device.
      </p>
      {fileNote && <p className="mt-2 text-sm text-suc">{fileNote}</p>}

      {/* Watch RO reason */}
      {status.length > 0 && (
        <div className="mt-8 rounded-xl border border-bd bg-surf2 p-4">
          {status.map((s, i) => {
            const last = i === status.length - 1;
            return (
              <div key={i} className="flex items-center gap-2 py-1 text-sm text-tx2">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    last && running ? "animate-pulse bg-info" : "bg-suc"
                  }`}
                />
                {s}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="mt-6 text-sm text-dng">{error}</p>}

      {/* Honest thin-input recovery — RO asks for real content instead of faking matches */}
      {needsMore && (
        <div className="mt-8 rounded-xl border-l-[3px] border-warn bg-warn-bg p-4 text-[15px] leading-relaxed text-tx">
          {needsMore}
        </div>
      )}

      <div ref={resultsRef}>
        {/* The mirror */}
        {mirror && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Here&apos;s how I read you</h2>
            <p className="mt-1 text-sm text-tx3">React to anything that&apos;s off — that&apos;s how I get sharper.</p>
            <ul className="mt-4 space-y-2">
              {mirror.statements.map((s, i) => (
                <li key={i} className="rounded-lg border border-bd bg-surf p-3 text-[15px] text-tx">
                  {s}
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg border-l-[3px] border-info bg-info-bg p-4 text-[15px] text-info-tx">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide">
                One thing worth knowing
              </span>
              {mirror.insight}
            </div>
          </section>
        )}

        {/* Matches */}
        {matches && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">
              Roles worth your time{" "}
              <span className="font-normal text-tx3">
                · compared all 557, these {matches.length} are closest — reasoned through, not just ranked
              </span>
            </h2>
            <div className="mt-4 space-y-3">
              {matches.map((m) => (
                <article key={m.id} className="rounded-xl border border-bd bg-surf p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-tx">
                        {m.company} — {m.role_title}
                      </p>
                      {m.comp?.base_range_usd && (
                        <p className="mt-0.5 font-mono text-xs text-tx3">
                          ${Math.round(m.comp.base_range_usd[0] / 1000)}k–$
                          {Math.round(m.comp.base_range_usd[1] / 1000)}k base
                        </p>
                      )}
                    </div>
                    <Rec rec={m.recommendation} fit={m.fit} />
                  </div>
                  <p className="mt-3 text-[15px] leading-relaxed text-tx2">{m.why}</p>
                  {m.gaps?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {m.gaps.map((g, i) => (
                        <span
                          key={i}
                          className="rounded-md bg-surf2 px-2 py-1 text-xs text-tx3"
                          title={`bridgeable: ${g.bridgeable}`}
                        >
                          gap: {g.gap}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className="mt-8 rounded-xl border border-bd bg-surf2 p-5">
              {signedIn ? (
                <>
                  <p className="text-[15px] text-tx">
                    {savedNote
                      ? "Saved to your hunt — I'll keep this and build on it. I won't ask you again."
                      : "This is yours now — I'm holding onto it."}{" "}
                    Next I&apos;ll tailor your résumé to these, draft the applications, and learn
                    your taste as you react. You press send on anything that leaves the building.
                  </p>
                  <Link
                    href="/feed"
                    className="mt-4 inline-block rounded-md bg-info px-4 py-2 text-sm font-medium text-white"
                  >
                    Go to your feed →
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-[15px] text-tx">
                    This is what I found in seconds. Sign up and I&apos;ll keep going — tailor your
                    résumé to these, draft the applications, and learn your taste as you react. You
                    press send on anything that leaves the building.
                  </p>
                  <button
                    onClick={() => {
                      sessionStorage.setItem(
                        "roleos.pending",
                        JSON.stringify({ profile: resolvedProfile ?? profile, mirror, matches }),
                      );
                      window.location.href = "/login?next=/feed";
                    }}
                    className="mt-4 inline-block rounded-md bg-info px-4 py-2 text-sm font-medium text-white"
                  >
                    Save what RO found
                  </button>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Rec({ rec, fit }: { rec: Match["recommendation"]; fit: number }) {
  const map = {
    pursue: "bg-suc-bg text-suc",
    maybe: "bg-warn-bg text-warn",
    skip: "bg-surf2 text-tx3",
  } as const;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${map[rec]}`}>
        {rec}
      </span>
      <span className="font-mono text-xs text-tx3">{fit} fit</span>
    </div>
  );
}
