import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import RoMemoryView, { type MemoryNote } from "@/components/RoMemoryView";

/**
 * "What RO remembers about you" (RO memory M1c). The user's durable notebook,
 * visible + correctable — the trust/privacy control for Option B. RLS-scoped
 * (their notes only). Fail-safe: before the ro_memory migration is applied the
 * query errors and we simply show the empty state.
 */
export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/memory");

  const { data, error } = await supabase
    .from("ro_memory")
    .select("id, kind, text, scope")
    .is("superseded_by", null)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<MemoryNote[]>();
  const notes = error ? [] : data ?? [];

  return (
    <main className="mx-auto max-w-2xl px-6 pb-24 pt-12">
      <Link href="/feed" className="text-small text-tx3 hover:text-tx2">
        &larr; feed
      </Link>
      <h1 className="mt-4 font-display text-h1 font-semibold text-tx">What RO remembers about you</h1>
      <p className="mt-2 text-body leading-relaxed text-tx2">
        A few lasting facts RO learned from how you use it &mdash; so it stays consistent across screens and
        never asks twice. It&rsquo;s yours: fix the wording or forget anything. RO only ever recalls the notes
        relevant to what you&rsquo;re doing, never all of them at once.
      </p>
      <RoMemoryView initialNotes={notes} />
    </main>
  );
}
