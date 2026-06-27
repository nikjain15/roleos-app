-- RoleOS · 0003 · auth bootstrap + match RPC
-- Auth = Google OAuth + magic link (configured in the Supabase dashboard;
-- no passwords). On signup, auto-create the profiles row (role defaults 'user').

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── match_roles — hybrid retrieval RPC (pgvector recall, used in Phase 2) ─
-- Cosine distance against role_embeddings; returns nearest roles. Reasoning +
-- structured filters + Claude precision happen in the matching skill on top.
create or replace function public.match_roles(
  query_embedding vector(768),
  match_count int default 20
)
returns table (role_id uuid, distance float)
language sql stable as $$
  select e.role_id, e.embedding <=> query_embedding as distance
  from public.role_embeddings e
  order by e.embedding <=> query_embedding
  limit match_count;
$$;
