"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  parseThread,
  serializeThread,
  THREAD_STORAGE_KEY,
  type AskTurn as Turn,
  type CitedRole as Cited,
} from "@/lib/explore-thread";

/**
 * Conversational "Ask RO about the Index" (Slice 6 rewrite). Multi-turn: each Q&A
 * stays in a thread, follow-up chips continue the conversation, and cited roles are
 * clickable. Answers are grounded by `/api/explore/ask` (index_qa) — RO never
 * invents. The convert door (share profile → your fit) stays in view.
 *
 * W6: the thread persists across page loads (localStorage, browser-only — nothing
 * server-side for anon visitors; validated on read, capped, clearable).
 */
type Scope = { company?: string; archetype?: string };

export default function AskRo({
  scope,
  label,
  suggestions = [],
}: {
  scope?: Scope;
  label?: string;
  suggestions?: string[];
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const about = label ? ` about ${label}` : " about the Index";

  // W6: restore the thread after mount (hydration-safe), persist on change.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      setTurns(parseThread(window.localStorage.getItem(THREAD_STORAGE_KEY)));
    } catch {
      /* storage blocked (private mode etc.) — start fresh */
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      if (turns.length === 0) window.localStorage.removeItem(THREAD_STORAGE_KEY);
      else window.localStorage.setItem(THREAD_STORAGE_KEY, serializeThread(turns));
    } catch {
      /* storage full/blocked — the thread just won't persist */
    }
  }, [turns, restored]);

  function clearThread() {
    setTurns([]);
    setError(null);
  }

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    setQ("");
    try {
      const history = turns.slice(-3).map((t) => ({ q: t.q, a: t.a }));
      const res = await fetch("/api/explore/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, scope, history }),
      });
      const data = (await res.json()) as {
        answer?: string;
        cited?: Cited[];
        followups?: string[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "RO couldn't answer that one.");
      } else {
        setTurns((t) => [
          ...t,
          { q: text, a: data.answer ?? "", cited: data.cited ?? [], followups: data.followups ?? [] },
        ]);
        setTimeout(() => threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
      }
    } catch {
      setError("Network hiccup — try again.");
    } finally {
      setBusy(false);
    }
  }

  const started = turns.length > 0;
  const latestFollowups = started ? turns[turns.length - 1].followups : [];

  return (
    <div className="mt-8 rounded-xl border border-bd bg-surf2 p-5">
      <p className="text-sm font-semibold text-tx">Ask RO{about}</p>
      <p className="mt-1 text-[13px] text-tx2">
        RO answers from what it&apos;s actually read — requirements, who sponsors visas, what they pay
        when they say. Ask follow-ups; it remembers the thread.
      </p>

      {/* Conversation thread */}
      {started && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-tx3">
              Your conversation — saved in this browser only
            </p>
            <button onClick={clearThread} className="text-[11px] text-tx3 underline hover:text-tx">
              clear conversation
            </button>
          </div>
          {turns.map((t, i) => (
            <div key={i}>
              <p className="text-[13px] font-medium text-tx2">
                <span className="text-tx3">You:</span> {t.q}
              </p>
              <div className="mt-1.5 rounded-lg border border-bd bg-surf p-3">
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-tx">{t.a}</p>
                {t.cited.length > 0 && (
                  <div className="mt-3 border-t border-bd pt-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-tx3">
                      Roles RO looked at
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {t.cited.map((c) => (
                        <Link
                          key={c.id}
                          href={`/explore/posting/${c.id}`}
                          className="rounded-full bg-surf2 px-2 py-0.5 text-[11px] text-tx2 hover:text-primary"
                        >
                          {c.role_title} · {c.company}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={threadEnd} />
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={`Ask RO${about}`}
          placeholder={started ? "Ask a follow-up…" : `Ask RO${about}…`}
          className="flex-1 rounded-lg border border-bd bg-surf px-3 py-2 text-sm text-tx outline-none placeholder:text-tx3 focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || q.trim().length < 3}
          className="rounded-md bg-primary px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy ? "RO's reading…" : started ? "Send" : "Ask"}
        </button>
      </form>

      {/* Chips: starter suggestions before the thread, follow-ups after each answer */}
      {!busy && (started ? latestFollowups : suggestions).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(started ? latestFollowups : suggestions).map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="rounded-full border border-bd bg-surf px-2.5 py-1 text-xs text-tx2 hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-[13px] text-warn">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-bd pt-4">
        <Link
          href="/login?next=/onboarding"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white"
        >
          Share your profile → see your fit
        </Link>
        <span className="text-[11px] text-tx3">RO scores your fit on every role.</span>
      </div>
    </div>
  );
}
