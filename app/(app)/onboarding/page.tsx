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
type Mirror = { statements: string[]; insight: string };
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
  const [scanned, setScanned] = useState<number | null>(null);
  const [resolvedProfile, setResolvedProfile] = useState<string | null>(null);

  // ── the taste-from-minute-one signals (become decision_events on save) ──
  const [reactions, setReactions] = useState<Record<number, MirrorReaction>>({});
  const [rerankNote, setRerankNote] = useState<string | null>(null);
  const [reranked, setReranked] = useState(false);

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

  // The mirror includes a visually distinct target-guess. If the user told RO a
  // target, it's confirmable; if not, RO's guess is drawn from her top verdict —
  // honest (it's literally what she ranked toward) and correctable → re-rank.
  const guessText = target.trim()
    ? `You're after: ${target.trim()}`
    : matches && matches[0]
      ? `Looks like you're aiming for roles like ${matches[0].role_title}`
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
    <main className="mx-auto max-w-2xl px-6 py-14">
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

      {/* ── S2 · Working ticker ── */}
      {status.length > 0 && !matches && (
        <Card className="mt-8" elevation="flat">
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

      {/* ── S3+4 · Her read & your jobs ── */}
      {mirror && (
        <section className="mt-10">
          <h2 className="font-display text-h3 font-semibold text-tx">How I read you</h2>
          <p className="mt-1 text-small text-tx3">Tap ✓ if it&rsquo;s you, ✗ if it&rsquo;s off &mdash; every correction makes her sharper, right now.</p>
          <ul className="mt-4 space-y-2">
            {mirror.statements.map((s, i) => (
              <MirrorRow key={i} statement={s} reaction={reactions[i]} onReact={(v, c) => react(i, s, v, false, c)} />
            ))}
            {guessText && guessIndex >= 0 && (
              <MirrorRow
                statement={guessText}
                isGuess
                reaction={reactions[guessIndex]}
                onReact={(v, c) => {
                  react(guessIndex, guessText, v, true, c);
                  if (v === "correct" && c) rerank(c);
                }}
              />
            )}
          </ul>
          <Card className="mt-4 border-l-[3px] border-l-primary bg-primary-bg" elevation="flat">
            <span className="mb-1 block text-overline font-semibold uppercase text-primary">One thing worth knowing</span>
            <p className="text-body text-tx">{mirror.insight}</p>
          </Card>
        </section>
      )}

      {/* Matches */}
      {matches && (
        <section className="mt-10">
          <h2 className="font-display text-h3 font-semibold text-tx">
            Jobs worth your time{" "}
            <span className="text-small font-normal text-tx3">&middot; compared all {(scanned ?? 0).toLocaleString()} &mdash; these came out on top</span>
          </h2>

          {weakPool && (
            <Card className="mt-4 border-l-[3px] border-l-warn" elevation="flat">
              <p className="text-body leading-relaxed text-tx">
                Straight with you: nothing&rsquo;s a strong fit this week &mdash; my index runs deep on AI &amp; software and thinner elsewhere. I&rsquo;d rather say that than pad your list. Widen the criteria, or hold the bar? Save this and I&rsquo;ll keep watch either way.
              </p>
            </Card>
          )}

          <div className="mt-4 space-y-3">
            {matches.map((m) => (
              <Card key={m.id} elevation="flat" className={reranking ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-tx">{m.company} &mdash; {m.role_title}</p>
                    {m.comp?.base_range_usd && (
                      <p className="mt-0.5 font-mono text-overline text-tx3">
                        ${Math.round(m.comp.base_range_usd[0] / 1000)}k&ndash;${Math.round(m.comp.base_range_usd[1] / 1000)}k base
                      </p>
                    )}
                  </div>
                  <Rec rec={m.recommendation} fit={m.fit} />
                </div>
                <p className="mt-3 text-body leading-relaxed text-tx2">{m.why}</p>
                {m.gaps?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.gaps.map((g, i) => (
                      <span key={i} className="rounded-md bg-surf2 px-2 py-1 text-overline text-tx3" title={`bridgeable: ${g.bridgeable}`}>
                        gap: {g.gap}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Re-rank nudge — the correction payoff */}
          <Card className="mt-4 border-l-[3px] border-l-primary" elevation="flat">
            {rerankNote ? (
              <p className="text-body text-tx">{rerankNote}</p>
            ) : (
              <>
                <p className="text-body text-tx">
                  These are ranked against my guess of what you want. Tell me the real thing and I&rsquo;ll re-rank in seconds.
                </p>
                <RerankInline disabled={reranking} onSubmit={rerank} />
              </>
            )}
          </Card>

          {/* ── S5 · Save ── */}
          <Card className="mt-8" elevation="raised">
            {!weakPool && matches[0] && (
              <div className="mb-4 rounded-lg border border-bd bg-surf2 p-4">
                <p className="text-overline font-semibold uppercase text-tx3">A taste of what happens next</p>
                <p className="mt-2 text-body leading-relaxed text-tx">
                  I&rsquo;ll retell one line of your résumé for <span className="font-semibold">{matches[0].company}</span> &mdash; the exact outcome their posting asks for first &mdash; then draft the rest. You approve every word before anything leaves the building.
                </p>
              </div>
            )}

            {signedIn ? (
              <>
                <p className="text-body text-tx">
                  {savedNote ? "Saved to your hunt — I'm holding onto it and I won't ask again." : "This is yours now."}{" "}
                  Next I&rsquo;ll retell your résumé for each match, draft the applications, and learn your taste as you react. You press send on anything that leaves the building.
                </p>
                <Button className="mt-4" onClick={() => (window.location.href = "/feed")}>Go to your feed &rarr;</Button>
              </>
            ) : (
              <>
                <p className="text-body text-tx font-medium">Save free, and I start on:</p>
                <ul className="mt-3 space-y-2 text-body text-tx2">
                  <li className="flex gap-2"><span className="text-suc">✓</span> Your résumé, retold for each of your matches</li>
                  <li className="flex gap-2"><span className="text-suc">✓</span> Cover letters, drafted &mdash; you approve every send</li>
                  <li className="flex gap-2"><span className="text-suc">✓</span> A week-by-week plan toward an offer</li>
                </ul>
                <Button className="mt-4" onClick={saveAndSignIn}>Save my results &mdash; free</Button>
                <p className="mt-3 text-small text-tx3">
                  Leave without saving and this genuinely disappears &mdash; nothing is stored without your say-so. Google or a magic email link. No password, ever.
                </p>
              </>
            )}
          </Card>
        </section>
      )}
    </main>
  );
}

function MirrorRow({
  statement,
  reaction,
  onReact,
  isGuess = false,
}: {
  statement: string;
  reaction?: MirrorReaction;
  onReact: (verdict: "confirm" | "correct", correction?: string) => void;
  isGuess?: boolean;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [text, setText] = useState("");
  const confirmed = reaction?.verdict === "confirm";
  const corrected = reaction?.verdict === "correct";
  return (
    <li className={`rounded-lg border p-3 ${isGuess ? "border-primary-bd bg-primary-bg" : confirmed ? "border-suc-bd bg-suc-bg" : corrected ? "border-warn-bd bg-warn-bg" : "border-bd bg-surf"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-body text-tx">
          {isGuess && <span className="mr-2 rounded bg-primary px-1.5 py-0.5 text-overline font-semibold uppercase text-white">her guess</span>}
          {statement}
          {corrected && reaction?.correction && <span className="mt-1 block text-small text-warn-tx">you: {reaction.correction}</span>}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            aria-label="Confirm — that's me"
            onClick={() => onReact("confirm")}
            className={`flex h-7 w-7 items-center justify-center rounded-md border text-sm ${confirmed ? "border-suc bg-suc text-white" : "border-bd2 bg-surf text-tx2 hover:bg-surf2"}`}
          >
            &#10003;
          </button>
          <button
            aria-label="Correct — that's off"
            onClick={() => setCorrecting((c) => !c)}
            className={`flex h-7 w-7 items-center justify-center rounded-md border text-sm ${corrected ? "border-warn bg-warn text-white" : "border-bd2 bg-surf text-tx2 hover:bg-surf2"}`}
          >
            &#10007;
          </button>
        </div>
      </div>
      {correcting && (
        <div className="mt-2 flex gap-2">
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
    </li>
  );
}

function RerankInline({ disabled, onSubmit }: { disabled: boolean; onSubmit: (t: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-3 flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && text.trim() && onSubmit(text.trim())}
        placeholder="the job you actually want…"
        disabled={disabled}
        className="flex-1 rounded-md border border-bd2 bg-surf px-3 py-2 text-small text-tx placeholder:text-tx3 outline-none focus:border-primary focus:shadow-ring disabled:opacity-60"
      />
      <Button size="sm" disabled={disabled || !text.trim()} onClick={() => text.trim() && onSubmit(text.trim())}>
        {disabled ? "Re-ranking…" : "Re-rank"}
      </Button>
    </div>
  );
}

function Rec({ rec, fit }: { rec: Match["recommendation"]; fit: number }) {
  const label = { pursue: "go for it", maybe: "maybe", skip: "skip" } as const;
  const tone = { pursue: "bg-suc-bg text-suc-tx border-suc-bd", maybe: "bg-warn-bg text-warn-tx border-warn-bd", skip: "bg-surf2 text-tx3 border-bd" } as const;
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span className={`rounded-full border px-2.5 py-0.5 text-overline font-semibold ${tone[rec]}`}>{label[rec]}</span>
      <span className="font-mono text-overline text-tx3">{fit} fit</span>
    </div>
  );
}
