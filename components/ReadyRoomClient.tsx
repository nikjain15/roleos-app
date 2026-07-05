"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReadyCard } from "@/lib/ready-room";

/**
 * X10 — the ready-room's card stack. One card, one decision:
 *   A · Approve & apply  (clean drafts only — approves, then opens the SEND page)
 *   E · Needs work       (back to drafting + the editor; the only path for flagged drafts)
 *   S · Skip             (application → withdrawn; the match and draft survive)
 * Keyboard-first, aria-live progress, no countdowns, no guilt. Leaving loses
 * nothing — the queue is FIFO and picks up where you left it.
 */
export default function ReadyRoomClient({ initialCards }: { initialCards: ReadyCard[] }) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [reviewed, setReviewed] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const total = initialCards.length;
  const card = cards[0] ?? null;

  const advance = useCallback(() => {
    setCards((c) => c.slice(1));
    setReviewed((r) => r + 1);
    setErr(null);
  }, []);

  const act = useCallback(
    async (action: "approve" | "edit" | "skip") => {
      if (!card || busy) return;
      setBusy(action);
      setErr(null);
      try {
        if (action === "approve") {
          if (!card.approvable && !card.alreadyApproved) return; // flagged → editor only
          if (!card.alreadyApproved) {
            const res = await fetch(`/api/artifact/${card.artifactId}/decision`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "approve" }),
            });
            if (!res.ok) throw new Error("approve failed");
          }
          router.push(`/apply/${card.artifactId}`);
          return; // the send moment happens there, per item, by hand
        }
        if (action === "edit") {
          const res = await fetch("/api/applications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: card.applicationId, stage: "drafting" }),
          });
          if (!res.ok) throw new Error("stage move failed");
          router.push(`/studio/resume/${card.artifactId}`);
          return;
        }
        // skip — the application withdraws; the match + draft stay yours.
        const res = await fetch("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: card.applicationId, stage: "withdrawn" }),
        });
        if (!res.ok) throw new Error("skip failed");
        advance();
      } catch {
        setErr("That didn't stick — try again, or open it from the tracker.");
      } finally {
        setBusy(null);
      }
    },
    [card, busy, router, advance],
  );

  // Keyboard-first: A approve · E edit · S skip. Never captures typing fields.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key === "a" || e.key === "A") void act("approve");
      if (e.key === "e" || e.key === "E") void act("edit");
      if (e.key === "s" || e.key === "S") void act("skip");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act]);

  if (total === 0) {
    return (
      <section className="rounded-xl border border-bd bg-surf2 p-6" aria-label="Empty queue">
        <p className="text-[15px] text-tx">
          Nothing queued right now. Tonight I&apos;ll re-match you against the fresh corpus and
          pre-draft for your best new fits — that&apos;s the overnight hunt.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/tracker" className="font-medium text-info hover:underline">
            Check the hunt is on →
          </Link>
          <Link href="/roles" className="text-tx2 hover:underline">
            Or browse your shortlist →
          </Link>
        </div>
      </section>
    );
  }

  if (!card) {
    return (
      <section className="rounded-xl border border-bd bg-suc-bg p-6" aria-label="Queue complete">
        <p className="text-[15px] font-medium text-suc">
          Queue clear — {reviewed} reviewed. That&apos;s the whole morning ritual.
        </p>
        <Link href="/tracker" className="mt-2 inline-block text-sm text-info-tx underline">
          See where everything stands →
        </Link>
      </section>
    );
  }

  return (
    <section aria-label="Review queue">
      <p aria-live="polite" className="text-xs text-tx3">
        {reviewed + 1} of {total} · oldest first
      </p>

      <article className="mt-2 rounded-xl border border-bd bg-surf p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-lg font-semibold text-tx">
              {card.title} <span className="font-normal text-tx3">· {card.company}</span>
            </p>
            <p className="mt-0.5 flex flex-wrap gap-2 text-xs text-tx3">
              {card.fit !== null && <span className="font-mono">fit {Math.round(card.fit)}</span>}
              {card.score && (
                <span className="font-mono">
                  score {card.score.score} · {card.score.likelihood}
                </span>
              )}
              {card.fromHunt && <span className="rounded bg-info-bg px-1.5 py-0.5 text-info-tx">from last night&apos;s hunt</span>}
            </p>
          </div>
        </div>

        {card.why && <p className="mt-3 text-[14px] text-tx2">{card.why}</p>}

        {card.summary && (
          <div className="mt-3 rounded-lg bg-surf2 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">The drafted résumé opens with</p>
            <p className="mt-1 text-[14px] text-tx2">{card.summary}</p>
            {card.bullets.length > 0 && (
              <ul className="mt-1.5 list-disc pl-5 text-[13px] text-tx2">
                {card.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {card.truthFlags.length > 0 && (
          <div className="mt-3 rounded-lg border-l-[3px] border-warn bg-warn-bg p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-warn">
              Needs your eyes — I flagged these before it can go anywhere
            </p>
            <ul className="mt-1 list-disc pl-4 text-[13px] text-tx2">
              {card.truthFlags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {card.approvable || card.alreadyApproved ? (
            <button
              onClick={() => act("approve")}
              disabled={!!busy}
              className="min-h-10 rounded-md bg-info px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "approve" ? "Opening…" : card.alreadyApproved ? "Continue to apply (A)" : "Approve & apply (A)"}
            </button>
          ) : (
            <span className="inline-flex min-h-10 items-center rounded-md border border-warn px-3 text-xs text-warn">
              Flagged — review it in the editor first
            </span>
          )}
          <button
            onClick={() => act("edit")}
            disabled={!!busy}
            className="min-h-10 rounded-md border border-bd px-4 text-sm text-tx2 disabled:opacity-50"
          >
            {busy === "edit" ? "Opening…" : "Needs work (E)"}
          </button>
          <button
            onClick={() => act("skip")}
            disabled={!!busy}
            className="min-h-10 rounded-md border border-bd px-4 text-sm text-tx2 disabled:opacity-50"
          >
            {busy === "skip" ? "Skipping…" : "Skip (S)"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-tx3">
          Skipping withdraws the application — the match and the draft stay yours. Nothing sends
          without your click on the next page.
        </p>
        {err && (
          <p role="alert" className="mt-2 text-xs text-dng">
            {err}
          </p>
        )}
      </article>
    </section>
  );
}
