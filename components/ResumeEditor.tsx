"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mapFlags, type ResumeBullet } from "@/lib/resume/flags";

/**
 * The résumé editor (Slice 1). Two-pane craft surface: the user's real CV on the
 * left (read-only source of truth), the editable tailored draft on the right.
 * Flagged lines are resolvable in place — take RO's grounded rewrite, edit it
 * yourself, or keep your original — so the truth gate is a helper, not a wall.
 * Autosaves; live "grounded / needs-your-eyes" status; export enables when clean.
 *
 * Product decisions (confirmed): editing a flagged line yourself clears its flag
 * (you own your claims — we don't re-police your own words); export = DOCX
 * (server) + PDF (client print). a11y: labelled fields, visible focus, live status
 * announced, keyboard-usable actions, ≥40px targets, mobile pane toggle.
 */
export interface EditorContent {
  summary?: string;
  bullets?: ResumeBullet[];
  keywords_injected?: string[];
  fit_lift?: string;
  truth_note?: string;
  resolved_violations?: string[];
  original?: { summary?: string; bullets?: ResumeBullet[] };
}

type Pane = "source" | "draft";
type SaveState = "idle" | "saving" | "saved" | "error";

export default function ResumeEditor({
  id,
  roleLabel,
  sourceText,
  violations,
  initialContent,
}: {
  id: string;
  roleLabel: string;
  sourceText: string;
  violations: string[];
  initialContent: EditorContent;
}) {
  const [summary, setSummary] = useState(initialContent.summary ?? "");
  const [bullets, setBullets] = useState<ResumeBullet[]>(initialContent.bullets ?? []);
  const [resolved, setResolved] = useState<string[]>(initialContent.resolved_violations ?? []);
  const [pane, setPane] = useState<Pane>("draft");
  const [save, setSave] = useState<SaveState>("idle");
  const [regrounding, setRegrounding] = useState<number | null>(null);

  // The pristine draft, for "keep my original" reverts. Prefer the server snapshot.
  const originalBullets = useRef<ResumeBullet[]>(
    initialContent.original?.bullets ?? initialContent.bullets ?? [],
  );
  const bulletRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const flags = useMemo(
    () => mapFlags(bullets, violations, resolved),
    [bullets, violations, resolved],
  );

  // ── autosave (debounced) ─────────────────────────────────────────────────
  const firstRender = useRef(true);
  const persist = useCallback(
    async (next: { summary: string; bullets: ResumeBullet[]; resolved: string[] }) => {
      setSave("saving");
      try {
        const res = await fetch(`/api/artifact/${id}/edit`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: {
              summary: next.summary,
              bullets: next.bullets,
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
    const t = setTimeout(() => void persist({ summary, bullets, resolved }), 800);
    return () => clearTimeout(t);
  }, [summary, bullets, resolved, persist]);

  // ── edits ────────────────────────────────────────────────────────────────
  function editBullet(i: number, text: string) {
    setBullets((bs) => bs.map((b, j) => (j === i ? { ...b, text } : b)));
    // Editing your own flagged line clears its flag (you own your claims).
    const flag = flags.byBullet.find((f) => f.bulletIndex === i);
    if (flag) setResolved((r) => Array.from(new Set([...r, ...flag.reasons])));
  }

  function revertBullet(i: number, reasons: string[]) {
    const orig = originalBullets.current[i]?.text ?? bullets[i]?.text ?? "";
    setBullets((bs) => bs.map((b, j) => (j === i ? { ...b, text: orig } : b)));
    setResolved((r) => Array.from(new Set([...r, ...reasons])));
  }

  async function applyGrounded(i: number, reasons: string[]) {
    if (regrounding !== null) return;
    setRegrounding(i);
    try {
      const res = await fetch(`/api/artifact/${id}/reground`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulletIndex: i, reasons }),
      });
      const j = (await res.json()) as { ok?: boolean; text?: string };
      if (res.ok && j.text) {
        setBullets((bs) => bs.map((b, k) => (k === i ? { ...b, text: j.text! } : b)));
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
            grounded
              ? "border-suc bg-suc-bg text-suc"
              : "border-warn bg-warn-bg text-warn",
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
              grounded ? "bg-info text-white hover:opacity-90" : "pointer-events-none bg-info opacity-40 text-white",
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
        <section
          aria-label="Your original CV"
          className={[pane === "source" ? "block" : "hidden", "sm:block"].join(" ")}
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
            Your CV — the source of truth
          </h2>
          <div className="mt-2 max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-bd bg-surf2 p-3 text-[13px] leading-relaxed text-tx2">
            {sourceText || "No source profile on file."}
          </div>
        </section>

        {/* Editable draft */}
        <section
          aria-label={`Tailored résumé for ${roleLabel}`}
          className={[pane === "draft" ? "block" : "hidden", "sm:block"].join(" ")}
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">
            Tailored draft — edit anything
          </h2>

          <label className="mt-2 block">
            <span className="text-xs font-medium text-tx2">Summary</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-bd bg-surf p-2 text-[15px] leading-relaxed text-tx"
            />
          </label>

          <div className="mt-4 space-y-3">
            {bullets.map((b, i) => {
              const flag = flags.byBullet.find((f) => f.bulletIndex === i);
              return (
                <div
                  key={i}
                  className={[
                    "rounded-lg border bg-surf p-3",
                    flag ? "border-warn" : "border-bd",
                  ].join(" ")}
                >
                  <label className="block">
                    <span className="sr-only">Bullet {i + 1}</span>
                    <textarea
                      ref={(el) => {
                        bulletRefs.current[i] = el;
                      }}
                      value={b.text}
                      onChange={(e) => editBullet(i, e.target.value)}
                      rows={2}
                      className="w-full resize-y rounded-md border border-transparent bg-transparent text-[15px] leading-relaxed text-tx focus:border-bd focus:bg-surf2"
                    />
                  </label>

                  {flag && (
                    <div className="mt-2 rounded-md bg-warn-bg p-2 text-xs text-warn">
                      <p>
                        <span className="font-semibold">Flagged:</span> {flag.reasons.join("; ")}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          onClick={() => void applyGrounded(i, flag.reasons)}
                          disabled={regrounding === i}
                          className="min-h-9 rounded-md bg-info px-2.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {regrounding === i ? "grounding…" : "Use RO's grounded version"}
                        </button>
                        <button
                          onClick={() => bulletRefs.current[i]?.focus()}
                          className="min-h-9 rounded-md border border-bd px-2.5 text-xs text-tx hover:bg-surf2"
                        >
                          Edit myself
                        </button>
                        <button
                          onClick={() => revertBullet(i, flag.reasons)}
                          className="min-h-9 rounded-md border border-bd px-2.5 text-xs text-tx hover:bg-surf2"
                        >
                          Keep my original
                        </button>
                      </div>
                    </div>
                  )}

                  {!flag && b.evidence && (
                    <p className="mt-1.5 text-xs text-tx3">
                      <span className="font-semibold">grounded in:</span> {b.evidence}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

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
