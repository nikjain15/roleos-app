"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  EXCLUDE_PATTERNS, JOB_POSTING_MARKERS, PROMO_MARKERS, SIGNAL_TERMS,
  type RankConfig,
} from "@/lib/presence/rank";

/**
 * The Presence console: four views in pipeline order, ported at parity from
 * the local serve.mjs console (nik-jain-jobos/social/signals). Sources bring
 * posts in, the Feed shows every one of them scored INCLUDING what was dropped
 * and why, the Filter is what you tune, and Respond is the daily workspace and
 * therefore the default view.
 *
 * Nothing here posts, sends, or contacts anything. "Copy & open" puts the
 * drafted comment on the clipboard and opens the post; the paste is the
 * human's. LinkedIn has no API for commenting on someone else's post, and
 * driving the page was attempted once (2026-08-11) and abandoned: 462
 * characters typed into a lazy-loaded Quill editor did not land, and a fragile
 * automation risks the account the whole search depends on.
 */

export interface RunRow {
  id: string;
  at: string;
  requests: number;
  cost_usd: number;
  fetched: number;
  new_items: number;
  kept: number;
  dropped: number;
  per_source: { slug: string; type: string; platform: string; fetched: number; unseen: number; fill_rate: number; advice: string; failed: string | null }[];
  dropped_by_reason: Record<string, number>;
}

export interface ItemRow {
  id: string;
  source_id: string | null;
  url: string;
  platform: string;
  author: string | null;
  author_headline: string | null;
  body: string | null;
  posted_at: string | null;
  engagement: number | null;
  age_hours: number | null;
  score: number | null;
  hits: string[];
  status: "kept" | "dropped";
  drop_reason: string | null;
}

export interface SourceRow {
  id: string;
  slug: string;
  platform: string;
  type: string;
  value: string;
  query: string | null;
  enabled: boolean;
  interval_hours: number;
  last_polled_at: string | null;
  last_fetched: number | null;
  last_unseen: number | null;
  last_fill_rate: number | null;
  last_error: string | null;
}

export interface FeedbackRow {
  url: string;
  verdict: "worth" | "maybe" | "no" | "posted" | null;
  note: string;
}

const STAGES = [
  { id: "sources", label: "Sources" },
  { id: "feed", label: "Feed" },
  { id: "scoring", label: "Filter" },
  { id: "respond", label: "Respond" },
] as const;
type StageId = (typeof STAGES)[number]["id"];

