"use client";

/**
 * Root layout error boundary (slice H1). Fires only when the root layout itself
 * fails, so it must render its own <html>. Bare inline styles — the CSS
 * pipeline may be part of what broke.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error("global-error-boundary", { message: error.message, digest: error.digest });
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700 }}>RoleOS hit an unexpected error.</h1>
        <p style={{ marginTop: "0.75rem", color: "#555" }}>
          Your data is safe. Reload the page — if this keeps happening, it&apos;s on us and we&apos;re on it.
        </p>
        <button
          onClick={reset}
          style={{ marginTop: "1.5rem", padding: "0.6rem 1.2rem", borderRadius: 6, border: "1px solid #ccc", cursor: "pointer" }}
        >
          Reload
        </button>
        {error.digest && <p style={{ marginTop: "1.5rem", fontSize: 12, color: "#999" }}>ref: {error.digest}</p>}
      </body>
    </html>
  );
}
