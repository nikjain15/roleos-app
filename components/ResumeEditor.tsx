"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mapFlags } from "@/lib/resume/flags";
import { Badge } from "@/components/ui";
import {
  parseResumeDoc,
  flattenLines,
  type ResumeExperience,
} from "@/lib/resume/doc";
import type { ResumeScore, SectionScore } from "@/lib/resume/score";

/**
 * The résumé editor (v2). A section-grouped craft surface: the user's real CV on
 * the left (read-only source of truth), the editable tailored draft on the right —
 * now grouped into EXPERIENCE blocks (Company · Title · Dates) with a per-section
 * strength pill (from the coverage scorer), inline-editable lines, and a ✓ that
 * locks a line as approved. Flagged lines are resolvable in place — take RO's
 * grounded rewrite, edit it yourself, or keep your original. Autosaves the
 * structured doc; live grounded status; export enables when clean.
 *
 * Backward-compatible: a legacy flat draft parses to one "Experience" section
 * (parseResumeDoc), so existing artifacts still render + edit. Sending stays
 * separate + human-gated.
 */
export interface EditorContent {
  summary?: string;
  experience?: unknown;
  bullets?: unknown;
  keywords_injected?: string[];
  fit_lift?: string;
  truth_note?: string;
  resolved_violations?: string[];
  original?: unknown;
}

type Pane = "source" | "draft";
type SaveState = "idle" | "saving" | "saved" | "error";