async function post(body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string; slug?: string }> {
  const r = await fetch("/api/presence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

function ageLabel(it: ItemRow): string {
  const h = it.posted_at
    ? Math.max(0, (Date.now() - new Date(it.posted_at).getTime()) / 36e5)
    : it.age_hours;
  if (h == null || isNaN(h)) return "age unknown";
  if (h < 1) return "just posted";
  if (h < 48) return `${Math.round(h)}h old`;
  return `${Math.round(h / 24)}d old`;
}

export default function PresenceClient({
  run, items, sources, feedback, cfg,
}: {
  run: RunRow | null;
  items: ItemRow[];
  sources: SourceRow[];
  feedback: FeedbackRow[];
  cfg: RankConfig;
}) {
  const [stage, setStage] = useState<StageId>("respond");
  const [fb, setFb] = useState<Map<string, FeedbackRow>>(
    () => new Map(feedback.map((f) => [f.url, f])),
  );

  // Deep-linkable views, as the local console had (#sources, #feed, ...).
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (STAGES.some((s) => s.id === h)) setStage(h as StageId);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const go = (id: StageId) => {
    setStage(id);
    if (window.location.hash.slice(1) !== id) window.location.hash = id;
  };

  const sourceSlug = useMemo(() => new Map(sources.map((s) => [s.id, s.slug])), [sources]);
  const kept = useMemo(() => items.filter((i) => i.status === "kept"), [items]);
  const candidates = kept.slice(0, cfg.top_n);

  const saveFeedback = async (url: string, patch: Partial<FeedbackRow> & { posted_at?: string }) => {
    const prev = fb.get(url) ?? { url, verdict: null, note: "" };
    const next: FeedbackRow = { ...prev, ...patch, url };
    setFb(new Map(fb).set(url, next));
    await post({ action: "feedback", url, ...patch });
  };

  const runLine = run
    ? `${new Date(run.at).toISOString().slice(0, 10)} · ${Math.min(cfg.top_n, run.kept)}/${run.new_items} · $${Number(run.cost_usd).toFixed(3)}`
    : "no runs yet";

  return (
    <main className="mx-auto max-w-5xl px-3 pb-20 sm:px-4">
      {/* Sub-nav: the four views are a pipeline, not peers, and the nav renders
          them as one. Same shape as the primary tabs, one level quieter. */}
      <div className="sticky top-11 z-20 -mx-3 border-b border-bd bg-surf/95 px-3 backdrop-blur sm:-mx-4 sm:px-4">
        <nav aria-label="Presence sections" className="flex items-center gap-1 overflow-x-auto">
          {STAGES.map((s) => (
            <button
              key={s.id}
              onClick={() => go(s.id)}
              aria-current={stage === s.id ? "page" : undefined}
              className={[
                "min-h-9 whitespace-nowrap border-b-2 px-2 text-[13px] transition-colors",
                stage === s.id ? "border-primary font-medium text-primary" : "border-transparent text-tx3 hover:text-tx",
              ].join(" ")}
            >
              {s.label}
            </button>
          ))}
          <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-tx3">{runLine}</span>
        </nav>
      </div>

      <div className="pt-8">
        {stage === "respond" && (
          <RespondView run={run} candidates={candidates} fb={fb} sourceSlug={sourceSlug} onFeedback={saveFeedback} />
        )}
        {stage === "feed" && <FeedView run={run} items={items} sourceSlug={sourceSlug} />}
        {stage === "scoring" && <FilterView cfg={cfg} />}
        {stage === "sources" && <SourcesView sources={sources} run={run} />}
      </div>
    </main>
  );
}

/* ── Respond ──────────────────────────────────────────────────────────────── */

function RespondView({
  run, candidates, fb, sourceSlug, onFeedback,
}: {
  run: RunRow | null;
  candidates: ItemRow[];
  fb: Map<string, FeedbackRow>;
  sourceSlug: Map<string, string>;
  onFeedback: (url: string, patch: Partial<FeedbackRow> & { posted_at?: string }) => Promise<void>;
}) {
  if (!run) {
    return (
      <div className="max-w-lg py-12 text-tx3">
        <h1 className="font-display text-2xl font-bold tracking-tight text-tx">Respond</h1>
        <p className="mt-3">
          No runs yet. The cron worker collects on its schedule once sources exist; seed them from the
          Sources view, or trigger the worker manually with <code className="font-mono text-[13px]">only=presence</code>.
        </p>
      </div>
    );
  }
  const dropped = Object.entries(run.dropped_by_reason ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <h1 className="font-display text-2xl font-bold tracking-tight">Respond</h1>
      <p className="mt-1 max-w-2xl text-tx2">Worth commenting on today, ranked.</p>
      <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-tx3">
        <b className="font-medium text-tx2">Never agreement.</b> A number from your own work, a failure
        you hit, or a distinction the author glossed. Publishable: Penny 82.5% · Pulse 100% must-block
        recall · Rally 0.83/0.92 · Conduit 275 tests. Never an employer number.
        {dropped.length > 0 && (
          <> Filtered out: {dropped.map(([k, v]) => `${k} ${v}`).join(" · ")}.</>
        )}
      </p>

      {candidates.length === 0 && (
        <p className="max-w-lg py-12 text-tx3">
          Nothing passed the filters today. Not a failure: a thin niche produces thin days, and
          commenting on something weak costs more than staying quiet.
        </p>
      )}

      <div className="mt-4">
        {candidates.map((c, i) => (
          <Card key={c.id} item={c} rank={i + 1} fb={fb.get(c.url)} slug={sourceSlug.get(c.source_id ?? "") ?? ""} onFeedback={onFeedback} />
        ))}
      </div>
    </>
  );
}

function Card({
  item, rank, fb, slug, onFeedback,
}: {
  item: ItemRow;
  rank: number;
  fb: FeedbackRow | undefined;
  slug: string;
  onFeedback: (url: string, patch: Partial<FeedbackRow> & { posted_at?: string }) => Promise<void>;
}) {
  const [note, setNote] = useState(fb?.note ?? "");
  const [open, setOpen] = useState(Boolean(fb?.note));
  const [goState, setGoState] = useState<"go" | "await" | "posted?">("go");
  const [flash, setFlash] = useState<string | null>(null);
  const verdict = fb?.verdict ?? null;

  // Returning to the tab after "Copy & open" almost always means the comment
  // went out. Offer "Posted it?" once instead of making him find the button.
  useEffect(() => {
    if (goState !== "await") return;
    const onFocus = () => setGoState("posted?");
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [goState]);

  const reach = typeof item.engagement === "number" && item.engagement >= 20 && item.engagement <= 300;
  const done = verdict != null;
  const flashThen = (label: string) => {
    setFlash(label);
    setTimeout(() => setFlash(null), 1400);
  };

  return (
    <article
      className={[
        "relative border-b border-bd py-5",
        verdict === "no" ? "opacity-25" : done ? "opacity-40" : "",
      ].join(" ")}
    >
      <div className="flex items-baseline gap-2.5">
        <span className="w-5 shrink-0 font-mono text-xs text-tx3">{rank}</span>
        <div className="min-w-0 flex-1">
          <b className="text-[15px] font-semibold">{item.author || "unknown"}</b>
          {item.author_headline && (
            <span className="block truncate text-xs text-tx3">{item.author_headline}</span>
          )}
        </div>
        <span className="font-mono text-xs text-tx3">{item.score}</span>
        {verdict && (
          <span className="absolute right-0 top-6 text-[11px] tracking-wide text-suc-tx">
            {verdict === "worth" ? "shortlisted" : verdict}
          </span>
        )}
      </div>

      <div className="mb-3 mt-1 flex flex-wrap gap-2.5 text-xs text-tx3">
        <span className="lowercase">{item.platform}</span>
        <span>{ageLabel(item)}</span>
        <span className={reach ? "text-suc-tx" : ""}>
          {item.engagement == null ? "reactions unknown" : `${item.engagement} reactions`}
        </span>
        <span className="ml-auto font-mono opacity-60">{slug}</span>
      </div>

      <p className="mb-3 max-w-3xl whitespace-pre-wrap text-tx2">
        {(item.body ?? "").slice(0, 700)}
        {(item.body ?? "").length > 700 ? "…" : ""}
      </p>

      <div className="mb-3 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-tx3">
        {(item.hits ?? []).map((h) => (
          <span key={h} className={/^no-|stuffed/.test(h) ? "text-dng-tx" : ""}>{h}</span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline">
          Open post →
        </a>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" onClick={() => onFeedback(item.url, { verdict: "worth" })}>Worth commenting</Button>
          <Button size="sm" variant="ghost" onClick={() => onFeedback(item.url, { verdict: "maybe" })}>Maybe</Button>
          <Button size="sm" variant="ghost" onClick={() => onFeedback(item.url, { verdict: "no" })}>Not for me</Button>
        </div>
      </div>

      <div className="mt-2">
        <button onClick={() => setOpen(!open)} className="text-[13px] text-primary hover:underline">
          Write the comment{fb?.note ? " (drafted)" : ""}
        </button>
        {open && (
          <div className="mt-2 max-w-3xl">
            <Textarea
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Never agreement. A number from your own work, a failure you hit, or a distinction the author glossed."
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-auto font-mono text-xs text-tx3">{note.length} characters</span>
              {flash && <span className="text-xs text-suc-tx">{flash}</span>}
              <Button size="sm" variant="ghost" onClick={async () => { await onFeedback(item.url, { note }); flashThen("Saved"); }}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!note.trim()) return;
                  await navigator.clipboard.writeText(note);
                  await onFeedback(item.url, { note });
                  flashThen("Copied");
                }}
              >
                Copy
              </Button>
              {goState === "posted?" ? (
                <Button size="sm" variant="secondary" onClick={() => { setGoState("go"); onFeedback(item.url, { verdict: "posted", note, posted_at: new Date().toISOString() }); }}>
                  Posted it?
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!note.trim()) return;
                    await navigator.clipboard.writeText(note);
                    await onFeedback(item.url, { note });
                    window.open(item.url, "_blank", "noopener");
                    setGoState("await");
                  }}
                >
                  Copy &amp; open post
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => onFeedback(item.url, { verdict: "posted", note, posted_at: new Date().toISOString() })}>
                Mark posted
              </Button>
            </div>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-tx3">
              <b className="font-medium text-tx2">Copy &amp; open</b> puts the comment on your clipboard,
              saves it, and opens the post. One paste and one click and you are done.{" "}
              <b className="font-medium text-tx2">The paste stays yours:</b> LinkedIn has no API for
              commenting, and driving the page risks the account this whole strategy depends on. It is
              also rule 4, the same human-gated-outward invariant this product enforces in CI.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

/* ── Feed ─────────────────────────────────────────────────────────────────── */

function FeedView({ run, items, sourceSlug }: { run: RunRow | null; items: ItemRow[]; sourceSlug: Map<string, string> }) {
  if (!run) return <p className="py-12 text-tx3">No runs yet.</p>;
  const rows = [...items.filter((i) => i.status === "kept"), ...items.filter((i) => i.status === "dropped")];
  return (
    <>
      <h1 className="font-display text-2xl font-bold tracking-tight">Feed</h1>
      <p className="mt-1 max-w-2xl text-tx2">
        Every post this run pulled in, scored, with what happened to it. The dropped rows are the ones
        worth reading.
      </p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-bd text-left text-[11px] lowercase tracking-wide text-tx3">
              <th className="pb-2 pr-3 font-medium">score</th>
              <th className="pb-2 pr-3 font-medium">author</th>
              <th className="pb-2 pr-3 font-medium">post</th>
              <th className="pb-2 pr-3 font-medium">reactions</th>
              <th className="pb-2 pr-3 font-medium">source</th>
              <th className="pb-2 font-medium">outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-bd align-top text-tx2 last:border-0">
                <td className="py-2.5 pr-3 font-mono">{r.score ?? "—"}</td>
                <td className="py-2.5 pr-3">{(r.author ?? "unknown").slice(0, 28)}</td>
                <td className="py-2.5 pr-3">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 max-w-md hover:text-tx">
                    {(r.body ?? "").slice(0, 200)}
                  </a>
                </td>
                <td className="py-2.5 pr-3 font-mono">{r.engagement ?? "—"}</td>
                <td className="py-2.5 pr-3 font-mono text-[11px]">{sourceSlug.get(r.source_id ?? "") ?? ""}</td>
                <td className="py-2.5">
                  {r.status === "kept" ? (
                    <span className="text-[11px] text-suc-tx">shortlist</span>
                  ) : (
                    <span className="text-[11px] text-tx3">{(r.drop_reason ?? "dropped").split(":")[0]}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Filter ───────────────────────────────────────────────────────────────── */

const FIELDS: [keyof RankConfig, string, string][] = [
  ["min_score", "Minimum score", "Below this a post is on-topic by accident. The single strongest lever on how much reaches Respond."],
  ["max_engagement", "Reaction ceiling", "Above this you are comment number 80 and nobody reads you. Measured 2026-08-09 on a 1,676-reaction post."],
  ["max_age_hours", "Maximum age (hours)", "A comment on a two-week-old post is worth nothing. LinkedIn stays commentable a day or two; X moves in hours."],
  ["dead_after_hours", "Dead after (hours)", "A post with zero reactions this long after publishing is not a conversation to join. Never fires on something posted in the last few hours."],
  ["top_n", "Shortlist size", "How many candidates reach Respond. The rest stay in the Feed."],
];

function FilterView({ cfg }: { cfg: RankConfig }) {
  const [vals, setVals] = useState<RankConfig>(cfg);
  const [saved, setSaved] = useState("");
  return (
    <>
      <h1 className="font-display text-2xl font-bold tracking-tight">Filter</h1>
      <p className="mt-1 max-w-2xl text-tx2">
        What stands between the Feed and Respond. Every rule was a judgement call in a markdown file
        before it was a number.
      </p>
      <p className="mt-2 max-w-2xl text-[13px] text-tx3">
        Applied on the next collector run. <b className="font-medium text-tx2">This does not re-score what is on screen.</b>
      </p>

      <div className="mt-6 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map(([k, label, why]) => (
          <div key={k}>
            <label htmlFor={`f-${k}`} className="block text-sm font-semibold">{label}</label>
            <p className="mb-2 mt-0.5 text-xs leading-relaxed text-tx3">{why}</p>
            <Input
              id={`f-${k}`}
              type="number"
              value={vals[k]}
              onChange={(e) => setVals({ ...vals, [k]: Number(e.target.value) })}
              className="font-mono"
            />
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Button onClick={async () => {
          const r = await post({ action: "settings", scoring: vals });
          setSaved(r.ok ? "Saved. Applies on the next run." : r.error ?? "failed");
        }}>
          Save thresholds
        </Button>
        {saved && <span className="text-[13px] text-suc-tx">{saved}</span>}
      </div>

      <h2 className="mt-10 font-display text-lg font-semibold tracking-tight">How a post gets its score</h2>
      <p className="mt-1 max-w-2xl text-tx2">
        Four passes. A post must survive the first to reach the second, and the score decides the order
        of what is left.
      </p>

      <div className="mt-5 max-w-3xl space-y-6 text-sm">
        <div>
          <h3 className="font-semibold">1. Rejections, before any scoring</h3>
          <p className="mt-1 leading-relaxed text-tx3">
            Empty body or no link · older than the age limit · {EXCLUDE_PATTERNS.length} exclusion
            patterns (certifications, bootcamps, discounts, definitional explainers, prop-firm trading
            noise) · <b className="font-medium text-tx2">two or more</b> of {JOB_POSTING_MARKERS.length} job-posting
            markers · <b className="font-medium text-tx2">two or more</b> of {PROMO_MARKERS.length} product-launch
            markers · above the reaction ceiling · zero reactions past the dead-after window · a
            duplicate of a post already kept this run, matched on content rather than URL.{" "}
            <b className="font-medium text-tx2">One marker alone never rejects:</b> a real post may
            legitimately mention years of experience or say &quot;launching&quot;. Two together is a pattern.
          </p>
        </div>
        <div>
          <h3 className="font-semibold">2. Signal terms, weighted by how much they distinguish you</h3>
          <p className="mt-1 leading-relaxed text-tx3">
            The rarer a term is in the job-postings corpus, the more it separates you from everyone else
            writing about AI. Agents is the crowded one and scores lowest.
          </p>
          <div className="mt-2 space-y-1">
            {SIGNAL_TERMS.slice().sort((a, b) => b.weight - a.weight).map((t) => (
              <div key={t.label} className="flex items-baseline gap-2.5 text-[13px] text-tx2">
                <b className="w-9 shrink-0 text-right font-mono font-normal text-tx3">+{t.weight}</b>
                {t.label}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-semibold">3. Shape bonuses and penalties</h3>
          <div className="mt-2 space-y-1 text-[13px] text-tx2">
            {([
              ["+8", "20 to 300 reactions", "visible enough to matter, small enough to be read"],
              ["+3", "5 or more reactions", "some traction"],
              ["+3", "two signal terms present", "the positioning is the intersection"],
              ["+3", "four signal terms present", ""],
              ["+2", "the post asks a question", "answering beats agreeing, and agreeing is banned"],
              ["+2", "contains a real number", "practitioner, not commentator"],
              ["−4", "zero reactions", "nobody is there"],
              ["−6", "six or more terms", "a spec sheet or an SEO listicle, not an argument"],
              ["−3", "one job-posting marker", "suspicious but not conclusive"],
            ] as const).map(([w, what, why]) => (
              <div key={what} className="flex items-baseline gap-2.5">
                <b className="w-9 shrink-0 text-right font-mono font-normal text-tx3">{w}</b>
                <span>{what}</span>
                {why && <span className="ml-auto text-right text-xs text-tx3">{why}</span>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-semibold">4. Sort and cut</h3>
          <p className="mt-1 leading-relaxed text-tx3">
            Highest score first, freshest as the tiebreak. Anything under the minimum score is dropped as
            on-topic by accident. The top N reach Respond and the rest stay visible in the Feed.{" "}
            <b className="font-medium text-tx2">The honest limit:</b> this is keyword matching. It cannot
            tell a post about agents from a post you should comment on, which is why a crypto product
            launch ranked first on one run. Phase 2 is semantic scoring on the Workers AI binding, not
            more regexes.
          </p>
        </div>
      </div>
      <p className="mt-6 max-w-3xl text-[13px] text-tx3">
        Weights and patterns live in <code className="font-mono">lib/presence/rank.ts</code> rather than
        in this form on purpose: each one encodes a reason, and a reason belongs next to the comment
        that explains it.
      </p>
    </>
  );
}

/* ── Sources ──────────────────────────────────────────────────────────────── */

function SourcesView({ sources, run }: { sources: SourceRow[]; run: RunRow | null }) {
  const [platform, setPlatform] = useState("linkedin");
  const [type, setType] = useState("keyword");
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");
  const [enabledById, setEnabledById] = useState<Map<string, boolean>>(
    () => new Map(sources.map((s) => [s.id, s.enabled])),
  );

  const liveBySlug = new Map((run?.per_source ?? []).map((s) => [s.slug, s]));

  const add = async () => {
    if (!value.trim()) { setMsg("value is required"); return; }
    const r = await post({ action: "add_source", platform, type, value: value.trim(), ...(query.trim() ? { query: query.trim() } : {}) });
    setMsg(r.ok ? `Added as ${r.slug}. The next collector tick pulls it in.` : `Rejected: ${r.error}`);
    if (r.ok) { setValue(""); setQuery(""); setTimeout(() => window.location.reload(), 900); }
  };

  const seed = async () => {
    const r = await post({ action: "seed_sources" });
    setMsg(r.ok ? "Seeded the proven source set." : `Rejected: ${r.error}`);
    if (r.ok) setTimeout(() => window.location.reload(), 900);
  };

  return (
    <>
      <h1 className="font-display text-2xl font-bold tracking-tight">Sources</h1>
      <p className="mt-1 max-w-2xl text-tx2">
        Each row is one saved search, re-run on its own interval (daily by default). A term that starts
        trending is one form away from being watched.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3 border-b border-bd pb-6">
        <div>
          <label htmlFor="s-platform" className="mb-1 block text-[11px] tracking-wide text-tx3">platform</label>
          <select id="s-platform" value={platform} onChange={(e) => setPlatform(e.target.value)}
            className="min-h-9 rounded-md border border-bd2 bg-surf px-2 text-[13px] text-tx focus:border-primary focus:outline-none">
            <option value="linkedin">linkedin</option>
            <option value="twitter">x</option>
            <option value="reddit">reddit</option>
          </select>
        </div>
        <div>
          <label htmlFor="s-type" className="mb-1 block text-[11px] tracking-wide text-tx3">type</label>
          <select id="s-type" value={type} onChange={(e) => setType(e.target.value)}
            className="min-h-9 rounded-md border border-bd2 bg-surf px-2 text-[13px] text-tx focus:border-primary focus:outline-none">
            <option value="keyword">keyword</option>
            <option value="author">author</option>
            <option value="title">title</option>
            <option value="company">company</option>
            <option value="industry">industry</option>
          </select>
        </div>
        <div className="min-w-44 flex-1">
          <label htmlFor="s-value" className="mb-1 block text-[11px] tracking-wide text-tx3">value</label>
          <Input id="s-value" value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="eval harness, or up to 5 comma-separated profile slugs" className="min-h-9 py-1 text-[13px]" />
        </div>
        <div className="min-w-44 flex-1">
          <label htmlFor="s-query" className="mb-1 block text-[11px] tracking-wide text-tx3">query (title and industry only)</label>
          <Input id="s-query" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="AI agents evals" className="min-h-9 py-1 text-[13px]" />
        </div>
        <Button size="sm" onClick={add}>Add source</Button>
        {sources.length === 0 && (
          <Button size="sm" variant="secondary" onClick={seed}>Seed the proven set</Button>
        )}
        {msg && <span className="text-[13px] text-suc-tx">{msg}</span>}
      </div>

      <p className="mt-4 max-w-3xl text-[13px] text-tx3">
        <b className="font-medium text-tx2">Fill rate is the tuning signal.</b> At ~100% the 20-post
        window overflowed and posts are being missed. Below 10% it is mostly re-read. Daily is the
        default; exceptions get measured, not assumed.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-bd text-left text-[11px] lowercase tracking-wide text-tx3">
              <th className="pb-2 pr-3 font-medium">source</th>
              <th className="pb-2 pr-3 font-medium">type</th>
              <th className="pb-2 pr-3 font-medium">query</th>
              <th className="pb-2 pr-3 font-medium">fetched</th>
              <th className="pb-2 pr-3 font-medium">fill</th>
              <th className="pb-2 pr-3 font-medium">health</th>
              <th className="pb-2 font-medium">on</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const live = liveBySlug.get(s.slug);
              const rate = live ? live.fill_rate : s.last_fill_rate;
              const enabled = enabledById.get(s.id) ?? s.enabled;
              const advice = live?.advice ?? (s.last_error ? "error" : s.last_polled_at ? "idle" : "not polled");
              const health = !enabled ? ["disabled", "text-tx3"]
                : advice.startsWith("OVERFLOWING") ? ["overflowing", "text-dng-tx"]
                : advice.startsWith("STALE") ? ["stale", "text-warn-tx"]
                : advice === "healthy" ? ["healthy", "text-suc-tx"]
                : advice === "no-results" ? ["no results", "text-tx3"]
                : [advice, "text-tx3"];
              return (
                <tr key={s.id} className="border-b border-bd align-top text-tx2 last:border-0">
                  <td className="py-2.5 pr-3 font-mono text-[11px]">{s.slug}</td>
                  <td className="py-2.5 pr-3 text-[11px] text-tx3">{s.type}</td>
                  <td className="py-2.5 pr-3 font-mono text-[11px]">
                    <div className="line-clamp-2 max-w-72">{s.value || "—"}</div>
                  </td>
                  <td className="py-2.5 pr-3 font-mono">{live?.fetched ?? s.last_fetched ?? "—"}</td>
                  <td className="py-2.5 pr-3 font-mono">{rate == null ? "—" : `${Math.round(Number(rate) * 100)}%`}</td>
                  <td className={`py-2.5 pr-3 text-[11px] ${health[1]}`}>{health[0]}</td>
                  <td className="py-2.5">
                    <button
                      onClick={async () => {
                        const next = !enabled;
                        setEnabledById(new Map(enabledById).set(s.id, next));
                        await post({ action: "toggle_source", id: s.id, enabled: next });
                      }}
                      className="text-[11px] text-primary hover:underline"
                    >
                      {enabled ? "disable" : "enable"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-5 max-w-3xl text-[13px] text-tx3">
        Known limits found live on 2026-08-11: <code className="font-mono">author</code> takes at most 5
        comma-separated values, <code className="font-mono">author_company</code> needs numeric LinkedIn
        company IDs, and <code className="font-mono">author_title</code> must be paired with a query.
      </p>
    </>
  );
}
