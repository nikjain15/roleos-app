"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * After sign-in, if the user came from onboarding there's pending work in
 * sessionStorage. Persist it once (via /api/save, RLS-scoped), clear it, and
 * refresh the feed to show the saved matches. No-op if nothing pending.
 */
export default function SaveOnboarding() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const raw = sessionStorage.getItem("roleos.pending");
    if (!raw) return;
    sessionStorage.removeItem("roleos.pending");
    (async () => {
      try {
        const res = await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: raw,
        });
        if (res.ok) router.refresh();
      } catch {
        /* best-effort; the user can re-run onboarding */
      }
    })();
  }, [router]);

  return null;
}
