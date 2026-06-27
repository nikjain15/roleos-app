"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Build studio (gate 3 — the crux). Two-pane co-creation: artifact canvas (left)
 * + RO collaborator (right). 8-phase flow, provenance indicator, inject-your-edge
 * interview, RO-as-adversary pressure-test, and the ENFORCED submit gate (no
 * 100%-RO artifact). Document canvas (PRD / case study) — the sandbox-backed
 * prototype canvas comes when CF Containers is enabled.
 */

type Section = { id: string; title: string; body: string; provenance: "ro" | "you" };
type Content = {
  canvas_type: string;
  brief: string;
  phase: number;
  decode?: { whats_really_tested?: string[]; implicit_rubric?: { criterion: string; weight: string }[]; traps?: string[] };
  angles?: { name: string; thesis: string; why_it_wins: string; tradeoff: string; risk: string }[];
  bet?: { name?: string };
  sections: Section[];
  edge?: { question?: string; why?: string; answer?: string; weaved?: boolean };
  pressure?: { attacks?: { weakness: string; severity: string; vs_criterion: string; fix: string }[]; verdict?: string; note?: string };
  prototype?: {
    name?: string;
    summary?: string;
    entry?: string;
    files: { path: string; content: string }[];
    walkthrough?: string[];
    preview_url: string | null;
    sandbox_status: "live" | "offline" | "error";
    sandbox_note: string;
  };
};
type Gate = { ok: boolean; checks: { name: string; pass: boolean; detail: string }[] };

const SAMPLE_BRIEF =
  "Take-home: You're the PM for a consumer fintech app. Design a feature that uses AI to improve users' financial health. Submit a 1-page PRD covering the problem, your approach, key risks, and how you'd measure success. We're evaluating product judgment, prioritization, and how you handle AI's limitations.";

