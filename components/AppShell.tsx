import Link from "next/link";
import type { ReactNode } from "react";

/**
 * App-shell scaffold (Slice T). The single frame every authenticated screen will
 * drop into — a skip link, a primary nav, and a bounded content column. Slices
 * 2–7 render their screens as `children`; Slice 10 does the full responsive/a11y
 * polish and wires it into an `(app)` route-group layout. Kept presentational
 * (no data fetching) so it's safe to adopt incrementally without touching routes.
 *
 * a11y baked in from day one (so later slices inherit, not retrofit):
 *  - skip-to-content link, semantic <nav>/<main>, aria-current on the active tab,
 *  - tap targets ≥ 40px, no horizontal overflow at 375px (nav scrolls, body doesn't).
 */
export interface NavItem {
  href: string;
  label: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/feed", label: "Feed" },
  { href: "/roles", label: "Roles" },
  { href: "/tracker", label: "Tracker" },
  { href: "/studio", label: "Studio" },
  { href: "/the-index", label: "Explore" },
];

export function AppShell({
  children,
  active,
  nav = PRIMARY_NAV,
}: {
  children: ReactNode;
  /** href of the current screen, for aria-current + active styling */
  active?: string;
  nav?: NavItem[];
}) {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--tx)]">
      <a
        href="#app-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-[var(--surf)] focus:px-3 focus:py-2 focus:text-[var(--tx)] focus:shadow"
      >
        Skip to content
      </a>

      <header className="border-b border-[var(--bd)] bg-[var(--surf)]">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 sm:px-4">
          <Link
            href="/feed"
            className="flex min-h-10 items-center font-semibold tracking-tight text-[var(--tx)]"
          >
            RoleOS
          </Link>
          <nav aria-label="Primary" className="-mx-1 flex-1 overflow-x-auto">
            <ul className="flex items-center gap-1">
              {nav.map((item) => {
                const isActive = active === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={[
                        "flex min-h-10 items-center whitespace-nowrap rounded-md px-3 text-sm",
                        isActive
                          ? "bg-[var(--surf2)] font-medium text-[var(--tx)]"
                          : "text-[var(--tx2)] hover:bg-[var(--surf2)] hover:text-[var(--tx)]",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

      <main id="app-content" className="mx-auto max-w-5xl px-3 py-6 sm:px-4">
        {children}
      </main>
    </div>
  );
}
