import Link from "next/link";

/**
 * Shared chrome for the public /index Explore pages (docs/explore-index.md).
 * Server component. Breadcrumb + the convert CTA — every Explore page is top of
 * the funnel, so the "hand RO your hunt" door is always one click away.
 */
export default function ExploreHeader({ crumbs }: { crumbs?: Array<{ label: string; href?: string }> }) {
  return (
    <header className="border-b border-bd">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/explore" className="inline-flex items-center gap-2 text-sm font-semibold">
          <span className="rounded-md bg-info px-2 py-0.5 text-[13px] text-white">RO</span>
          RoleOS
          <span className="ml-1 text-tx3">· the Index</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/explore/companies" className="text-tx3 hover:text-info">Companies</Link>
          <Link href="/explore/roles" className="text-tx3 hover:text-info">Role types</Link>
          <Link
            href="/login?next=/onboarding"
            className="rounded-md bg-info px-3 py-1.5 text-xs font-medium text-white"
          >
            Hand RO your hunt
          </Link>
        </div>
      </div>
      {crumbs && crumbs.length > 0 && (
        <div className="mx-auto max-w-5xl px-6 pb-3 text-xs text-tx3">
          {crumbs.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="px-1.5">/</span>}
              {c.href ? (
                <Link href={c.href} className="hover:text-info">
                  {c.label}
                </Link>
              ) : (
                <span className="text-tx2">{c.label}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
