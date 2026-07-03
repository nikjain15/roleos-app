"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * App-level error boundary (slice H1). An unexpected render/data error shows an
 * honest recovery screen instead of a blank page — always a way forward (retry
 * + back to the feed). The error is logged client-side; Workers Logs capture
 * the server side of the same failure.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("app-error-boundary", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto max-w-xl px-6 py-20 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tx3">Something broke</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-tx">That one&apos;s on us, not you.</h1>
      <p className="mt-3 text-[15px] text-tx2">
        The page hit an unexpected error. Your data is safe — try again, or head back to your feed.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button onClick={reset} className="min-h-11 rounded-md bg-info px-4 text-sm font-medium text-white">
          Try again
        </button>
        <Link href="/feed" className="min-h-11 rounded-md border border-bd px-4 py-2.5 text-sm text-tx2">
          Back to the feed
        </Link>
      </div>
      {error.digest && <p className="mt-6 font-mono text-xs text-tx3">ref: {error.digest}</p>}
    </main>
  );
}
