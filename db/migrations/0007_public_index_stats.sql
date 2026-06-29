-- ── public_index_stats() — live marketing stats for roleos.fyi ───────────────
-- The apex marketing site is anonymous (anon key) and `roles` is readable only by
-- `authenticated` (0002_rls roles_read_all). So expose a SECURITY DEFINER function
-- that returns ONLY aggregates (no row data) and grant EXECUTE to anon. The site
-- calls /rest/v1/rpc/public_index_stats → always-current numbers, zero rebuilds.
--
-- Safe: returns counts/breakdowns only; no PII, no per-row access. STABLE so a
-- single call is cheap; the roles_company_idx / roles_archetype_idx cover the
-- group-bys. If volume ever makes per-request aggregation costly, back this with a
-- materialized view refreshed by the ingestion pipeline (same return shape).
create or replace function public.public_index_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with r as (select company, source_path, archetype, must_haves, location, seniority from public.roles),
  tot as (
    select count(*)::int as n,
           count(distinct company)::int as c,
           coalesce(sum(jsonb_array_length(coalesce(must_haves, '[]'::jsonb))), 0)::int as mh
    from r
  ),
  co as (
    select coalesce(nullif(split_part(coalesce(source_path, ''), '/', 2), ''),
                    lower(regexp_replace(company, '[^a-zA-Z0-9]+', '-', 'g'))) as slug,
           company as name, count(*)::int as count
    from r group by 1, 2 order by count(*) desc
  ),
  arch as (
    select archetype as name, count(*)::int as count,
           round(100.0 * count(*) / nullif((select n from tot), 0), 1) as pct
    from r where archetype is not null group by archetype order by count(*) desc
  ),
  loc as (select coalesce(location->>'type', 'unclear') as k, count(*)::int as c from r group by 1),
  visa as (select coalesce(location->>'visa_sponsorship', 'unclear') as k, count(*)::int as c from r group by 1),
  yrs as (
    select case
             when (seniority->>'years_required_min') is null
               or (seniority->>'years_required_min') !~ '^[0-9.]+$' then 'unspecified'
             when (seniority->>'years_required_min')::numeric <= 2 then '0-2'
             when (seniority->>'years_required_min')::numeric <= 5 then '3-5'
             when (seniority->>'years_required_min')::numeric <= 9 then '6-9'
             else '10+'
           end as k, count(*)::int as c
    from r group by 1
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'totalRoles', (select n from tot),
    'totalCompanies', (select c from tot),
    'mustHaves', (select mh from tot),
    'topCompanies', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'count', count)), '[]'::jsonb)
                     from (select * from co limit 20) x),
    'allCompanies', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'count', count)), '[]'::jsonb)
                     from co),
    'archetypes', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', count, 'pct', pct)), '[]'::jsonb)
                   from arch),
    'distributions', jsonb_build_object(
      'locationType',    (select coalesce(jsonb_object_agg(k, c), '{}'::jsonb) from loc),
      'visaSponsorship', (select coalesce(jsonb_object_agg(k, c), '{}'::jsonb) from visa),
      'yearsRequired',   (select coalesce(jsonb_object_agg(k, c), '{}'::jsonb) from yrs)
    )
  );
$$;

-- anon (marketing site) + authenticated (app) may read the aggregates; nobody else.
revoke all on function public.public_index_stats() from public;
grant execute on function public.public_index_stats() to anon, authenticated;

-- Make the new RPC visible to PostgREST immediately (no dashboard reload needed).
notify pgrst, 'reload schema';