export default function BuildStudio() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [brief, setBrief] = useState("");
  const [canvasType, setCanvasType] = useState<"prd" | "case_study" | "prototype">("prd");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function call(action: string, payload: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      return (await res.json()) as Record<string, unknown>;
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    const j = await call("start", { brief, canvasType }, "RO is decoding the brief + framing the bet…");
    if (j.sessionId) {
      setSessionId(j.sessionId as string);
      setContent(j.content as Content);
    }
  }
  async function chooseBet(i: number) {
    const j = await call("choose_bet", { sessionId, angleIndex: i }, "RO is building the spine…");
    if (j.content) setContent(j.content as Content);
  }
  async function answerEdge() {
    if (answer.trim().length < 10) return;
    const j = await call("answer_edge", { sessionId, answer }, "RO is weaving in your edge…");
    if (j.content) {
      setContent(j.content as Content);
      setAnswer("");
    }
  }
  async function pressure() {
    const j = await call("pressure_test", { sessionId }, "RO is attacking it as a skeptical grader…");
    if (j.content) setContent(j.content as Content);
  }
  async function buildProto() {
    const j = await call("build_prototype", { sessionId }, "RO is building the prototype + spinning up a preview…");
    if (j.content) setContent(j.content as Content);
  }
  async function submit() {
    const j = await call("submit", { sessionId }, "Checking submit-readiness…");
    setGate(j.gate as Gate);
    if (j.ok) setSubmitted(true);
  }

  // ── start screen ─────────────────────────────────────────────────────────
  if (!content) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/feed" className="text-sm text-tx3">← back to your feed</Link>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Build studio</h1>
        <p className="mt-2 text-tx2">
          The make-or-break gate. We build it together — I scaffold, you bring the judgment and the
          edge only you have. You own what we ship.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          {(["prd", "case_study", "prototype"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setCanvasType(t)}
              className={`rounded-md border px-3 py-1.5 ${
                canvasType === t ? "border-info bg-info-bg text-info-tx" : "border-bd text-tx2"
              }`}
            >
              {t === "prd"
                ? "Strategy memo / PRD"
                : t === "case_study"
                  ? "Case study / analysis"
                  : "Prototype / MVP"}
            </button>
          ))}
        </div>
        {canvasType === "prototype" && (
          <p className="mt-2 text-xs text-tx3">
            I&apos;ll build a runnable prototype you can click through — same flow, your bet and your
            edge anchor it. Live preview needs the sandbox on; without it you still get the real code.
          </p>
        )}
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={6}
          placeholder="Paste the take-home / case brief…"
          className="mt-4 w-full rounded-xl border border-bd bg-surf p-4 text-[15px] text-tx outline-none focus:border-info"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={start}
            disabled={!!busy || brief.trim().length < 30}
            className="rounded-md bg-info px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? busy : "Start with RO"}
          </button>
          {!busy && (
            <button onClick={() => setBrief(SAMPLE_BRIEF)} className="text-sm text-tx3 underline">
              use a sample brief
            </button>
          )}
        </div>
      </main>
    );
  }

  const prov = content.sections.length
    ? Math.round(
        (content.sections.filter((s) => s.provenance === "you").reduce((a, s) => a + s.body.length, 0) /
          (content.sections.reduce((a, s) => a + s.body.length, 0) || 1)) *
          100,
      )
    : 0;

  // ── two-pane workspace ────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx3">← feed</Link>
        <span className="font-mono text-xs text-tx3">gate 3 · build studio · co-create · you own it</span>
      </div>

      {/* provenance bar */}
      <div className="mt-4">
        <div className="flex h-2 overflow-hidden rounded-full bg-surf2">
          <div className="bg-suc" style={{ width: `${prov}%` }} />
          <div className="bg-info" style={{ width: `${100 - prov}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-tx3">
          <span className="text-suc">{prov}% your thinking</span>
          <span className="text-info">{100 - prov}% RO-built</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_360px]">
        {/* CANVAS */}
        <div>
          <h2 className="text-lg font-semibold">
            {content.canvas_type === "prd"
              ? "Strategy memo / PRD"
              : content.canvas_type === "prototype"
                ? "Prototype / MVP"
                : "Case study"}
            {content.bet?.name && <span className="ml-2 font-normal text-tx3">· {content.bet.name}</span>}
          </h2>
          {content.sections.length === 0 ? (
            <p className="mt-4 text-sm text-tx3">Pick your bet → I&apos;ll build the spine here.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {content.sections.map((s) => (
                <article
                  key={s.id}
                  className={`rounded-xl border p-4 ${
                    s.provenance === "you" ? "border-suc bg-suc-bg/30" : "border-bd bg-surf"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-tx">{s.title}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        s.provenance === "you" ? "bg-suc-bg text-suc" : "bg-info-bg text-info-tx"
                      }`}
                    >
                      {s.provenance === "you" ? "your thinking" : "RO-built"}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-tx2">{s.body}</p>
                </article>
              ))}
            </div>
          )}

          {/* prototype canvas — the runnable artifact + live preview */}
          {content.canvas_type === "prototype" && content.prototype && (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-tx">The prototype</h3>
                <button
                  onClick={buildProto}
                  disabled={!!busy}
                  className="text-xs text-tx3 underline disabled:opacity-40"
                >
                  rebuild
                </button>
              </div>
              {content.prototype.summary && (
                <p className="mt-1 text-sm text-tx2">{content.prototype.summary}</p>
              )}

              {/* live preview, or a graceful offline state */}
              {content.prototype.preview_url ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-bd">
                  <div className="flex items-center gap-2 border-b border-bd bg-surf2 px-3 py-1.5">
                    <span className="h-2 w-2 rounded-full bg-suc" />
                    <span className="font-mono text-[11px] text-tx3">live preview</span>
                    <a
                      href={content.prototype.preview_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-[11px] text-info underline"
                    >
                      open ↗
                    </a>
                  </div>
                  <iframe
                    src={content.prototype.preview_url}
                    title="prototype preview"
                    className="h-[420px] w-full bg-white"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-bd bg-surf2 p-4 text-sm text-tx2">
                  {content.prototype.sandbox_note}
                </div>
              )}

              {/* what to click / notice */}
              {content.prototype.walkthrough && content.prototype.walkthrough.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-tx2">
                  {content.prototype.walkthrough.map((w, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-info">→</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* the code, collapsed */}
              <details className="mt-3 rounded-xl border border-bd bg-surf">
                <summary className="cursor-pointer px-4 py-2 text-xs text-tx3">
                  {content.prototype.files.length} files · view code
                </summary>
                <div className="space-y-3 border-t border-bd p-4">
                  {content.prototype.files.map((f) => (
                    <div key={f.path}>
                      <p className="font-mono text-[11px] text-tx3">{f.path}</p>
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-surf2 p-3 text-[11px] leading-relaxed text-tx2">
                        {f.content}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>

        {/* RO COLLABORATOR */}
        <aside className="space-y-4">
          {busy && (
            <div className="rounded-xl border border-bd bg-surf2 p-4 text-sm text-tx2">
              <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
              {busy}
            </div>
          )}

          {/* phase 2: set the bet */}
          {content.phase === 2 && content.angles && (
            <div className="rounded-xl border border-bd bg-surf p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-warn">Your call — set the bet</p>
              <p className="mt-1 text-sm text-tx2">The decisive move is yours. I&apos;ll frame the angles.</p>
              <div className="mt-3 space-y-2">
                {content.angles.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => chooseBet(i)}
                    disabled={!!busy}
                    className="w-full rounded-lg border border-bd p-3 text-left hover:border-info"
                  >
                    <p className="text-sm font-semibold text-tx">{a.name}</p>
                    <p className="mt-1 text-xs text-tx2">{a.thesis}</p>
                    <p className="mt-1 text-xs text-tx3">trade-off: {a.tradeoff}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* phase 4: inject your edge */}
          {content.phase >= 4 && content.edge?.question && !content.edge.weaved && (
            <div className="rounded-xl border-l-[3px] border-warn bg-warn-bg p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-warn">
                Inject your edge — only you can answer this
              </p>
              <p className="mt-2 text-[15px] text-tx">{content.edge.question}</p>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={4}
                placeholder="Your real story / judgment — this becomes the part that&apos;s yours…"
                className="mt-3 w-full rounded-lg border border-bd bg-surf p-3 text-sm text-tx outline-none focus:border-info"
              />
              <button
                onClick={answerEdge}
                disabled={!!busy || answer.trim().length < 10}
                className="mt-2 rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                Weave it in
              </button>
            </div>
          )}

          {/* prototype canvas: build the runnable artifact (after the edge anchors it) */}
          {content.canvas_type === "prototype" && content.edge?.weaved && !content.prototype && (
            <div className="rounded-xl border border-bd bg-surf p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Build it</p>
              <p className="mt-1 text-sm text-tx2">
                Your edge is in — now I&apos;ll turn the bet into a runnable prototype and spin up a
                preview.
              </p>
              <button
                onClick={buildProto}
                disabled={!!busy}
                className="mt-3 rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                Build the prototype
              </button>
            </div>
          )}

          {/* pressure-test */}
          {content.phase >= 6 && content.edge?.weaved && (
            <div className="rounded-xl border border-bd bg-surf p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">RO as adversary</p>
              {!content.pressure ? (
                <>
                  <p className="mt-1 text-sm text-tx2">Let me attack it as a skeptical grader before you submit.</p>
                  <button
                    onClick={pressure}
                    disabled={!!busy}
                    className="mt-3 rounded-md border border-bd px-3 py-1.5 text-xs text-tx2"
                  >
                    Pressure-test it
                  </button>
                </>
              ) : (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-tx">
                    Verdict: <span className="uppercase">{content.pressure.verdict?.replace(/_/g, " ")}</span>
                  </p>
                  {content.pressure.note && <p className="mt-1 text-xs text-tx2">{content.pressure.note}</p>}
                  <div className="mt-2 space-y-2">
                    {content.pressure.attacks?.map((a, i) => (
                      <div key={i} className="rounded-lg bg-surf2 p-2 text-xs">
                        <p className="text-tx">
                          <span className="font-semibold text-dng">[{a.severity}]</span> {a.weakness}
                        </p>
                        <p className="mt-0.5 text-tx3">fix: {a.fix}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* submit-readiness gate (enforced) */}
          {content.phase >= 6 && content.edge?.weaved && (
            <div className="rounded-xl border border-bd bg-surf2 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Submit-readiness</p>
              {gate && (
                <div className="mt-2 space-y-1.5">
                  {gate.checks.map((c, i) => (
                    <div key={i} className="text-xs">
                      <span className={c.pass ? "text-suc" : "text-warn"}>{c.pass ? "✓" : "•"}</span>{" "}
                      <span className="font-semibold text-tx">{c.name}</span>
                      <p className="ml-3 text-tx3">{c.detail}</p>
                    </div>
                  ))}
                </div>
              )}
              {submitted ? (
                <p className="mt-3 text-sm text-suc">
                  Ready to submit — it&apos;s yours, and it holds up. You press send when you&apos;re set
                  (nothing leaves the building without your click).
                </p>
              ) : (
                <button
                  onClick={submit}
                  disabled={!!busy}
                  className="mt-3 rounded-md bg-info px-4 py-2 text-sm font-medium text-white"
                >
                  Check & submit
                </button>
              )}
              {gate && !gate.ok && (
                <p className="mt-2 text-xs text-warn">
                  Not yet — the studio won&apos;t ship a 100%-RO artifact. Close the gaps above.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
