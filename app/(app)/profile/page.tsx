import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { parseCanonicalProfile } from "@/lib/profile-schema";
import ProfileView from "@/components/ProfileView";

/**
 * P2 — "What RO knows about you" (docs/specs/profile-data-layer.md). The
 * correctable canonical profile: RO shows the structured read it built from your
 * LinkedIn/GitHub/résumé, and you fix anything. RLS-scoped; edits become
 * high-weight taste signals via /api/profile/edit.
 */
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  const { data: mp } = await supabase.from("master_profile").select("data").eq("user_id", user.id).single();
  const stored = (mp?.data as { profile?: unknown } | null)?.profile;

  return (
    <main className="mx-auto max-w-2xl px-6 pt-12 pb-24">
      <Link href="/feed" className="text-small text-tx3 hover:text-tx2">&larr; feed</Link>
      <h1 className="mt-4 font-display text-h1 font-semibold text-tx">What RO knows about you</h1>
      <p className="mt-2 text-body leading-relaxed text-tx2">
        RO built this from what you shared. Fix anything that&rsquo;s off &mdash; every correction sharpens what I
        find and make for you.
      </p>

      <div className="mt-8">
        {stored ? (
          <ProfileView initial={parseCanonicalProfile(stored, { defaultSource: "user", at: new Date().toISOString() })} />
        ) : (
          <div className="rounded-xl border border-bd bg-surf p-6 text-body text-tx2">
            RO hasn&rsquo;t read your work yet.{" "}
            <Link href="/start" className="font-medium text-primary hover:underline">Hand RO your hunt</Link> and I&rsquo;ll
            build your profile.
          </div>
        )}
      </div>
    </main>
  );
}
