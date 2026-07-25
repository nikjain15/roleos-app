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
  // ── inputs ──
  const [profile, setProfile] = useState("");
  const [target, setTarget] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [parsing, setParsing] = useState(false);
  const [fileNote, setFileNote] = useState<string | null>(null);

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
        setLinkedinUrl(saved);
        setVariant((v) => (v === "default" ? "returning" : v));
      }
    } catch {
      /* localStorage unavailable — fine */
    }
  }, []);

  const isLinkedInUrl = (s: string) => /linkedin\.com\/in\//i.test(s.trim());
  const hasProfile = profile.trim().length >= 30 || isLinkedInUrl(linkedinUrl);
  // Sharpness meter: 1 bar (base) → 3 (with a profile) → 4 (with a target).
  const sharpness = 1 + (hasProfile ? 2 : 0) + (target.trim() ? 1 : 0);

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
        setError(
          "I couldn't pull readable text from that — it may be a scanned image. Try the LinkedIn “Save to PDF” export, or paste your text.",
        );
      } else {
        setProfile(text);
        setFileNote(`Read ${file.name} — ${text.length.toLocaleString()} characters. Looks good? Hit the button below.`);
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
    if ((p.length < 30 && !isLinkedInUrl(p)) || running) return;
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
        await persist(gotResolved ?? p, gotMirror, gotMatches, isLinkedInUrl(p) ? p.trim() : undefined)
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
    const source = resolvedProfile ?? profile;
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
    const srcUrl = isLinkedInUrl(linkedinUrl) ? linkedinUrl.trim() : isLinkedInUrl(profile) ? profile.trim() : undefined;
    sessionStorage.setItem(
      "roleos.pending",
      JSON.stringify({
        profile: resolvedProfile ?? profile,
        mirror,
        matches,
        linkedin_url: srcUrl,
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

      {/* ── S1 · Arrive ── */}
      {!matches && (
        <>
          {variant === "explore" && (
            <p className="mt-8 rounded-lg border border-primary-bd bg-primary-bg px-4 py-3 text-body text-tx">
              You were looking at a role. Show me your work and I&rsquo;ll tell you straight &mdash; worth your time or not.
            </p>
          )}
          {variant === "returning" && (
            <p className="mt-8 rounded-lg border border-bd bg-surf2 px-4 py-3 text-body text-tx2">
              Welcome back. I still have your LinkedIn from last time &mdash; pull it fresh, or start over below.
            </p>
          )}

          <h1 className="mt-6 font-display text-h1 font-bold tracking-tight text-tx">
            {firstName ? `Welcome, ${firstName}.` : "Show RO your work."}
            {!firstName && <> She&rsquo;ll show you what it&rsquo;s worth.</>}
          </h1>
          <p className="mt-3 text-tx2">
            {variant === "signedin-nodata"
              ? "Signing in told me who you are — not what you've built. LinkedIn won't hand over your experience; drop your profile below and I'll pull the rest."
              : "No sign-up. She works first — you decide after."}
          </p>

          {/* Option 1 — LinkedIn */}
          <Card className="mt-6" elevation="flat">
            <div className="text-section font-semibold text-tx">LinkedIn &mdash; one tap, best results</div>
            <p className="mt-0.5 text-small text-tx3">She reads your whole career, not keywords.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && pullLinkedIn()}
                placeholder="linkedin.com/in/your-name"
                aria-label="Your LinkedIn profile URL"
                disabled={running || parsing}
                className="flex-1 rounded-md border border-bd2 bg-surf px-3 py-2 text-body text-tx placeholder:text-tx3 outline-none focus:border-primary focus:shadow-ring disabled:opacity-60"
              />
              <Button onClick={pullLinkedIn} disabled={running || parsing || !isLinkedInUrl(linkedinUrl)}>
                {running ? "Pulling…" : "Pull my profile"}
              </Button>
            </div>
            <p className="mt-2 text-overline text-tx3">Remembered on this device only &mdash; one pull, one fetch.</p>
          </Card>

          {/* Option 2 — CV file + Option 3 — free text */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Card elevation="flat">
              <div className="text-section font-semibold text-tx">CV or resume file</div>
              <p className="mt-0.5 text-small text-tx3">Every bullet counts. Read on your device &mdash; never uploaded.</p>
              <Button variant="secondary" size="sm" className="mt-3" disabled={running || parsing} onClick={() => fileRef.current?.click()}>
                {parsing ? "Reading your file…" : "Choose a PDF or CV"}
              </Button>
              {fileNote && <p className="mt-2 text-small text-suc">{fileNote}</p>}
            </Card>
            <Card elevation="flat">
              <div className="text-section font-semibold text-tx">Or just tell her</div>
              <p className="mt-0.5 text-small text-tx3">A few honest lines work &mdash; she&rsquo;ll ask for what&rsquo;s missing.</p>
            </Card>
          </div>

          <textarea
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            placeholder="Paste your CV / LinkedIn text, or just talk…"
            aria-label="Your CV, LinkedIn text, or a few lines about your work"
            rows={5}
            disabled={running}
            className="mt-3 w-full rounded-xl border border-bd2 bg-surf p-4 text-body leading-relaxed text-tx placeholder:text-tx3 outline-none focus:border-primary focus:shadow-ring disabled:opacity-60"
          />
          <input ref={fileRef} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

          {/* Optional target */}
          <div className="mt-3 rounded-xl border border-bd bg-surf2 p-4">
            <label htmlFor="target" className="text-small font-medium text-tx">
              What job do you want next? <span className="text-tx3">(optional &mdash; skip and I&rsquo;ll guess)</span>
            </label>
            <input
              id="target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Senior AI PM, $220k+, SF or remote"
              disabled={running}
              className="mt-2 w-full rounded-md border border-bd2 bg-surf px-3 py-2 text-body text-tx placeholder:text-tx3 outline-none focus:border-primary focus:shadow-ring disabled:opacity-60"
            />
            <div className="mt-3 flex items-center gap-2 text-small text-tx3" aria-label={`Read sharpness ${sharpness} of 4`}>
              How sharp will her read be?
              <span className="font-mono tracking-widest text-primary">
                {"▮".repeat(sharpness)}
                <span className="text-bd2">{"▯".repeat(4 - sharpness)}</span>
              </span>
              {!target.trim() && <span>&mdash; answer above and she starts sharper</span>}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => run()} disabled={running || parsing || !hasProfile}>
              {running ? "RO is working…" : "Show me what RO sees"}
            </Button>
            {!running && !parsing && (
              <button onClick={() => setProfile(SAMPLE)} className="text-small text-tx3 underline underline-offset-2">
                or use a sample
              </button>
            )}
          </div>
          <p className="mt-2 text-small text-tx3">Nothing is stored unless you choose to save at the end.</p>
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
