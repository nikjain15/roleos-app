"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

/**
 * Gate 4 — interview coach (coach → you perform). Prep (intel + predicted Qs +
 * story-map gaps) → mock (RO as interviewer, multi-turn) → debrief (readiness +
 * gains-oriented feedback). No autonomy — RO can't do this for you; it makes you
 * ready. Voice per ro-voice.html (never shaming).
 */
type Prep = {
  panel_focus?: string[];
  format?: string;
  predicted_questions?: { q: string; why: string; rank: number }[];
  story_map?: { rubric_area: string; your_story: string | null; gap: boolean; note: string }[];
};
type Turn = { role: "interviewer" | "candidate"; text: string };
type Debrief = {
  readiness?: number;
  landed?: string[];
  sharpen?: { point: string; how: string }[];
  one_thing?: string;
};

function CoachInner() {
  const roleId = useSearchParams().get("role");
  const [prep, setPrep] = useState<Prep | null>(null);
  const [roleName, setRoleName] = useState("");
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState("");
  const [debriefData, setDebrief] = useState<Debrief | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !roleId) return;
    started.current = true;
    (async () => {
      setBusy("RO is prepping your round — panel, questions, your stories…");
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prep", roleId }),
      });
      const j = await res.json();
      setBusy(null);
      if (j.prep) {
        setPrep(j.prep);
        setPipelineId(j.pipelineId);
        setRoleName(`${j.role?.company} — ${j.role?.role_title}`);
      }
    })();
  }, [roleId]);

  async function mockTurn(message?: string) {
    setBusy("…");
    if (message) setTranscript((t) => [...t, { role: "candidate", text: message }]);
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mock_turn", pipelineId, message }),
    });
    const j = await res.json();
    setBusy(null);
    if (j.interviewer) setTranscript((t) => [...t, { role: "interviewer", text: j.interviewer }]);
    setAnswer("");
  }

  async function runDebrief() {
    setBusy("RO is debriefing — scoring, readiness, what to sharpen…");
    const res = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "debrief", pipelineId }),
    });
    const j = await res.json();
    setBusy(null);
    if (j.debrief) setDebrief(j.debrief);
  }

  if (!roleId) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/feed" className="text-sm text-tx3">← feed</Link>
        <p className="mt-6 text-tx2">Open the coach from a role in your feed (“Practice the interview”).</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <Link href="/feed" className="text-sm text-tx3">← feed</Link>
        <span className="font-mono text-xs text-tx3">gate 4 · coach · you perform</span>
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Interview coach{roleName && ` — ${roleName}`}</h1>
      <p className="mt-1 text-sm text-tx3">I can&apos;t do this one for you — but I can make you ready.</p>

      {busy && (
        <div className="mt-6 rounded-xl border border-bd bg-surf2 p-4 text-sm text-tx2">
          <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-info" />
          {busy}
        </div>
      )}

      {/* PREP */}
      {prep && (
        <section className="mt-6 space-y-4">
          {prep.predicted_questions && (
            <div className="rounded-xl border border-bd bg-surf p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Likely questions</p>
              <ul className="mt-2 space-y-1.5 text-[15px] text-tx">
                {prep.predicted_questions.slice(0, 6).map((q, i) => (
                  <li key={i}>• {q.q}</li>
                ))}
              </ul>
            </div>
          )}
          {prep.story_map && (
            <div className="rounded-xl border border-bd bg-surf p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Your stories → their rubric</p>
              <div className="mt-2 space-y-2">
                {prep.story_map.map((s, i) => (
                  <div key={i} className="text-sm">
                    <span className={s.gap ? "text-warn" : "text-suc"}>{s.gap ? "gap" : "✓"}</span>{" "}
                    <span className="font-semibold text-tx">{s.rubric_area}</span>
                    <p className="ml-6 text-tx3">{s.gap ? s.note : s.your_story}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* MOCK */}
      {prep && !debriefData && (
        <section className="mt-6 rounded-xl border border-bd bg-surf2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Mock — I&apos;ll play the interviewer</p>
          {transcript.length === 0 ? (
            <button
              onClick={() => mockTurn()}
              disabled={!!busy}
              className="mt-3 rounded-md bg-info px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Start the mock
            </button>
          ) : (
            <div className="mt-3 space-y-3">
              {transcript.map((t, i) => (
                <div key={i} className={t.role === "interviewer" ? "" : "pl-6"}>
                  <p className="text-[11px] font-semibold text-tx3">{t.role === "interviewer" ? "Interviewer" : "You"}</p>
                  <p className="text-[15px] text-tx">{t.text}</p>
                </div>
              ))}
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={3}
                placeholder="Your answer…"
                className="w-full rounded-lg border border-bd bg-surf p-3 text-sm text-tx outline-none focus:border-info"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => answer.trim() && mockTurn(answer)}
                  disabled={!!busy || answer.trim().length < 2}
                  className="rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  Answer
                </button>
                <button
                  onClick={runDebrief}
                  disabled={!!busy || transcript.length < 2}
                  className="rounded-md border border-bd px-3 py-1.5 text-xs text-tx2"
                >
                  End & debrief me
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* DEBRIEF */}
      {debriefData && (
        <section className="mt-6 rounded-xl border border-bd bg-surf p-5">
          <div className="flex items-center justify-between">
            <p className="text-lg font-semibold">Debrief</p>
            <span className="font-mono text-sm text-suc">readiness {debriefData.readiness}/100</span>
          </div>
          {debriefData.landed && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-suc">What landed</p>
              <ul className="mt-1 space-y-1 text-sm text-tx2">
                {debriefData.landed.map((l, i) => <li key={i}>✓ {l}</li>)}
              </ul>
            </div>
          )}
          {debriefData.sharpen && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-warn">To sharpen</p>
              <ul className="mt-1 space-y-1.5 text-sm text-tx2">
                {debriefData.sharpen.map((s, i) => (
                  <li key={i}><span className="font-semibold text-tx">{s.point}</span> — {s.how}</li>
                ))}
              </ul>
            </div>
          )}
          {debriefData.one_thing && (
            <div className="mt-4 rounded-lg border-l-[3px] border-info bg-info-bg p-3 text-[14px] text-info-tx">
              <span className="font-semibold">The one thing before your real round: </span>{debriefData.one_thing}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default function Coach() {
  return (
    <Suspense>
      <CoachInner />
    </Suspense>
  );
}
