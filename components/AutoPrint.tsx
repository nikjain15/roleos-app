"use client";

import { useEffect } from "react";

/**
 * Opens the browser's print dialog once the print view has mounted (Slice 1 PDF
 * export = client print-to-PDF; no headless Chrome on the Workers runtime). The
 * user picks "Save as PDF" — selectable text, ATS-safe. A visible button is
 * rendered too, so it works even if the auto-trigger is blocked.
 */
export default function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <button
      onClick={() => window.print()}
      className="no-print mb-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white"
    >
      Print / Save as PDF
    </button>
  );
}
