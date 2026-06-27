"use client";

import { supabaseBrowser } from "@/lib/supabase/client";

export default function SignOut() {
  async function out() {
    await supabaseBrowser().auth.signOut();
    window.location.href = "/";
  }
  return (
    <button onClick={out} className="text-xs text-tx3 underline">
      Sign out
    </button>
  );
}
