"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * RO-everywhere dock (Slice 7) — a floating ask/act layer on every authenticated
 * screen. Ask about your hunt; RO answers from your real state (via /api/ro/ask,
 * grounded) and can point you to ONE next screen. It never sends or acts — actions
 * are links you click (human-gated). a11y: dialog semantics, Escape to close, focus
 * moves to the input on open, ≥44px trigger. Self-hides on pre-auth surfaces.
 */
const HIDE_ON = ["/login", "/onboarding"];

type Action = { label: string; href: string };

export default function RoDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setAction(null);
    try {
      const res = await fetch("/api/ro/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, screen: pathname }),
      });
      const data = (await res.json()) as { answer?: string; action?: Action | null; error?: string };
      if (!res.ok) setError(data.error ?? "RO couldn't answer that one.");
      else {
        setAnswer(data.answer ?? "");
        setAction(data.action ?? null);
      }
    } catch {
      setError("Network hiccup — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask RO about your hunt"
          className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-info text-sm font-bold text-white shadow-lg hover:opacity-90"
        >
          RO
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Ask RO"
          className="fixed bottom-4 right-4 z-40 flex max-h-[80vh] w-[calc(100vw-2rem)] max-w-sm flex-col rounded-xl border border-bd bg-surf shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-bd px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-tx">
              <span className="rounded bg-info px-1.5 py-0.5 text-[11px] text-white">RO</span>
              Ask me anything
            </span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-tx3 hover:text-tx">
              ✕
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {!answer && !busy && !error && (
              <p className="text-[13px] text-tx2">
                Ask about your goal, pace, or pipeline — &quot;am I on track?&quot;, &quot;what should I do
                next?&quot;, &quot;how many have I applied to?&quot; I answer from your real state.
              </p>
            )}
            {busy && <p className="text-[13px] text-tx3">RO&apos;s looking…</p>}
            {error && <p className="text-[13px] text-warn">{error}</p>}
            {answer && (
              <div>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-tx">{answer}</p>
                {action && (
                  <Link
                    href={action.href}
                    onClick={() => setOpen(false)}
                    className="mt-3 inline-flex min-h-9 items-center rounded-md bg-info px-3 text-xs font-medium text-white"
                  >
                    {action.label} →
                  </Link>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
              setQ("");
            }}
            className="flex gap-2 border-t border-bd p-3"
          >
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Ask RO"
              placeholder="Ask RO…"
              className="min-h-10 flex-1 rounded-md border border-bd bg-surf2 px-3 text-sm text-tx outline-none focus:border-info"
            />
            <button
              type="submit"
              disabled={busy || q.trim().length < 2}
              className="min-h-10 rounded-md bg-info px-3 text-xs font-medium text-white disabled:opacity-40"
            >
              Ask
            </button>
          </form>
        </div>
      )}
    </>
  );
}
