"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mapFlags } from "@/lib/resume/flags";
import { Badge } from "@/components/ui";
import { parseResumeDoc, flattenLines, type ResumeExperience } from "@/lib/resume/doc";
import type { ResumeScore, SectionScore } from "@/lib/resume/score";

/**
 * The résumé editor (v2) — single-column, document-first, ONE experience section
 * at a time (docs/specs/resume-editor-v2.md §"The editor UX"). A section navigator
 * (dropdown + search + prev/next) moves between companies; the selected block shows
 * its strength pill and its lines. Each line is inline-editable, has a ✓ that locks
 * it as approved, and a "why RO wrote this" reveal (RO's rationale + the grounded-in
 * evidence). Your original CV is an on-demand reference toggle, never a competing
 * side rail. Autosaves the structured doc; export enables when grounded.
 *
 * Backward-compatible via parseResumeDoc (legacy flat → one section). "tune this
 * section" and the command bar are revise-by-instruction (P3) — shown, wired next.
 */
export interface EditorContent {
  summary?: string;
  experience?: unknown;
  bullets?: unknown;
  keywords_injected?: string[];
  resolved_violations?: string[];
  original?: unknown;
}

type SaveState = "idle" | "saving" | "saved" | "error";

const TIER_TONE: Record<string, "suc" | "primary" | "info" | "warn"> = {
  fully: "suc",
  strong: "primary",
  solid: "info",
  thin: "warn",
};

