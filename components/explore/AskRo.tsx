"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import {
  parseThread,
  serializeThread,
  THREAD_STORAGE_KEY,
  type AskTurn as Turn,
  type CitedRole as Cited,
} from "@/lib/explore-thread";

/**
 * Conversational "Ask RO about the Index" — a real chat surface (rebuilt on the
 * J1 design system). Your messages sit right; RO answers on the left with her
 * avatar and a live typing indicator while she reads. Answers are grounded by
 * `/api/explore/ask` (index_qa) — RO never invents — with cited roles + follow-ups.
 *
 * Memory: the thread persists across page loads (localStorage, browser-only for
 * anon visitors — validated, capped, clearable) and the last turns ride along as
 * context so follow-ups actually follow up. The convert door stays in view.
 */
type Scope = { company?: string; archetype?: string };

function Avatar() {
  return (
    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-overline font-bold text-white">
      RO
    </span>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="RO is reading">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-tx3"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

// Inline **bold** → <strong> (React-escaped; no HTML injection).
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    return m ? (
      <strong key={i} className="font-semibold text-tx">{m[1]}</strong>
    ) : (
      <span key={i}>{p}</span>
    );
  });
}

// Minimal markdown for chat answers: paragraphs, bullet lists, bold, line breaks.
function Answer({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2.5 text-body leading-relaxed text-tx">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const isList = lines.length > 0 && lines.every((l) => /^\s*[-•*]\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="ml-1 space-y-1">
              {lines.map((l, li) => (
                <li key={li} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-tx3" />
                  <span>{inline(l.replace(/^\s*[-•*]\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {block.split("\n").map((l, li, arr) => (
              <span key={li}>
                {inline(l)}
                {li < arr.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function CitedRoles({ cited }: { cited: Cited[] }) {
  if (cited.length === 0) return null;
  return (
    <div className="mt-3 border-t border-bd pt-3">
      <p className="mb-1.5 text-overline font-semibold uppercase text-tx3">Roles RO looked at</p>
      <div className="flex flex-wrap gap-1.5">
        {cited.map((c) => (
          <Link
            key={c.id}
            href={`/explore/posting/${c.id}`}
            className="rounded-full bg-surf2 px-2.5 py-0.5 text-small text-tx2 transition-colors hover:text-primary"
          >
            {c.role_title} · {c.company}
          </Link>
        ))}
      </div>
    </div>
  );
}

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
  const [pending, setPending] = useState<string | null>(null); // in-flight question (shown instantly)
  const [error, setError] = useState<string | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);
  const about = label ? ` about ${label}` : " about the Index";

  const scrollToEnd = () =>
    setTimeout(() => threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);

  // Restore the thread after mount (hydration-safe), persist on change.
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
    setPending(text);
    scrollToEnd();
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
        scrollToEnd();
      }
    } catch {
      setError("Network hiccup — try again.");
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  const started = turns.length > 0;
  const latestFollowups = started ? turns[turns.length - 1].followups : [];
  const chips = busy ? [] : started ? latestFollowups : suggestions;

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-bd bg-surf2">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-bd px-5 py-4">
        <Avatar />
        <div className="flex-1">
          <p className="font-display text-h3 font-semibold text-tx">Ask RO{about}</p>
          <p className="mt-0.5 text-small leading-relaxed text-tx2">
            She answers from what she&apos;s actually read — requirements, who sponsors visas, what they pay when
            they say. Ask follow-ups; she remembers the thread.
          </p>
        </div>
        {started && (
          <button onClick={clearThread} className="shrink-0 text-small text-tx3 underline hover:text-tx">
            clear
          </button>
        )}
      </div>

      {/* Conversation */}
      <div className="px-5 py-4">
        {started && (
          <p className="mb-3 text-center text-overline text-tx3">
            Picking up where you left off — saved in this browser only
          </p>
        )}
        <div className="space-y-4">
          {turns.map((t, i) => (
            <div key={i} className="space-y-2.5">
              {/* You */}
              <div className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-body leading-relaxed text-white">
                  {t.q}
                </p>
              </div>
              {/* RO */}
              <div className="flex gap-2.5">
                <Avatar />
                <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-surf px-4 py-3 shadow-sm">
                  <Answer text={t.a} />
                  <CitedRoles cited={t.cited} />
                </div>
              </div>
            </div>
          ))}

          {/* In-flight: your message + RO typing */}
          {pending && (
            <div className="space-y-2.5">
              <div className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-body leading-relaxed text-white">
                  {pending}
                </p>
              </div>
              <div className="flex gap-2.5">
                <Avatar />
                <div className="rounded-2xl rounded-tl-md bg-surf px-4 py-3 shadow-sm">
                  <TypingDots />
                </div>
              </div>
            </div>
          )}
          <div ref={threadEnd} />
        </div>

        {error && <p className="mt-3 text-small text-warn-tx">{error}</p>}

        {/* Chips */}
        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                className="rounded-full border border-bd bg-surf px-3 py-1.5 text-small text-tx2 transition-colors hover:border-primary hover:text-primary"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
          className="mt-4 flex items-center gap-2 rounded-xl border border-bd bg-surf px-2 py-1.5 shadow-sm transition-shadow focus-within:border-primary focus-within:shadow-ring"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={`Ask RO${about}`}
            placeholder={started ? "Ask a follow-up…" : `Ask RO${about}…`}
            className="flex-1 bg-transparent px-2 py-1.5 text-body text-tx outline-none placeholder:text-tx3"
          />
          <Button type="submit" size="sm" disabled={busy || q.trim().length < 3}>
            {busy ? "Reading…" : "Send"}
          </Button>
        </form>
      </div>

      {/* Convert door */}
      <div className="flex flex-wrap items-center gap-3 border-t border-bd bg-surf px-5 py-3">
        <Link
          href="/onboarding"
          className="rounded-lg bg-primary px-3.5 py-2 text-small font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          Share your profile → see your fit
        </Link>
        <span className="text-small text-tx3">RO scores your fit on every role.</span>
      </div>
    </div>
  );
}
