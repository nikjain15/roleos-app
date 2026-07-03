import type { ReactNode } from "react";
import RoDock from "@/components/RoDock";

/**
 * Layout for the authenticated app group — mounts the RO-everywhere dock (Slice 7)
 * on every screen in this group. The dock self-hides on pre-auth surfaces (/login,
 * /onboarding). Kept minimal (no nav chrome — the full app shell is Slice 10) so it
 * doesn't change how existing pages render.
 */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <RoDock />
    </>
  );
}