/** Tier id → badge tone for the section-strength pill. */
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
  const [pane, setPane] = useState<Pane>("draft");
  const [save, setSave] = useState<SaveState>("idle");
  const [regrounding, setRegrounding] = useState<number | null>(null);

  // Pristine line text by global index, for "keep my original" reverts.
  const originalText = useRef<string[]>(
    flattenLines(parseResumeDoc((initialContent.original as EditorContent) ?? initialContent)).map(
      (f) => f.line.text,
    ),
  );
  const lineRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  // Flatten lines to a stable global-index view (flags + reground address by it).
  const flat = useMemo(() => {
    const out: Array<{ gi: number; ei: number; li: number }> = [];
    let gi = 0;
    experience.forEach((exp, ei) => exp.lines.forEach((_, li) => out.push({ gi: gi++, ei, li })));
    return out;
  }, [experience]);

  const flagsInput = useMemo(
    () => flat.map((f) => ({ text: experience[f.ei].lines[f.li].text })),
    [flat, experience],
  );
  const flags = useMemo(
    () => mapFlags(flagsInput, violations, resolved),
    [flagsInput, violations, resolved],
  );

  const sectionScore = useMemo(() => {
    const m = new Map<string, SectionScore>();
    for (const s of score?.sections ?? []) m.set(s.id, s);
    return m;
  }, [score]);

  // ── mutations on the structured doc ──────────────────────────────────────
  const setLine = useCallback((gi: number, mutate: (t: string) => string) => {
    setExperience((exps) => {
      let g = 0;
      return exps.map((exp) => ({
        ...exp,
        lines: exp.lines.map((line) => (g++ === gi ? { ...line, text: mutate(line.text) } : line)),
      }));
    });
  }, []);

  function editLine(gi: number, text: string) {
    setLine(gi, () => text);
    const flag = flags.byBullet.find((f) => f.bulletIndex === gi);
    if (flag) setResolved((r) => Array.from(new Set([...r, ...flag.reasons])));
  }

  function revertLine(gi: number, reasons: string[]) {
    const orig = originalText.current[gi] ?? "";
    setLine(gi, () => orig);
    setResolved((r) => Array.from(new Set([...r, ...reasons])));
  }

  function toggleLock(gi: number) {
    setExperience((exps) => {
      let g = 0;
      return exps.map((exp) => ({
        ...exp,
        lines: exp.lines.map((line) => (g++ === gi ? { ...line, locked: !line.locked } : line)),
      }));
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
        setLine(gi, () => j.text!);
        setResolved((r) => Array.from(new Set([...r, ...reasons])));
        setSave("saved"); // reground persisted server-side
      } else {
        setSave("error");
      }
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
          body: JSON.stringify({
            content: {
              summary: next.summary,
              experience: next.experience,
              resolved_violations: next.resolved,
            },
          }),
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

  return (
    <div>
      {/* Status + export header */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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
              <b>Needs your eyes.</b> {flags.outstanding} line{flags.outstanding === 1 ? "" : "s"} lean
              past what I can ground — resolve {flags.outstanding === 1 ? "it" : "them"} below.
            </>
          )}
        </p>

        <div className="flex items-center gap-2">
          <span aria-live="polite" className="text-xs text-tx3">
            {save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "save failed" : ""}
          </span>
          <a
            href={grounded ? `/api/artifact/${id}/export?format=docx` : undefined}
            aria-disabled={!grounded}
            className={[
              "flex min-h-10 items-center rounded-md border border-bd px-3 text-sm",
              grounded ? "text-tx hover:bg-surf2" : "pointer-events-none opacity-40",
            ].join(" ")}
          >
            Export DOCX
          </a>
          <a
            href={grounded ? `/studio/resume/${id}/print` : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!grounded}
            className={[
              "flex min-h-10 items-center rounded-md px-3 text-sm font-medium",
              grounded ? "bg-primary text-white hover:opacity-90" : "pointer-events-none bg-primary opacity-40 text-white",
            ].join(" ")}
          >
            Export PDF
          </a>
        </div>
      </div>

      {/* Mobile pane toggle */}
      <div className="mt-4 flex gap-1 rounded-lg bg-surf2 p-1 sm:hidden" role="tablist" aria-label="View">
        {(["draft", "source"] as Pane[]).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={pane === p}
            onClick={() => setPane(p)}
            className={[
              "min-h-10 flex-1 rounded-md text-sm",
              pane === p ? "bg-surf font-medium text-tx shadow-sm" : "text-tx2",
            ].join(" ")}
          >
            {p === "draft" ? "Tailored draft" : "Your CV"}
          </button>
        ))}
      </div>

      {/* Two-pane canvas */}
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {/* Source */}
        <section aria-label="Your original CV" className={[pane === "source" ? "block" : "hidden", "sm:block"].join(" ")}>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Your CV — the source of truth</h2>
          <div className="mt-2 max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-bd bg-surf2 p-3 text-[13px] leading-relaxed text-tx2">
            {sourceText || "No source profile on file."}
          </div>
        </section>

        {/* Editable draft */}
        <section aria-label={`Tailored résumé for ${roleLabel}`} className={[pane === "draft" ? "block" : "hidden", "sm:block"].join(" ")}>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Tailored draft — edit anything</h2>

          <label className="mt-2 block">
            <span className="text-xs font-medium text-tx2">Summary</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-bd bg-surf p-2 text-[15px] leading-relaxed text-tx"
            />
          </label>

          {experience.map((exp, ei) => {
            const ss = sectionScore.get(exp.id);
            const header = [exp.company, exp.title].filter(Boolean).join(" · ");
            return (
              <div key={exp.id} className="mt-5">
                {/* Section header + strength pill */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bd pb-1.5">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-tx">{header || "Experience"}</span>
                    {exp.dates && <span className="ml-2 text-xs text-tx3">{exp.dates}</span>}
                  </div>
                  {ss && ss.score !== null && ss.tier && (
                    <Badge tone={TIER_TONE[ss.tier.id] ?? "neutral"}>
                      {ss.tier.label} · {ss.score}
                    </Badge>
                  )}
                </div>

                <div className="mt-3 space-y-3">
                  {exp.lines.map((line, li) => {
                    const gi = flat.find((f) => f.ei === ei && f.li === li)?.gi ?? -1;
                    const flag = flags.byBullet.find((f) => f.bulletIndex === gi);
                    return (
                      <div
                        key={li}
                        className={[
                          "rounded-lg border bg-surf p-3",
                          flag ? "border-warn" : line.locked ? "border-suc" : "border-bd",
                        ].join(" ")}
                      >
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
                              className="w-full resize-y rounded-md border border-transparent bg-transparent text-[15px] leading-relaxed text-tx focus:border-bd focus:bg-surf2"
                            />
                          </label>
                          <button
                            onClick={() => toggleLock(gi)}
                            aria-pressed={!!line.locked}
                            aria-label={line.locked ? "Locked — approved. Unlock to let RO revise." : "Approve and lock this line"}
                            title={line.locked ? "Approved — locked" : "Approve & lock"}
                            className={[
                              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm",
                              line.locked ? "border-suc bg-suc-bg text-suc" : "border-bd text-tx3 hover:bg-surf2",
                            ].join(" ")}
                          >
                            ✓
                          </button>
                        </div>

                        {flag && (
                          <div className="mt-2 rounded-md bg-warn-bg p-2 text-xs text-warn">
                            <p>
                              <span className="font-semibold">Flagged:</span> {flag.reasons.join("; ")}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                onClick={() => void applyGrounded(gi, flag.reasons)}
                                disabled={regrounding === gi}
                                className="min-h-9 rounded-md bg-primary px-2.5 text-xs font-medium text-white disabled:opacity-50"
                              >
                                {regrounding === gi ? "grounding…" : "Use RO's grounded version"}
                              </button>
                              <button
                                onClick={() => lineRefs.current[gi]?.focus()}
                                className="min-h-9 rounded-md border border-bd px-2.5 text-xs text-tx hover:bg-surf2"
                              >
                                Edit myself
                              </button>
                              <button
                                onClick={() => revertLine(gi, flag.reasons)}
                                className="min-h-9 rounded-md border border-bd px-2.5 text-xs text-tx hover:bg-surf2"
                              >
                                Keep my original
                              </button>
                            </div>
                          </div>
                        )}

                        {!flag && line.evidence && (
                          <p className="mt-1.5 text-xs text-tx3">
                            <span className="font-semibold">grounded in:</span> {line.evidence}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {flags.documentLevel.length > 0 && (
            <div className="mt-4 rounded-lg border-l-[3px] border-warn bg-warn-bg p-3 text-xs text-warn">
              <p className="font-semibold">A couple of flags I couldn&apos;t tie to one line:</p>
              <ul className="mt-1 list-disc pl-5">
                {flags.documentLevel.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
              <p className="mt-1 text-tx3">
                Edit the lines they refer to, or{" "}
                <button
                  onClick={() => setResolved((r) => Array.from(new Set([...r, ...flags.documentLevel])))}
                  className="underline"
                >
                  mark these as mine
                </button>
                .
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
