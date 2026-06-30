"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Live anon "Ask RO about the Index" (docs/explore-index.md Phase 2). Calls
 * /api/explore/ask grounded in the page's scope, shows the grounded answer + cited
 * roles, and always keeps the convert door (share profile → your fit) in view.
 */
type Scope = { company?: string; archetype?: string };
type Cited = { id: string; company: string; role_title: string };

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
  const [answer, setAnswer] = useState<string | null>(null);
  const [cited, setCited] = useState<Cited[]>([]);
  const [error, setError] = useState<string | null>(null);
  const about = label ? ` about ${label}` : " about the Index";

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setCited([]);
    try {
      const res = await fetch("/api/explore/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, scope }),
      });
      const data = (await res.json()) as { answer?: string; cited?: Cited[]; error?: string };
      if (!res.ok) setError(data.error ?? "RO couldn't answer that one.");
      else {
        setAnswer(data.answer ?? "");
        setCited(data.cited ?? []);
      }
    } catch {
      setError("Network hiccup — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-bd bg-surf2 p-5">
      <p className="text-sm font-semibold text-tx">Ask RO{about}</p>
      <p className="mt-1 text-[13px] text-tx2">
        RO answers from what it&apos;s actually read — requirements, who sponsors visas, what they pay when they say.
      </p>

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
          placeholder={`Ask RO${about}…`}
          className="flex-1 rounded-lg border border-bd bg-surf px-3 py-2 text-sm text-tx outline-none placeholder:text-tx3 focus:border-info"
        />
        <button
          type="submit"
          disabled={busy || q.trim().length < 3}
          className="rounded-md bg-info px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy ? "RO's reading…" : "Ask"}
        </button>
      </form>

      {suggestions.length > 0 && !answer && !busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQ(s);
                ask(s);
              }}
              className="rounded-full border border-bd bg-surf px-2.5 py-1 text-xs text-tx2 hover:text-info"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-[13px] text-warn">{error}</p>}

      {answer && (
        <div className="mt-4 rounded-lg border border-bd bg-surf p-4">
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-tx">{answer}</p>
          {cited.length > 0 && (
            <div className="mt-3 border-t border-bd pt-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-tx3">Roles RO looked at</p>
              <div className="flex flex-wrap gap-1.5">
                {cited.map((c) => (
                  <Link
                    key={c.id}
                    href={`/explore/posting/${c.id}`}
                    className="rounded-full bg-surf2 px-2 py-0.5 text-[11px] text-tx2 hover:text-info"
                  >
                    {c.role_title} · {c.company}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-bd pt-4">
        <Link href="/login?next=/onboarding" className="rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white">
          Share your profile → see your fit
        </Link>
        <span className="text-[11px] text-tx3">RO scores your fit on every role.</span>
      </div>
    </div>
  );
}
