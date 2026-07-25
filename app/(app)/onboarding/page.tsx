"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { extractDocumentText, ACCEPTED_TYPES } from "@/lib/parse-document";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";
import type { MirrorReaction } from "@/lib/onboarding-events";

/**
 * Onboarding v2 (J1 — docs/specs/onboarding-design.md). Value-first, taste from
 * minute one: one input → RO works (plain-English ticker) → her tappable read of
 * you beside jobs that re-rank when you correct her → save with a taste of the
 * work. Built on the design system (grape · Space Grotesk · ui/ primitives).
 * No signup wall; nothing persists until save (privacy §5.1). Voice per ro-voice.
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
// A recalled role before RO has reasoned it — enough to paint a real card
// (company/title/comp) while her verdict + why + gaps stream in.
type ShortlistRole = Pick<Match, "id" | "company" | "role_title" | "url" | "comp">;
type Statement = { lead: string; detail: string };
type Mirror = { statements: Statement[]; insight: string };
type Variant = "default" | "explore" | "returning" | "signedin-nodata";

const SAMPLE =
  "I'm a senior product manager with 8 years of experience, the last 4 on AI/ML products. I led a 0-to-1 launch of an LLM-powered support assistant that cut response time 40% and deflected 30% of tickets, and before that shipped a fraud-detection ML platform. Strong on technical PM, eval frameworks, and working with ML engineers. Looking for senior/staff AI PM roles. SF, open to hybrid.";

export default function Onboarding() {
  // ── inputs (conversational: goal → one composer for URL/file/text) ──
  const [step, setStep] = useState<1 | 2>(1);
  const [target, setTarget] = useState("");
  const [work, setWork] = useState(""); // LinkedIn URL, pasted text, or a few lines
  const [attached, setAttached] = useState<{ name: string; text: string } | null>(null);
  const [parsing, setParsing] = useState(false);
  const workRef = useRef<HTMLTextAreaElement>(null);

  // ── run state ──
  const [status, setStatus] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [reranking, setReranking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsMore, setNeedsMore] = useState<string | null>(null);

  // ── results ──
  const [mirror, setMirror] = useState<Mirror | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [shortlistRoles, setShortlistRoles] = useState<ShortlistRole[] | null>(null);
  const [scanned, setScanned] = useState<number | null>(null);
  const [resolvedProfile, setResolvedProfile] = useState<string | null>(null);

  // ── the taste-from-minute-one signals (become decision_events on save) ──
  const [reactions, setReactions] = useState<Record<number, MirrorReaction>>({});
  const [rerankNote, setRerankNote] = useState<string | null>(null);
  const [reranked, setReranked] = useState(false);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [jobFilter, setJobFilter] = useState<"all" | "pursue" | "maybe">("all");

  // ── context ──
  const [variant, setVariant] = useState<Variant>("default");
  const [firstName, setFirstName] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Explore arrival: ?from=role:<id> — RO continues the conversation.
    const q = new URLSearchParams(window.location.search);
    const from = q.get("from");
    if (from?.startsWith("role:")) setVariant("explore");

    const sb = supabaseBrowser();
    (async () => {
      const { data } = await sb.auth.getUser();
      if (data.user) {
        setSignedIn(true);
        const m = data.user.user_metadata as Record<string, unknown> | undefined;
        const name = (m?.name ?? m?.full_name ?? m?.given_name) as string | undefined;
        if (name) setFirstName(String(name).split(" ")[0]);
        const { count } = await sb.from("matches").select("role_id", { count: "exact", head: true });
        if ((count ?? 0) > 0) {
          window.location.replace("/feed"); // never re-onboard someone with saved work
          return;
        }
        setVariant((v) => (v === "explore" ? v : "signedin-nodata"));
      }
    })().catch(() => {});

    try {
      const saved = localStorage.getItem("roleos.linkedin_url");
      if (saved) {
        setWork(saved); // prefill the composer with their remembered LinkedIn
        setVariant((v) => (v === "default" ? "returning" : v));
      }
    } catch {
      /* localStorage unavailable — fine */
    }
  }, []);

  const isLinkedInUrl = (s: string) => /linkedin\.com\/in\//i.test(s.trim());
  // The single profile RO reads = attached file text + whatever's in the composer
  // (a LinkedIn URL, pasted CV, or a few lines) — mix and match, all sources combine.
  const effectiveProfile = () => {
    const parts: string[] = [];
    if (attached?.text) parts.push(attached.text);
    if (work.trim()) parts.push(work.trim());
    return parts.join("\n\n");
  };
  const workUrl = () => (isLinkedInUrl(work) ? work.trim() : undefined);
  // A short, human label for what RO is reading — keeps continuity while she
  // works (so the ticker never floats context-free).
  const sourceSummary = () => {
    const parts: string[] = [];
    if (workUrl()) parts.push(workUrl()!.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""));
    if (attached) parts.push(attached.name);
    if (!isLinkedInUrl(work) && work.trim().length >= 30) parts.push("your notes");
    return parts.join(" · ");
  };
  const hasWork = work.trim().length >= 30 || isLinkedInUrl(work) || !!attached;
  // Sharpness meter: 1 (base) → 3 (with work) → 4 (with a target too).
  const sharpness = 1 + (hasWork ? 2 : 0) + (target.trim() ? 1 : 0);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setParsing(true);
    setError(null);
    try {
      const text = await extractDocumentText(file);
      if (text.trim().length < 30) {
        setError(
          "I couldn't pull readable text from that — it may be a scanned image. Try the LinkedIn “Save to PDF” export, or paste your text.",
        );
      } else {
        setAttached({ name: file.name, text });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "I couldn't read that file — try a PDF or paste the text.");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function run() {
    const p = effectiveProfile();
    if ((p.trim().length < 30 && !isLinkedInUrl(work)) || running) return;
    // Remember the LinkedIn URL on this device (returning-anon convenience).
    if (workUrl()) {
      try { localStorage.setItem("roleos.linkedin_url", workUrl()!); } catch { /* ignore */ }
    }
    setRunning(true);
    setStatus([]);
    setMirror(null);
    setMatches(null);
    setShortlistRoles(null);
    setNeedsMore(null);
    setError(null);
    setSavedNote(false);
    setReactions({});
    setRerankNote(null);
    setReranked(false);

    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: p, target: target.trim() || undefined }),
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
          else if (ev.type === "shortlist") { setShortlistRoles(ev.roles); if (typeof ev.scanned === "number") setScanned(ev.scanned); }
          else if (ev.type === "matches") { gotMatches = ev.matches; setMatches(ev.matches); if (typeof ev.scanned === "number") setScanned(ev.scanned); }
          else if (ev.type === "error") setError(ev.text);
        }
      }

      if (signedIn && gotMatches?.length) {
        await persist(gotResolved ?? p, gotMirror, gotMatches, workUrl())
          .then(() => setSavedNote(true))
          .catch(() => {});
      }
    } catch {
      setError("That didn't go through on my end — not you. Try again in a moment.");
    } finally {
      setRunning(false);
    }
  }

  // A visually distinct target-guess. If the user told RO a target, it's confirmable;
  // if not, RO's guess is drawn from her top verdict — honest (it's literally what
  // she ranked toward) and correctable → re-rank.
  const guess: Statement | null = target.trim()
    ? { lead: "Your target", detail: target.trim() }
    : matches && matches[0]
      ? { lead: "Her guess", detail: `roles like ${matches[0].role_title}` }
      : null;
  const guessIndex = mirror ? mirror.statements.length : -1;

  function react(index: number, statement: string, verdict: "confirm" | "correct", isGuess = false, correction?: string) {
    setReactions((r) => ({ ...r, [index]: { statement, verdict, correction, isGuess } }));
  }

  async function rerank(newTarget: string) {
    const t = newTarget.trim();
    const source = resolvedProfile ?? effectiveProfile();
    if (!t || reranking || source.trim().length < 30) return;
    setTarget(t);
    setReranked(true);
    setRerankNote("Noted — I'll remember that. Re-ranking against the real thing…");
    setReranking(true);
    try {
      const res = await fetch("/api/onboard/rerank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: source, target: t }),
      });
      const data = (await res.json()) as { matches?: Match[]; scanned?: number; error?: string };
      if (data.matches) {
        setMatches(data.matches);
        if (typeof data.scanned === "number") setScanned(data.scanned);
        setRerankNote("Done — your list moved. It's ranked against what you actually want now.");
      } else {
        setRerankNote("That re-rank didn't go through — not you. Try once more in a moment.");
      }
    } catch {
      setRerankNote("That re-rank didn't go through — not you. Try once more in a moment.");
    } finally {
      setReranking(false);
    }
  }

  function collectActions() {
    const mirrorReactions = Object.values(reactions);
    return {
      target: target.trim() || null,
      reranked,
      scanned: scanned ?? undefined,
      mirrorReactions,
    };
  }

  async function persist(prof: string, mir: Mirror | null, ms: Match[], linkedin?: string) {
    await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: prof, mirror: mir, matches: ms, linkedin_url: linkedin, onboarding: collectActions() }),
    });
  }

  function saveAndSignIn() {
    sessionStorage.setItem(
      "roleos.pending",
      JSON.stringify({
        profile: resolvedProfile ?? effectiveProfile(),
        mirror,
        matches,
        linkedin_url: workUrl(),
        onboarding: collectActions(), // carry ALL pre-save actions through login (§5.2)
      }),
    );
    window.location.href = "/login?next=/feed";
  }

  const weakPool = matches !== null && matches.every((m) => m.recommendation !== "pursue");

  return (
    <main className="px-6 pt-14 pb-32">
     <div className="mx-auto max-w-2xl">
      <Link href="/" className="inline-flex items-center gap-2 text-small font-semibold text-tx">
        <span className="rounded-md bg-primary px-2 py-0.5 text-[13px] font-bold text-white">RO</span>
        RoleOS
      </Link>

      {/* ── S1 · Arrive (conversational: goal → one composer) ── */}
      {!matches && !running && (
        <>
          {/* RO speaking */}
          <div className="mt-12 flex items-start gap-3">
            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-overline font-bold text-white">RO</span>
            <div className="flex-1">
              <h1 className="font-display text-h2 font-semibold leading-snug text-tx">
                {step === 1
                  ? firstName
                    ? `First, ${firstName} — what job do you want next?`
                    : "First — what job do you want next?"
                  : "Great. Now show me your work."}
              </h1>
              <p className="mt-2 text-body leading-relaxed text-tx2">
                {step === 1
                  ? "The more you tell me, the sharper everything I make for you. Plain English is perfect."
                  : variant === "signedin-nodata"
                    ? "Signing in told me who you are — not what you've built. Paste your LinkedIn, attach a CV, or type a few lines — I'll read it all."
                    : "Paste your LinkedIn, attach a CV, or type a few lines — or all three. I'll read it all."}
              </p>
              {step === 1 && variant === "explore" && (
                <p className="mt-2 text-small text-primary">Picking up where you left off &mdash; I&rsquo;ll be sure to weigh in on that role.</p>
              )}
            </div>
          </div>

          {/* Answered goal — quiet continuity */}
          {step === 2 && target.trim() && (
            <button onClick={() => setStep(1)} className="mt-5 ml-11 inline-flex max-w-[calc(100%-2.75rem)] items-center gap-2 rounded-full border border-bd bg-surf px-3 py-1 text-small text-tx2 hover:bg-surf2">
              <span className="text-tx3">goal</span>
              <span className="truncate text-tx">{target.trim()}</span>
              <span className="shrink-0 text-tx3">edit</span>
            </button>
          )}

          <div className="ml-11 mt-6">
            {step === 1 ? (
              <>
                <textarea
                  autoFocus
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  rows={3}
                  aria-label="What job do you want next?"
                  placeholder="e.g. Senior AI PM at an AI-native company, ~$220k base, SF or remote — I care about shipping real product, not managing roadmaps."
                  className="w-full resize-none rounded-xl border border-bd bg-surf px-4 py-3.5 text-body leading-relaxed text-tx placeholder:text-tx3 shadow-sm outline-none transition-shadow focus:border-primary focus:shadow-ring"
                />
                <p className="mt-2 text-small text-tx3">
                  Include the <span className="text-tx2">role</span>, <span className="text-tx2">level</span>, <span className="text-tx2">pay</span>, <span className="text-tx2">location</span>, and <span className="text-tx2">what you care about</span> — plain English is fine.
                </p>
                <button
                  onClick={() => setStep(2)}
                  disabled={target.trim().length < 2}
                  className="mt-6 w-full rounded-xl bg-primary px-6 py-3.5 text-body font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue →
                </button>
              </>
            ) : (
              <>
                {/* Polished composer — LinkedIn URL and/or PDF/CV and/or text */}
                <div className="overflow-hidden rounded-xl border border-bd bg-surf shadow-sm transition-shadow focus-within:border-primary focus-within:shadow-ring">
                  <textarea
                    ref={workRef}
                    autoFocus
                    value={work}
                    onChange={(e) => setWork(e.target.value)}
                    rows={5}
                    aria-label="Paste a LinkedIn URL, your CV text, or a few lines"
                    placeholder="Paste a LinkedIn URL, your CV text, or just talk…"
                    className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-body leading-relaxed text-tx placeholder:text-tx3 outline-none"
                  />

                  {attached && (
                    <div className="mx-4 mb-2 inline-flex items-center gap-2 rounded-lg border border-bd bg-surf2 px-2.5 py-1.5 text-small text-tx">
                      <span className="text-primary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4"><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M13 3v5h5" /></svg>
                      </span>
                      <span className="max-w-[16rem] truncate">{attached.name}</span>
                      <button onClick={() => setAttached(null)} className="text-tx3 hover:text-tx" aria-label="Remove file">✕</button>
                    </div>
                  )}

                  <div className="flex items-center gap-1 border-t border-bd px-2 py-2">
                    <button
                      onClick={() => { if (!work.trim()) setWork("https://www.linkedin.com/in/"); workRef.current?.focus(); }}
                      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-small font-medium text-tx2 transition-colors hover:bg-surf2 hover:text-tx"
                    >
                      <span style={{ color: "#0A66C2" }}>
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.73v20.54C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .78 23.2 0 22.22 0z" /></svg>
                      </span>
                      LinkedIn URL
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={parsing}
                      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-small font-medium text-tx2 transition-colors hover:bg-surf2 hover:text-tx disabled:opacity-50"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" /></svg>
                      {parsing ? "Reading…" : "Attach file"}
                    </button>
                    <span className="ml-auto shrink-0 whitespace-nowrap pr-1 text-overline text-tx3">read on your device</span>
                  </div>
                </div>
                <input ref={fileRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

                <button
                  onClick={() => run()}
                  disabled={!hasWork}
                  className="mt-6 w-full rounded-xl bg-primary px-6 py-3.5 text-body font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Show me what RO sees →
                </button>

                <div className="mt-4 flex items-center justify-between">
                  <button onClick={() => setStep(1)} className="text-small text-tx3 transition-colors hover:text-tx2">← back</button>
                  <span className="flex items-center gap-2 text-small text-tx3" aria-label={`Read sharpness ${sharpness} of 4`}>
                    sharpness
                    <span className="font-mono tracking-widest text-primary">{"▮".repeat(sharpness)}<span className="text-bd2">{"▯".repeat(4 - sharpness)}</span></span>
                  </span>
                </div>
                {!work.trim() && !attached && (
                  <button onClick={() => setWork(SAMPLE)} className="mt-3 text-small text-tx3 underline underline-offset-2">or use a sample</button>
                )}
                <p className="mt-4 text-small text-tx3">Nothing is stored unless you choose to save at the end.</p>
              </>
            )}
          </div>
        </>
      )}

      {/* ── S2 · RO working — keep the conversation thread: who she's reading
          for (goal) and what she's reading (source), so the ticker never floats
          context-free after "Show me what RO sees". ── */}
      {running && !mirror && !matches && (
        <div className="mt-12">
          <div className="flex items-start gap-3">
            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-overline font-bold text-white">RO</span>
            <div className="flex-1">
              <h1 className="font-display text-h2 font-semibold leading-snug text-tx">On it — reading your work.</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {target.trim() && (
                  <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-bd bg-surf px-3 py-1 text-small text-tx2">
                    <span className="text-tx3">goal</span>
                    <span className="truncate text-tx">{target.trim()}</span>
                  </span>
                )}
                {sourceSummary() && (
                  <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-bd bg-surf px-3 py-1 text-small text-tx2">
                    <span className="text-tx3">reading</span>
                    <span className="truncate text-tx">{sourceSummary()}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Working ticker (only until RO's read lands; the jobs column then carries
          its own "still comparing…" loader — no double indicator). */}
      {status.length > 0 && !mirror && !matches && (
        <Card className="ml-11 mt-5" elevation="flat">
          {status.map((s, i) => {
            const last = i === status.length - 1;
            return (
              <div key={i} className="flex items-center gap-2 py-1 text-small text-tx2">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${last && running ? "animate-pulse bg-primary" : "bg-suc"}`} />
                {s}
              </div>
            );
          })}
        </Card>
      )}

      {error && <p className="mt-6 text-small text-dng">{error}</p>}

      {/* Thin-input recovery */}
      {needsMore && (
        <Card className="mt-8 border-l-[3px] border-l-warn" elevation="flat">
          <p className="text-body leading-relaxed text-tx">{needsMore}</p>
        </Card>
      )}

     </div>{/* /narrow conversational column */}

      {/* ── S3+4 · Her read & your jobs (two equal columns) — breaks out wide ── */}
      {mirror && (
        <section className="mx-auto mt-10 max-w-5xl">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
            {/* READ */}
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-overline font-bold text-white">RO</span>
                <h2 className="font-display text-h2 font-semibold text-tx">How I read you</h2>
              </div>
              <p className="mt-2 text-small text-tx3">Skim the bold; tap ✓/✗ on anything to sharpen her.</p>
              <div className="mt-4 space-y-2.5">
                {mirror.statements.map((s, i) => (
                  <ReadCard key={i} lead={s.lead} detail={s.detail} reaction={reactions[i]} onReact={(v, c) => react(i, `${s.lead} — ${s.detail}`, v, false, c)} />
                ))}
                {guess && guessIndex >= 0 && (
                  <ReadCard
                    lead={guess.lead}
                    detail={guess.detail}
                    isGuess
                    reaction={reactions[guessIndex]}
                    onReact={(v, c) => {
                      react(guessIndex, `${guess.lead} — ${guess.detail}`, v, true, c);
                      if (v === "correct" && c) rerank(c);
                    }}
                  />
                )}
              </div>
            </div>

            {/* JOBS */}
            <div>
              <h2 className="font-display text-h2 font-semibold text-tx">Jobs worth your time</h2>
              {matches || shortlistRoles ? (
                <JobsColumn
                  matches={matches}
                  shortlist={shortlistRoles}
                  scanned={scanned}
                  weakPool={weakPool}
                  reranking={reranking}
                  filter={jobFilter}
                  setFilter={setJobFilter}
                  showAll={showAllMatches}
                  setShowAll={setShowAllMatches}
                  rerankNote={rerankNote}
                />
              ) : (
                <div className="mt-6 flex items-center gap-2 rounded-xl bg-surf p-5 text-small text-tx2 shadow-sm">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  Still comparing you against every open role…
                </div>
              )}
            </div>
          </div>

          {/* full-width row — equal weight, at the bottom */}
          <div className="mt-12 rounded-2xl border border-primary-bd bg-primary-bg px-6 py-6 sm:px-8">
            <div className="mx-auto max-w-4xl">
              <p className="text-overline font-semibold uppercase text-primary">One thing worth knowing</p>
              <p className="mt-2 text-h3 font-medium leading-relaxed text-tx">{mirror.insight}</p>
            </div>
          </div>
        </section>
      )}

      {/* Sticky primary CTA — always reachable once results are in */}
      {matches && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-bd bg-surf/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
            {signedIn ? (
              <>
                <Button className="flex-1" onClick={() => (window.location.href = "/feed")}>Go to your feed &rarr;</Button>
                <span className="hidden text-small text-tx3 sm:block">{savedNote ? "Saved — I won't ask again." : "Saved to your hunt."}</span>
              </>
            ) : (
              <>
                <Button className="flex-1" onClick={saveAndSignIn}>Save my results &mdash; free</Button>
                <span className="hidden text-small text-tx3 sm:block">Nothing is stored unless you save. No password, ever.</span>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function FilterPills({ opts, val, set }: { opts: [string, string][]; val: string; set: (v: string) => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      {opts.map(([v, label]) => (
        <button
          key={v}
          onClick={() => set(v)}
          className={`rounded-full px-2.5 py-1 text-overline font-medium transition-colors ${val === v ? "bg-tx text-cloud" : "bg-surf2 text-tx2 hover:bg-surf3"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ReadCard({
  lead,
  detail,
  reaction,
  onReact,
  isGuess = false,
}: {
  lead: string;
  detail: string;
  reaction?: MirrorReaction;
  onReact: (verdict: "confirm" | "correct", correction?: string) => void;
  isGuess?: boolean;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [text, setText] = useState("");
  const confirmed = reaction?.verdict === "confirm";
  const corrected = reaction?.verdict === "correct";
  const base = isGuess
    ? "bg-primary-bg"
    : confirmed
      ? "bg-suc-bg"
      : corrected
        ? "bg-warn-bg"
        : "bg-surf shadow-sm hover:bg-surf2/60";
  return (
    <div className={`rounded-xl p-4 transition-colors ${base}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-body leading-relaxed text-tx2">
          {isGuess && <span className="mr-2 align-middle rounded bg-primary px-1.5 py-0.5 text-overline font-semibold uppercase text-white">guess</span>}
          <span className="font-semibold text-tx">{lead}</span>
          <span className="text-tx3"> — </span>
          {detail}
          {corrected && reaction?.correction && <span className="mt-1 block text-small text-warn-tx">you: {reaction.correction}</span>}
        </p>
        <div className="flex shrink-0 gap-0.5">
          <button
            aria-label="Confirm — that's me"
            onClick={() => onReact("confirm")}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors ${confirmed ? "bg-suc text-white" : "text-tx3 hover:bg-suc-bg hover:text-suc-tx"}`}
          >
            &#10003;
          </button>
          <button
            aria-label="Correct — that's off"
            onClick={() => setCorrecting((c) => !c)}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors ${corrected ? "bg-warn text-white" : "text-tx3 hover:bg-warn-bg hover:text-warn-tx"}`}
          >
            &#10007;
          </button>
        </div>
      </div>
      {correcting && (
        <div className="mt-2.5 flex gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) {
                onReact("correct", text.trim());
                setCorrecting(false);
              }
            }}
            placeholder={isGuess ? "the role you actually want…" : "what's the real story?"}
            className="flex-1 rounded-md border border-bd2 bg-surf px-2.5 py-1.5 text-small text-tx placeholder:text-tx3 outline-none focus:border-primary focus:shadow-ring"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (text.trim()) {
                onReact("correct", text.trim());
                setCorrecting(false);
              }
            }}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

function CompLine({ comp }: { comp: Match["comp"] }) {
  if (!comp?.base_range_usd) return null;
  return (
    <span className="font-mono">
      ${Math.round(comp.base_range_usd[0] / 1000)}k–${Math.round(comp.base_range_usd[1] / 1000)}k base
    </span>
  );
}

function JobsColumn({
  matches,
  shortlist,
  scanned,
  weakPool,
  reranking,
  filter,
  setFilter,
  showAll,
  setShowAll,
  rerankNote,
}: {
  matches: Match[] | null;
  shortlist: ShortlistRole[] | null;
  scanned: number | null;
  weakPool: boolean;
  reranking: boolean;
  filter: "all" | "pursue" | "maybe";
  setFilter: (v: "all" | "pursue" | "maybe") => void;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  rerankNote: string | null;
}) {
  const tone = { pursue: "bg-suc-bg text-suc-tx", maybe: "bg-warn-bg text-warn-tx", skip: "bg-surf2 text-tx3" } as const;
  const label = { pursue: "go for it", maybe: "maybe", skip: "skip" } as const;

  // ── Pending: recall's done, RO is still reasoning each role. Paint real
  //    skeleton cards (company/title/comp) so the column fills immediately. ──
  if (!matches) {
    const roles = shortlist ?? [];
    const shown = showAll ? roles : roles.slice(0, 3);
    return (
      <>
        <p className="mt-2 text-small text-tx3">
          Found {roles.length} worth a real look in {(scanned ?? 0).toLocaleString()} roles — RO&rsquo;s weighing each against you now.
        </p>
        <div className="mt-4 space-y-3">
          {shown.map((m) => (
            <div key={m.id} className="rounded-xl bg-surf p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-tx">{m.company}</p>
                  <p className="text-small text-tx2">{m.role_title}</p>
                </div>
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" aria-label="reasoning" />
              </div>
              <div className="mt-3 flex items-center gap-2 text-overline text-tx3">
                <CompLine comp={m.comp} />
              </div>
              <p className="mt-2 text-small italic text-tx3">Reading this one against you…</p>
            </div>
          ))}
        </div>
        {roles.length > 3 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-3 w-full rounded-xl py-2.5 text-small font-medium text-tx3 transition-colors hover:bg-surf2 hover:text-tx2"
          >
            Show {roles.length - 3} more {roles.length - 3 === 1 ? "role" : "roles"} ↓
          </button>
        )}
      </>
    );
  }

  const filtered = matches.filter((m) => filter === "all" || m.recommendation === filter);
  const shown = showAll ? filtered : filtered.slice(0, 3);
  return (
    <>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-small text-tx3">Compared all {(scanned ?? 0).toLocaleString()} — top {filtered.length}.</p>
        <FilterPills opts={[["all", "All"], ["pursue", "Go for it"], ["maybe", "Maybe"]]} val={filter} set={(v) => setFilter(v as "all" | "pursue" | "maybe")} />
      </div>

      {weakPool && (
        <div className="mt-4 rounded-xl border-l-2 border-warn bg-surf p-4 shadow-sm">
          <p className="text-small leading-relaxed text-tx2">
            Straight with you: nothing&rsquo;s a strong fit this week &mdash; my index runs deep on AI &amp; software and thinner elsewhere. I&rsquo;d rather say that than pad your list. Save this and I&rsquo;ll keep watch.
          </p>
        </div>
      )}

      <div className={`mt-4 space-y-3 ${reranking ? "opacity-60 transition-opacity" : "transition-opacity"}`}>
        {shown.map((m) => (
          <div key={m.id} className="rounded-xl bg-surf p-5 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-tx">{m.company}</p>
                <p className="text-small text-tx2">{m.role_title}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-overline text-tx3">{m.fit}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-overline font-semibold ${tone[m.recommendation]}`}>{label[m.recommendation]}</span>
              </div>
            </div>
            <p className="mt-3 text-small leading-relaxed text-tx2">{m.why}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-overline text-tx3">
              {m.comp?.base_range_usd && (
                <span className="font-mono">
                  ${Math.round(m.comp.base_range_usd[0] / 1000)}k–${Math.round(m.comp.base_range_usd[1] / 1000)}k base
                </span>
              )}
              {m.gaps?.slice(0, 1).map((g, i) => (
                <span key={i} className="flex items-center gap-1"><span className="text-warn">△</span> {g.gap}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {filtered.length > 3 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-3 w-full rounded-xl py-2.5 text-small font-medium text-tx3 transition-colors hover:bg-surf2 hover:text-tx2"
        >
          Show {filtered.length - 3} more {filtered.length - 3 === 1 ? "role" : "roles"} ↓
        </button>
      )}

      {rerankNote && <p className="mt-3 text-small text-tx3">{rerankNote}</p>}
    </>
  );
}

