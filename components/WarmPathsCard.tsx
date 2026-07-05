"use client";

import { useState } from "react";
import Link from "next/link";
import type { WarmPath } from "@/lib/connections";

/**
 * X6 — warm paths into THIS role's company, from the user's own people, with a
 * one-click truth-gated intro-ask draft. The draft opens in the user's OWN
 * email (mailto handoff) or copies to clipboard — RO never sends anything.
 */
interface Draft {
  subject?: string;
  body?: string;
  truth_note?: string;
}

export default function WarmPathsCard({ roleId, paths }: { roleId: string; paths: WarmPath[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { draft: Draft; status: string; flags: string[]; email: string | null }>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function draftAsk(connectionId: string) {
    setBusy(connectionId);
    setErr(null);
    try {
      const res = await fetch("/api/intro-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, roleId }),
      });
      const j = (await res.json()) as {
        content?: Draft;
        status?: string;
        truth?: { ok?: boolean; violations?: unknown[] } | null;
        email?: string | null;
        error?: string;
      };
      if (res.ok && j.content) {
        setDrafts((d) => ({
          ...d,
          [connectionId]: {
            draft: j.content!,
            status: j.status ?? "draft",
            flags:
              j.truth && j.truth.ok === false && Array.isArray(j.truth.violations)
                ? j.truth.violations.map((v) => String(v))
                : [],
            email: j.email ?? null,
          },
        }));
      } else {
        setErr(j.error ?? "Couldn't draft that ask.");
      }
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function copy(connectionId: string, d: Draft) {
    try {
      await navigator.clipboard.writeText(`${d.subject ?? ""}\n\n${d.body ?? ""}`.trim());
      setCopied(connectionId);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable — the text is on screen to select */
    }
  }

  return (
    <section className="rounded-xl border border-bd bg-surf p-4" aria-label="Warm paths in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Warm paths in</h2>
        <Link href="/connections" className="text-xs text-info-tx underline">
          Manage your people →
        </Link>
      </div>

      {paths.length === 0 ? (
        <p className="mt-2 text-[13px] text-tx2">
          No one in your list works here (yet). A referral multiplies your odds —{" "}
          <Link href="/connections" className="font-medium text-info hover:underline">
            add your people
          </Link>{" "}
          and I&apos;ll spot the path next time.
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {paths.map((p) => {
            const d = drafts[p.connection.id];
            return (
              <li key={p.connection.id} className="rounded-lg border border-bd p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] text-tx2">{p.evidence}</p>
                  {!d && (
                    <button
                      onClick={() => draftAsk(p.connection.id)}
                      disabled={busy !== null}
                      className="min-h-9 rounded-md border border-bd px-2.5 text-xs font-medium text-tx2 disabled:opacity-50"
                    >
                      {busy === p.connection.id ? "Drafting…" : "Draft the ask"}
                    </button>
                  )}
                </div>

                {d && (
                  <div className="mt-2 rounded-md bg-surf2 p-2.5">
                    {d.flags.length > 0 && (
                      <div className="mb-2 rounded-md border-l-[3px] border-warn bg-warn-bg p-2 text-xs text-warn">
                        <p className="font-semibold">Needs your eyes before it goes anywhere:</p>
                        <ul className="mt-1 list-disc pl-4">
                          {d.flags.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-tx">{d.draft.subject}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-tx2">{d.draft.body}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {d.email && (
                        <a
                          href={`mailto:${encodeURIComponent(d.email)}?subject=${encodeURIComponent(
                            d.draft.subject ?? "",
                          )}&body=${encodeURIComponent(d.draft.body ?? "")}`}
                          className="min-h-9 rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white"
                        >
                          Open in your email →
                        </a>
                      )}
                      <button
                        onClick={() => copy(p.connection.id, d.draft)}
                        className="min-h-9 rounded-md border border-bd px-3 text-xs text-tx2"
                      >
                        {copied === p.connection.id ? "Copied ✓" : "Copy the ask"}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-tx3">
                      Edit it to sound like you — then it goes out from your hands, never mine.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {err && (
        <p role="alert" className="mt-2 text-xs text-dng">
          {err}
        </p>
      )}
    </section>
  );
}
