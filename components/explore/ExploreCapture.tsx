"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { parseThread, THREAD_STORAGE_KEY } from "@/lib/explore-thread";

/**
 * Invisible. On any authenticated page, if the visitor has an Explore chat
 * thread saved in this browser, carry it into their taste model once (the
 * questions they asked before signing up). Server-side is first-auth idempotent;
 * we also flag it locally per-user so we don't re-POST on every navigation.
 */
const CAPTURED_KEY = "roleos.explore_captured";

export default function ExploreCapture() {
  useEffect(() => {
    (async () => {
      let turns: ReturnType<typeof parseThread>;
      try {
        turns = parseThread(window.localStorage.getItem(THREAD_STORAGE_KEY));
      } catch {
        return; // storage blocked
      }
      if (!turns || turns.length === 0) return;

      const { data } = await supabaseBrowser().auth.getUser();
      if (!data.user) return;
      try {
        if (window.localStorage.getItem(CAPTURED_KEY) === data.user.id) return;
      } catch {
        /* ignore */
      }

      const res = await fetch("/api/explore/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turns: turns.map((t) => ({ q: t.q, cited: (t.cited ?? []).map((c) => ({ id: c.id })) })),
        }),
      });
      if (res.ok) {
        try {
          window.localStorage.setItem(CAPTURED_KEY, data.user.id);
        } catch {
          /* ignore */
        }
      }
    })().catch(() => {});
  }, []);

  return null;
}
