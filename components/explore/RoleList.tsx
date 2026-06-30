import Link from "next/link";
import type { RoleLite } from "@/lib/explore";

/**
 * Renders a curated-first list of roles (docs/explore-index.md). Seed roles show
 * their extracted depth; thin ingested (`ats`) roles are badged honestly so we
 * never imply a freshly-hunted posting is fully analyzed.
 */
export default function RoleList({ roles }: { roles: RoleLite[] }) {
  if (roles.length === 0) {
    return <p className="text-sm text-tx3">No open roles in the Index here right now.</p>;
  }
  return (
    <ul className="divide-y divide-bd overflow-hidden rounded-xl border border-bd">
      {roles.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-4 bg-surf px-4 py-3">
          <div className="min-w-0">
            <Link href={`/explore/posting/${r.id}`} className="block truncate text-sm font-medium text-tx hover:text-info">
              {r.role_title}
            </Link>
            <p className="mt-0.5 truncate text-xs text-tx3">
              {r.company}
              {r.location?.name ? ` · ${r.location.name}` : ""}
              {r.archetype ? ` · ${r.archetype}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {r.source === "ats" ? (
              <span className="rounded-full bg-surf2 px-2 py-0.5 text-[10px] text-tx3" title="Freshly hunted from the company board — lighter detail than the curated set">
                freshly hunted
              </span>
            ) : (
              <span className="rounded-full bg-surf2 px-2 py-0.5 text-[10px] text-tx3" title="Fully read — requirements extracted verbatim">
                {r.mustHavesCount} reqs
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
