-- ── collective_resume_signals (RO memory M3 — anonymous aggregate learning) ──
-- docs/specs/ro-memory.md §"Two kinds of learning". Personalization AT SCALE that
-- never exposes anyone's private data: this function returns ONLY de-identified
-- aggregate COUNTS (action + signal category + count) over résumé feedback across
-- ALL users — no user_id, no note/instruction text ever leaves. The server derives
-- a population "collective prior" (lib/ro/collective) from these counts to seed
-- per-user calibration (better cold-start), measured by the eval ladder.
--
-- SECURITY DEFINER so it can aggregate across users (bypassing per-row RLS), but the
-- RESULT is aggregate-only, so no individual data can leak. Execute is granted to
-- service_role ONLY (server-side), never to anon/authenticated.
create or replace function public.collective_resume_signals()
returns table (action text, signal text, cnt bigint)
language sql
security definer
set search_path = public
as $$
  select de.action, de.payload->>'signal' as signal, count(*)::bigint as cnt
  from public.decision_events de
  where de.kind = 'resume'
  group by de.action, de.payload->>'signal';
$$;

revoke all on function public.collective_resume_signals() from public, anon, authenticated;
grant execute on function public.collective_resume_signals() to service_role;
