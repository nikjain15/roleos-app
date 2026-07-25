import type { ReactNode } from "react";
import RoDock from "@/components/RoDock";
import AppNav from "@/components/AppNav";
import ExploreCapture from "@/components/explore/ExploreCapture";

/**
 * Layout for the authenticated app group (Slice 10) — the single app shell: one nav
 * (`AppNav`) across every screen + the RO-everywhere dock (Slice 7). Both self-hide
 * on pre-auth surfaces (/login, /start). `#app-content` is the skip-link target.
 */
export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppNav />
      <div id="app-content">{children}</div>
      <ExploreCapture />
      <RoDock />
    </>
  );
}
