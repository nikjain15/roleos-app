"use client";

import { useState } from "react";
import Link from "next/link";
import { NOT_COVERED_BY_DELETE } from "@/lib/account-delete";

/**
 * The delete control (settings). Calls POST /api/account/delete, which removes
 * every row the signed-in user owns and then their auth record.
 *
 * The copy is deliberately unglamorous. It says what goes, it says what stays,
 * and the "what stays" list is IMPORTED from the same module the route deletes
 * from, so the screen cannot claim a cleaner sweep than the code performs. RO's
 * voice is warm everywhere else; here it is plain, because this is the one
 * screen where reassurance would be the wrong thing to optimise for.
 */
export default function DeleteMyData() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        failed?: { table: string; error: string }[];
      };
      if (res.ok && body.ok) {
        setResult({ ok: true, message: "Deleted. Signing you out." });
        setTimeout(() => window.location.replace("/"), 1500);
      } else {
        const missed = (body.failed ?? []).map((f) => f.table).join(", ");
        setResult({
          ok: false,
          message: missed
            ? `Partly done. These did not delete: ${missed}. Nothing was silently skipped, and the rest is gone. Contact Nik so the remainder is removed by hand.`
            : "That did not go through. Nothing was deleted. Try again, or contact Nik.",
        });
      }
    } catch {
      setResult({ ok: false, message: "That did not go through. Nothing was deleted." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-bd bg-surf p-5">
      <p className="text-sm font-semibold text-tx">Delete everything I hold about you</p>
      <p className="mt-2 text-sm leading-relaxed text-tx2">
        This removes your profile and CV text, your matches, every résumé and cover letter I drafted,
        your tracker, your goals, your notes, your uploaded connections, everything I have remembered
        about you, your decision history, your notifications, your Google token if you connected one,
        and your settings. Then it deletes your login, so that email can no longer sign in to this
        account. It runs immediately. There is no grace period and no undo.
      </p>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-tx3">What it does not reach</p>
      <ul className="mt-2 space-y-1.5">
        {NOT_COVERED_BY_DELETE.map((line) => (
          <li key={line} className="flex gap-2 text-xs leading-relaxed text-tx3">
            <span aria-hidden>·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-tx3">
        The full picture, including backups, is in the{" "}
        <Link href="/privacy" className="underline underline-offset-2">privacy notice</Link>.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-5 rounded-md border border-dng px-4 py-2 text-sm font-medium text-dng"
        >
          Delete my data
        </button>
      ) : (
        <div className="mt-5 border-t border-bd pt-4">
          <label htmlFor="confirm-delete" className="block text-sm text-tx2">
            Type <span className="font-mono font-semibold text-tx">DELETE</span> to confirm.
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              id="confirm-delete"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              className="rounded-md border border-bd bg-surf2 px-3 py-2 font-mono text-sm text-tx"
            />
            <button
              onClick={run}
              disabled={confirm !== "DELETE" || busy}
              className="rounded-md bg-dng px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete everything"}
            </button>
            <button
              onClick={() => { setOpen(false); setConfirm(""); setResult(null); }}
              className="text-sm text-tx3"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <p role="alert" className={`mt-4 text-sm ${result.ok ? "text-suc" : "text-dng"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
