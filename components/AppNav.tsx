"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOut from "@/components/SignOut";

/**
 * The single app nav (Slice 10) — one consistent header across every authenticated
 * screen (replaces the per-page mini-headers). Wires the Slice-T app-shell scaffold
 * with live active-state. Self-hides on pre-auth surfaces. Responsive: the primary
 * links scroll horizontally on mobile while the page body never does; ≥40px targets,
 * skip link, semantic <nav>, aria-current on the active tab.
 */
const HIDE_ON = ["/login", "/start"];

// IA (docs/specs — nav restructure 2026-07-26): fewer, clearer tabs + a real
// home for the craft tools (Studio). Goal + Profile live under Settings; Explore
// (the public index) is reachable from Roles, not a top tab.
const NAV = [
  { href: "/feed", label: "Today" },
  { href: "/roles", label: "Roles" },
  { href: "/studio", label: "Studio" },
  { href: "/tracker", label: "Tracker" },
];

export default function AppNav() {
  const pathname = usePathname();
  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <a
        href="#app-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-[var(--surf)] focus:px-3 focus:py-2 focus:text-[var(--tx)] focus:shadow"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-bd bg-surf/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 sm:px-4">
          <Link href="/feed" className="flex min-h-11 shrink-0 items-center gap-1.5 font-semibold text-tx">
            <span className="rounded-md bg-primary px-1.5 py-0.5 text-[12px] text-white">RO</span>
            <span className="hidden sm:inline">RoleOS</span>
          </Link>

          <nav aria-label="Primary" className="-mx-1 flex-1 overflow-x-auto">
            <ul className="flex items-center gap-0.5">
              {NAV.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm",
                        active
                          ? "bg-surf2 font-medium text-tx"
                          : "text-tx2 hover:bg-surf2 hover:text-tx",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link href="/settings" className="hidden text-xs text-tx2 hover:text-primary sm:inline">
              Settings
            </Link>
            <SignOut />
          </div>
        </div>
      </header>
    </>
  );
}
