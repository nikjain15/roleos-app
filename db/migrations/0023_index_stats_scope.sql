-- ── public_index_stats(): show the real effort, hide the out-of-scope ────────
-- Two corrections to what roleos.fyi/the-index tells people.
--
-- 1. COVERAGE. The page said "685 companies", which is companies that currently
--    have a live in-scope role. True, but it undersells the work and reads as a
--    smaller index than it is: RO monitors 1,670 company boards on a cadence.
--    Now both numbers ship — monitored, and how many have live roles today.
--
-- 2. SCOPE. The archetype breakdown displayed buckets the index is not about:
--    "Sales / Account Management" (71) and "Other" (312). Those roles stay in
--    the corpus — spot-checking them shows they're real in-scope roles that
--    Claude mislabelled ("Program Manager, GTM Systems", "Revenue Operations
--    Analyst"), so removing them would delete valid roles. But advertising a
--    Sales bucket on a page about senior AI-native roles misrepresents the
--    index, and "Other" just admits we couldn't classify. Both are now excluded
--    from the published breakdown, and pct is recomputed over what we do show so
--    the percentages are honest about their own denominator.
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
  monitored as (select count(*)::int as m from public.companies where enabled),
  co as (
    select coalesce(nullif(split_part(coalesce(source_path, ''), '/', 2), ''),
                    lower(regexp_replace(company, '[^a-zA-Z0-9]+', '-', 'g'))) as slug,
           company as name, count(*)::int as count
    from r group by 1, 2 order by count(*) desc
  ),
  -- Only archetypes the index is actually about.
  arch_in as (
    select archetype as name, count(*)::int as count
    from r
    where archetype is not null
      and archetype not in ('Sales / Account Management', 'Other')
    group by archetype
  ),
  arch as (
    select name, count,
           round(100.0 * count / nullif((select sum(count) from arch_in), 0), 1) as pct
    from arch_in order by count desc
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
    'monitoredCompanies', (select m from monitored),
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

revoke all on function public.public_index_stats() from public;
grant execute on function public.public_index_stats() to anon, authenticated;