export default function ResumeEditor({
  id,
  roleLabel,
  sourceText,
  violations,
  initialContent,
  score = null,
}: {
  id: string;
  roleLabel: string;
  sourceText: string;
  violations: string[];
  initialContent: EditorContent;
  score?: ResumeScore | null;
}) {
  const [summary, setSummary] = useState(initialContent.summary ?? "");
  const [experience, setExperience] = useState<ResumeExperience[]>(
    () => parseResumeDoc(initialContent).experience,
  );
  const [resolved, setResolved] = useState<string[]>(initialContent.resolved_violations ?? []);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [query, setQuery] = useState("");
  const [showCV, setShowCV] = useState(false);
  const [openWhy, setOpenWhy] = useState<number | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [regrounding, setRegrounding] = useState<number | null>(null);

  const originalText = useRef<string[]>(
    flattenLines(parseResumeDoc((initialContent.original as EditorContent) ?? initialContent)).map((f) => f.line.text),
  );
  const lineRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  // Global-index view across ALL sections (flags + reground address by it).
  const flat = useMemo(() => {
    const out: Array<{ gi: number; ei: number; li: number }> = [];
    let gi = 0;
    experience.forEach((exp, ei) => exp.lines.forEach((_, li) => out.push({ gi: gi++, ei, li })));
    return out;
  }, [experience]);
  const giOf = useCallback((ei: number, li: number) => flat.find((f) => f.ei === ei && f.li === li)?.gi ?? -1, [flat]);

  const flags = useMemo(
    () => mapFlags(flat.map((f) => ({ text: experience[f.ei].lines[f.li].text })), violations, resolved),
    [flat, experience, violations, resolved],
  );
  // Which sections still have an unresolved flag (for the navigator hint).
  const flaggedSections = useMemo(() => {
    const s = new Set<number>();
    for (const f of flags.byBullet) {
      const loc = flat.find((x) => x.gi === f.bulletIndex);
      if (loc) s.add(loc.ei);
    }
    return s;
  }, [flags, flat]);

  const sectionScore = useMemo(() => {
    const m = new Map<string, SectionScore>();
    for (const s of score?.sections ?? []) m.set(s.id, s);
    return m;
  }, [score]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return experience
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => `${s.company} ${s.title}`.toLowerCase().includes(q));
  }, [query, experience]);

  // ── mutations on the structured doc ──────────────────────────────────────
  const setLineText = useCallback((gi: number, text: string) => {
    setExperience((exps) => {
      let g = 0;
      return exps.map((exp) => ({ ...exp, lines: exp.lines.map((l) => (g++ === gi ? { ...l, text } : l)) }));
    });
  }, []);

  function editLine(gi: number, text: string) {
    setLineText(gi, text);
    const flag = flags.byBullet.find((f) => f.bulletIndex === gi);
    if (flag) setResolved((r) => Array.from(new Set([...r, ...flag.reasons])));
  }
  function revertLine(gi: number, reasons: string[]) {
    setLineText(gi, originalText.current[gi] ?? "");
    setResolved((r) => Array.from(new Set([...r, ...reasons])));
  }
  function toggleLock(gi: number) {
    setExperience((exps) => {
      let g = 0;
      return exps.map((exp) => ({ ...exp, lines: exp.lines.map((l) => (g++ === gi ? { ...l, locked: !l.locked } : l)) }));
    });
  }
  async function applyGrounded(gi: number, reasons: string[]) {
    if (regrounding !== null) return;
    setRegrounding(gi);
    try {
      const res = await fetch(`/api/artifact/${id}/reground`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulletIndex: gi, reasons }),
      });
      const j = (await res.json()) as { ok?: boolean; text?: string };
      if (res.ok && j.text) {
        setLineText(gi, j.text);
        setResolved((r) => Array.from(new Set([...r, ...reasons])));
        setSave("saved");
      } else setSave("error");
    } catch {
      setSave("error");
    } finally {
      setRegrounding(null);
    }
  }

  // ── autosave (debounced) ─────────────────────────────────────────────────
  const firstRender = useRef(true);
  const persist = useCallback(
    async (next: { summary: string; experience: ResumeExperience[]; resolved: string[] }) => {
      setSave("saving");
      try {
        const res = await fetch(`/api/artifact/${id}/edit`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: { summary: next.summary, experience: next.experience, resolved_violations: next.resolved } }),
        });
        setSave(res.ok ? "saved" : "error");
      } catch {
        setSave("error");
      }
    },
    [id],
  );
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => void persist({ summary, experience, resolved }), 800);
    return () => clearTimeout(t);
  }, [summary, experience, resolved, persist]);

  const grounded = flags.grounded;
  const section = experience[sectionIdx];

  return (
    <div className="mt-4" aria-label={`Tailored résumé editor for ${roleLabel}`}>
      {/* Status + export + CV toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          role="status"
          aria-live="polite"
          className={[
            "inline-flex items-center gap-2 rounded-lg border-l-[3px] px-3 py-2 text-[13px]",
            grounded ? "border-suc bg-suc-bg text-suc" : "border-warn bg-warn-bg text-warn",
          ].join(" ")}
        >
          {grounded ? (
            <>
              <b>Grounded.</b> Every line traces to your real experience — ready to export.
            </>
          ) : (
            <>
              <b>Needs your eyes.</b> {flags.outstanding} line{flags.outstanding === 1 ? "" : "s"} to resolve.
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <span aria-live="polite" className="text-xs text-tx3">
            {save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "save failed" : ""}
          </span>
          <button
            onClick={() => setShowCV((v) => !v)}
            aria-expanded={showCV}
            className="flex min-h-10 items-center rounded-md border border-bd px-3 text-sm text-tx hover:bg-surf2"
          >
            {showCV ? "Hide your CV" : "Your CV"}
          </button>
          <a
            href={grounded ? `/api/artifact/${id}/export?format=docx` : undefined}
            aria-disabled={!grounded}
            className={["flex min-h-10 items-center rounded-md border border-bd px-3 text-sm", grounded ? "text-tx hover:bg-surf2" : "pointer-events-none opacity-40"].join(" ")}
          >
            Export DOCX
          </a>
          <a
            href={grounded ? `/studio/resume/${id}/print` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!grounded}
            className={["flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-white", grounded ? "bg-primary hover:opacity-90" : "pointer-events-none bg-primary opacity-40"].join(" ")}
          >
            Export PDF
          </a>
        </div>
      </div>

      {/* On-demand CV reference (collapsible, not a side rail) */}
      {showCV && (
        <div className="mt-3 rounded-lg border border-bd bg-surf2 p-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Your CV — the source of truth</h2>
          <div className="mt-2 max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-tx2">
            {sourceText || "No source profile on file."}
          </div>
        </div>
      )}

      {/* Summary */}
      <label className="mt-5 block">
        <span className="text-xs font-medium text-tx2">Summary</span>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          className="mt-1 w-full resize-y rounded-lg border border-bd bg-surf p-2.5 text-[15px] leading-relaxed text-tx"
        />
      </label>

      {/* Section navigator */}
      {experience.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-bd bg-surf p-2">
          <span className="px-1 text-xs text-tx3">
            Section {sectionIdx + 1} of {experience.length}
          </span>
          <select
            aria-label="Jump to a section"
            value={sectionIdx}
            onChange={(e) => setSectionIdx(Number(e.target.value))}
            className="rounded-md border border-bd bg-surf px-2 py-1.5 text-sm text-tx"
          >
            {experience.map((s, i) => (
              <option key={s.id} value={i}>
                {[s.company, s.title].filter(Boolean).join(" — ") || `Section ${i + 1}`}
                {flaggedSections.has(i) ? "  ⚠" : ""}
              </option>
            ))}
          </select>
          <div className="relative min-w-[160px] flex-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a company / role…"
              className="w-full rounded-md border border-bd bg-surf px-2 py-1.5 text-sm text-tx placeholder:text-tx3"
            />
            {matches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-bd bg-surf shadow-md">
                {matches.map(({ s, i }) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSectionIdx(i);
                      setQuery("");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-tx hover:bg-surf2"
                  >
                    {s.company} <span className="text-tx3">— {s.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="ml-auto flex gap-1">
            <button onClick={() => setSectionIdx((i) => Math.max(0, i - 1))} disabled={sectionIdx === 0} className="min-h-9 rounded-md border border-bd px-2.5 text-sm text-tx disabled:opacity-40">
              ← prev
            </button>
            <button onClick={() => setSectionIdx((i) => Math.min(experience.length - 1, i + 1))} disabled={sectionIdx === experience.length - 1} className="min-h-9 rounded-md border border-bd px-2.5 text-sm text-tx disabled:opacity-40">
              next →
            </button>
          </div>
        </div>
      )}

      {/* A flag hiding in another section? point the user to it. */}
      {[...flaggedSections].some((i) => i !== sectionIdx) && (
        <button
          onClick={() => setSectionIdx([...flaggedSections].find((i) => i !== sectionIdx)!)}
          className="mt-2 text-xs text-warn underline"
        >
          ⚠ A line to resolve is in another section — jump to it →
        </button>
      )}

      {/* The one section */}
      {section && (
        <section aria-label={`${section.company} ${section.title}`} className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bd pb-2">
            <div>
              <span className="text-base font-medium text-tx">{[section.company, section.title].filter(Boolean).join(" · ") || "Experience"}</span>
              {section.dates && <span className="ml-2 text-xs text-tx3">{section.dates}</span>}
            </div>
            <div className="flex items-center gap-2">
              {(() => {
                const ss = sectionScore.get(section.id);
                return ss && ss.score !== null && ss.tier ? (
                  <Badge tone={TIER_TONE[ss.tier.id] ?? "neutral"}>
                    {ss.tier.label} · {ss.score}
                  </Badge>
                ) : null;
              })()}
              <button
                disabled
                title="Coming next: tell RO to adjust just this section"
                className="cursor-not-allowed rounded-md border border-bd px-2.5 py-1 text-xs text-tx3"
              >
                tune this section · soon
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {section.lines.map((line, li) => {
              const gi = giOf(sectionIdx, li);
              const flag = flags.byBullet.find((f) => f.bulletIndex === gi);
              const hasWhy = Boolean(line.rationale || line.evidence);
              return (
                <div key={li} className={["rounded-lg border bg-surf p-3", flag ? "border-warn" : line.locked ? "border-suc" : "border-bd"].join(" ")}>
                  <div className="flex items-start gap-2">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Line {gi + 1}</span>
                      <textarea
                        ref={(el) => {
                          if (gi >= 0) lineRefs.current[gi] = el;
                        }}
                        value={line.text}
                        onChange={(e) => editLine(gi, e.target.value)}
                        rows={2}
                        className="w-full resize-y rounded-md border border-bd bg-surf2/40 p-2 text-[15px] leading-relaxed text-tx focus:border-primary-bd focus:bg-surf"
                      />
                    </label>
                    <button
                      onClick={() => toggleLock(gi)}
                      aria-pressed={!!line.locked}
                      title={line.locked ? "Approved — locked. Unlock to let RO revise." : "Approve & lock this line"}
                      className={["mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-sm", line.locked ? "border-suc bg-suc-bg text-suc" : "border-bd text-tx3 hover:bg-surf2"].join(" ")}
                    >
                      ✓
                    </button>
                  </div>

                  {hasWhy && !flag && (
                    <button onClick={() => setOpenWhy((o) => (o === gi ? null : gi))} className="mt-1.5 text-xs font-medium text-primary" aria-expanded={openWhy === gi}>
                      {openWhy === gi ? "Hide RO's take ✎" : "Why RO wrote this ✎"}
                    </button>
                  )}
                  {openWhy === gi && !flag && (
                    <div className="mt-1.5 rounded-md bg-surf2 p-2.5 text-xs">
                      {line.rationale && (
                        <p>
                          <span className="font-semibold text-tx2">RO&apos;s take:</span> <span className="text-tx2">{line.rationale}</span>
                        </p>
                      )}
                      {line.evidence && (
                        <p className="mt-1">
                          <span className="font-semibold text-tx2">Grounded in:</span> <span className="text-tx3">{line.evidence}</span>
                        </p>
                      )}
                      <p className="mt-1 italic text-tx3">Alternative phrasings arrive with “tune”.</p>
                    </div>
                  )}

                  {flag && (
                    <div className="mt-2 rounded-md bg-warn-bg p-2 text-xs text-warn">
                      <p>
                        <span className="font-semibold">Flagged:</span> {flag.reasons.join("; ")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button onClick={() => void applyGrounded(gi, flag.reasons)} disabled={regrounding === gi} className="min-h-9 rounded-md bg-primary px-2.5 text-xs font-medium text-white disabled:opacity-50">
                          {regrounding === gi ? "grounding…" : "Use RO's grounded version"}
                        </button>
                        <button onClick={() => lineRefs.current[gi]?.focus()} className="min-h-9 rounded-md border border-bd px-2.5 text-xs text-tx hover:bg-surf2">
                          Edit myself
                        </button>
                        <button onClick={() => revertLine(gi, flag.reasons)} className="min-h-9 rounded-md border border-bd px-2.5 text-xs text-tx hover:bg-surf2">
                          Keep my original
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {flags.documentLevel.length > 0 && (
        <div className="mt-4 rounded-lg border-l-[3px] border-warn bg-warn-bg p-3 text-xs text-warn">
          <p className="font-semibold">A couple of flags I couldn&apos;t tie to one line:</p>
          <ul className="mt-1 list-disc pl-5">
            {flags.documentLevel.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
          <button onClick={() => setResolved((r) => Array.from(new Set([...r, ...flags.documentLevel])))} className="mt-1 underline">
            mark these as mine
          </button>
        </div>
      )}

      {/* Command bar (revise-by-instruction, P3) */}
      <div className="mt-6 flex items-center gap-2 rounded-xl border border-bd bg-surf p-2 opacity-70">
        <input
          disabled
          placeholder="Tell RO to adjust — e.g. one page, more technical, surface the Gen-AI proof (coming next)"
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-tx placeholder:text-tx3 focus:outline-none"
        />
        <button disabled title="Coming next: revise-by-instruction" className="cursor-not-allowed rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white opacity-60">
          ↑
        </button>
      </div>
    </div>
  );
}
