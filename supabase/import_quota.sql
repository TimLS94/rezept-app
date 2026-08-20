-- ============================================================================
-- An allowance for recipe imports, shaped like the fridge scan's.
--
-- Two buckets, because the two kinds of import do not cost the same and are
-- not used the same way:
--
--   instagram — 3 per rolling 7 days. Pulling a post costs a scraper call on
--   top of the AI call, and it is the one path where a single tap in another
--   app spends one of ours. Three is the same allowance as the fridge scan.
--
--   everything else — 10 per rolling 7 days. A screenshot or pasted text is
--   one AI call and no third-party service, and it is what someone sitting
--   down to fill their cookbook actually does.
--
-- The buckets are separate, not shared: using all three Instagram imports
-- does not touch the ten you have for screenshots. Both sit on top of the
-- per-op daily caps in ai_quota.sql, which guard the gateway; these are the
-- numbers the user sees.
--
-- No client INSERT policy on the table. The RPC is the only writer, so the
-- allowance cannot be side-stepped by simply not recording an import.
--
-- Idempotent. Safe to re-run over the earlier single-bucket version.
-- Run in the Supabase SQL Editor.
-- ============================================================================

begin;

create table if not exists public.recipe_imports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete cascade not null,
  kind       text,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists recipe_imports_user_time_idx
  on public.recipe_imports (user_id, created_at desc);

alter table public.recipe_imports enable row level security;

drop policy if exists "Users view own imports" on public.recipe_imports;
create policy "Users view own imports" on public.recipe_imports
  for select using (auth.uid() = user_id);

grant select on public.recipe_imports to authenticated;

-- The first version took no argument. Leaving it in place would make
-- import_quota() ambiguous against the defaulted one below.
drop function if exists public.import_quota();

create or replace function public.import_limit(p_kind text)
returns int language sql immutable as $$
  select case when p_kind = 'instagram' then 3 else 10 end;
$$;

create or replace function public.import_quota(p_kind text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'kind', coalesce(p_kind, 'other'),
    'limit', public.import_limit(p_kind),
    'used', count(*),
    'remaining', greatest(0, public.import_limit(p_kind) - count(*)),
    -- When the oldest import in this bucket ages out, one slot frees up.
    'resets_at', min(created_at) + interval '7 days'
  )
  from public.recipe_imports
  where user_id = auth.uid()
    and created_at > now() - interval '7 days'
    -- Same bucket as the kind being asked about: Instagram counts Instagram,
    -- everything else counts everything else.
    and (case when p_kind = 'instagram'
              then kind = 'instagram'
              else coalesce(kind, '') <> 'instagram' end);
$$;
grant execute on function public.import_quota(text) to authenticated;

-- Records an import and returns the allowance that remains AFTER it. Refuses
-- without recording when the caller is already at the limit, so a client that
-- skips the pre-check still cannot overrun it.
create or replace function public.record_import(p_kind text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare used int; lim int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  lim := public.import_limit(p_kind);

  select count(*) into used
  from public.recipe_imports
  where user_id = auth.uid()
    and created_at > now() - interval '7 days'
    and (case when p_kind = 'instagram'
              then kind = 'instagram'
              else coalesce(kind, '') <> 'instagram' end);

  if used >= lim then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded')
           || public.import_quota(p_kind);
  end if;

  insert into public.recipe_imports (user_id, kind) values (auth.uid(), p_kind);

  return jsonb_build_object('ok', true) || public.import_quota(p_kind);
end; $$;
grant execute on function public.record_import(text) to authenticated;

commit;
