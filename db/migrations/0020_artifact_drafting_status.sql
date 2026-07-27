-- ── artifact 'drafting' / 'error' status (async tailoring) ──────────────────
-- Async tailoring returns a placeholder artifact INSTANTLY (no 2-min wait on the
-- button), then RO drafts in the background (ctx.waitUntil) and flips the status.
-- The studio polls until it's ready. Needs two new statuses the CHECK didn't allow.
alter table public.artifacts drop constraint if exists artifacts_status_check;
alter table public.artifacts add constraint artifacts_status_check
  check (status in ('drafting','draft','needs_your_eyes','approved','sent','error'));
