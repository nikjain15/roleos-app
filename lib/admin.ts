import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * The admin gate (journey.html §8 / architecture.md §3.3). RBAC is a single
 * `profiles.role` flag; admin is a superset of user. THE REAL LOCK is this
 * server-side re-check — RLS guards the data, this guards the route. UI hiding
 * is only convenience. `role` is immutable to users (column trigger), so this
 * can't be self-elevated.
 *
 * Returns the signed-in admin. Non-admins are bounced to their feed (not a 403
 * page — RO doesn't make a regular user feel walled off; admin simply isn't
 * theirs). Unauthenticated → login.
 */
export async function requireAdmin() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/feed");
  return { user };
}

/** Lightweight check for conditionally rendering admin UI (e.g. a feed link). */
export async function isAdmin(): Promise<boolean> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "admin";
}
