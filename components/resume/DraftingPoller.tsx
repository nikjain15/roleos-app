"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls a `drafting` artifact's status while RO drafts it in the background, and
 * reloads the studio the moment it's ready (or errored). Turns a 2-minute wait on
 * a button into a live "RO is drafting…" state the user can watch — or navigate
 * away from and come back to. No model call; a cheap status read every few seconds.
 * Résumé copy by default; pass `title`/`stages` for other artifact types (covers).
 */
const RESUME_STAGES = [
  "Reading the posting…",
  "Mapping your experience to it…",
  "Writing your tailored bullets…",
  "Truth-checking every line…",
  "Almost there…",
];

export default function DraftingPoller({
  id,
  title = "RO is drafting your résumé…",
  stages = RESUME_STAGES,
}: {
  id: string;
  title?: string;
  stages?: string[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState(0);
  const kicked = useRef(false);

  useEffect(() => {
    // Kick off the actual draft ONCE (a reload's soft lock + idempotency guard on
    // the route means this is safe to fire again on remount).
    if (!kicked.current) {
      kicked.current = true;
      fetch(`/api/artifact/${id}/draft`, { method: "POST" })
        .then((r) => r.json())
        .then((j: { status?: string }) => {
          if (j.status && j.status !== "drafting") router.refresh();
        })
        .catch(() => {
          /* the poll below still catches completion */
        });
    }

    const cycle = setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), 14_000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/artifact/${id}/status`);
        if (!res.ok) return;
        const { status } = (await res.json()) as { status?: string };
        if (status && status !== "drafting") {
          clearInterval(poll);
          clearInterval(cycle);
          router.refresh(); // the draft is ready (or errored) — re-render the page
        }
      } catch {
        /* transient — keep polling */
      }
    }, 3000);
    return () => {
      clearInterval(poll);
      clearInterval(cycle);
    };
  }, [id, router, stages.length]);

  return (
    <div className="mt-8 rounded-xl border border-bd bg-surf p-8 text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-bd border-t-primary" />
      <p className="mt-4 text-body font-medium text-tx">{title}</p>
      <p aria-live="polite" className="mt-1 text-small text-tx2">
        {stages[stage]}
      </p>
      <p className="mt-3 text-small text-tx3">
        This takes a minute or two — RO is grounding every line to your real experience. Hang tight.
      </p>
    </div>
  );
}
