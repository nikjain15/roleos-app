"use client";

import { useState } from "react";
import Link from "next/link";
import type { CompanyRow } from "@/lib/explore";

/** Client-side searchable company grid for /explore/companies. */
export default function CompanyGrid({ companies }: { companies: CompanyRow[] }) {
  const [q, setQ] = useState("");
  const filtered = q
    ? companies.filter((c) => c.company.toLowerCase().includes(q.toLowerCase()))
    : companies;

  return (
    <>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search companies…"
        className="mb-4 w-full rounded-lg border border-bd bg-surf px-3 py-2 text-sm text-tx outline-none placeholder:text-tx3 focus:border-info"
      />
      <p className="mb-3 text-xs text-tx3">{filtered.length} of {companies.length}</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/explore/company/${c.slug}`}
              className="flex items-center justify-between rounded-lg border border-bd bg-surf px-4 py-3 hover:bg-surf2"
            >
              <span className="min-w-0 truncate text-sm font-medium text-tx">{c.company}</span>
              <span className="shrink-0 text-xs text-tx3">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
