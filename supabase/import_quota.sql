-- ============================================================================
-- An allowance for recipe imports, shaped exactly like the fridge scan's.
--
-- Imports are the most expensive thing a user can ask for: reading a caption
-- is cheap, reading ten screenshots is not, and both are billed per call. A
-- Premium subscription buys the feature; the allowance is what stops one
-- account from being able to run the bill up without limit.
--
-- Ten per rolling seven days. Deliberately generous for the way people
-- actually import — an evening of saving recipes stays well under it — and
-- useless to anyone pointing a script at it. It sits on top of the per-op
-- daily caps in ai_quota.sql, which exist for a different reason: those guard
-- the gateway, this one is what the user sees.
--
-- No client INSERT policy on the table. The RPC is the only writer, so the
-- allowance cannot be side-stepped by simply not recording an import.
--
-- Idempotent. Run in the Supabase SQL Editor.
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

create or replace function public.import_quota()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'limit', 10,
    'used', count(*),
    'remaining', greatest(0, 10 - count(*)),
    -- When the oldest import in the window ages out, one slot frees up.
    'resets_at', min(created_at) + interval '7 days'
  )
  from public.recipe_imports
  where user_id = auth.uid() and created_at > now() - interval '7 days';
$$;
grant execute on function public.import_quota() to authenticated;

-- Records an import and returns the allowance that remains AFTER it. Refuses
-- without recording when the caller is already at the limit, so a client that
-- skips the pre-check still cannot overrun it.
create or replace function public.record_import(p_kind text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare used int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select count(*) into used
  from public.recipe_imports
  where user_id = auth.uid() and created_at > now() - interval '7 days';

  if used >= 10 then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded') || public.import_quota();
  end if;

  insert into public.recipe_imports (user_id, kind) values (auth.uid(), p_kind);

  return jsonb_build_object('ok', true) || public.import_quota();
end; $$;
grant execute on function public.record_import(text) to authenticated;

commit;
