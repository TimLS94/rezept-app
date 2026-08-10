-- ============================================================================
-- RUN NOW — all pending DB changes since the last rebuild, in one script.
-- Paste into the Supabase SQL Editor and run. Everything is idempotent, so
-- it's safe even if some parts were already applied.
-- ============================================================================

begin;

-- 1. Favorites: named collections/sections (the distinct names ARE the categories).
alter table public.favorite_recipes add column if not exists collection text;

-- 2. Cook log: one row per finished cook session (cooked-count + 1-5 rating).
create table if not exists public.cook_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete cascade not null,
  recipe_id    text not null,
  recipe_title text,
  rating       integer check (rating between 1 and 5),
  created_at   timestamptz default timezone('utc'::text, now()) not null
);
create index if not exists cook_log_user_idx on public.cook_log(user_id);
create index if not exists cook_log_recipe_idx on public.cook_log(recipe_id);
alter table public.cook_log enable row level security;
drop policy if exists "Users view own cook log" on public.cook_log;
create policy "Users view own cook log" on public.cook_log for select using (auth.uid() = user_id);
drop policy if exists "Users add own cook log" on public.cook_log;
create policy "Users add own cook log" on public.cook_log for insert with check (auth.uid() = user_id);
drop policy if exists "Users update own cook log" on public.cook_log;
create policy "Users update own cook log" on public.cook_log for update using (auth.uid() = user_id);

-- 3. Family members: columns the app writes (fixes Quick Add / adding members).
alter table public.family_members add column if not exists gender text;
alter table public.family_members add column if not exists weight numeric;
alter table public.family_members add column if not exists portion_multiplier numeric default 1.0;

-- 4. Recipes: updated_at (fixes "Could not find the 'updated_at' column" on edit).
alter table public.recipes add column if not exists updated_at timestamptz default timezone('utc'::text, now()) not null;

-- 5. Recipe of the week: most-favorited recipe across all users (last 7 days).
--
-- Returns { live, snapshot }. The favorite blob is a snapshot from whenever it
-- was saved, so its title/image can be stale; the live row is resolved HERE
-- rather than by a second client round trip. `live` goes through
-- get_recipe_full, so a paid recipe still comes back as a teaser for
-- unentitled users — the home screen never receives premium steps.
-- Requires payments.sql (get_recipe_full) to have been run.
create or replace function public.recipe_of_the_week()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  top_id text;
  snap   jsonb;
  live   jsonb;
begin
  select recipe_id into top_id
  from public.favorite_recipes
  where created_at >= now() - interval '7 days'
  group by recipe_id
  order by count(*) desc
  limit 1;

  if top_id is null then return null; end if;

  select recipe into snap
  from public.favorite_recipes
  where recipe_id = top_id
  limit 1;

  -- Seed recipes from the local catalogue have plain ids ("1", "2", …) and no
  -- DB row — only uploaded recipes (uuid) can be resolved live.
  if top_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    live := public.get_recipe_full(top_id::uuid);
  end if;

  return jsonb_build_object('live', live, 'snapshot', snap);
end;
$$;
grant execute on function public.recipe_of_the_week() to anon, authenticated;

-- 6. Self-service account deletion (App Store requirement). Deletes the signed-in
--    user + all their data. SECURITY DEFINER so the anon client can call it.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.recipes where influencer_id = auth.uid();
  delete from auth.users where id = auth.uid();  -- cascades to profiles + children
end;
$$;
revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;

-- 7. Fridge Scan quota — 3 AI scans per rolling 7 days, per user.
--
-- Server-side on purpose: a device-local counter resets on reinstall and
-- doesn't follow the user to a second device. A ROLLING window (not the
-- calendar week) is used so you can't burn 3 on Sunday night and 3 more on
-- Monday morning.
create table if not exists public.fridge_scans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete cascade not null,
  item_count integer,
  created_at timestamptz default now() not null
);
create index if not exists fridge_scans_user_time_idx
  on public.fridge_scans(user_id, created_at desc);
alter table public.fridge_scans enable row level security;

drop policy if exists "Users view own fridge scans" on public.fridge_scans;
create policy "Users view own fridge scans" on public.fridge_scans
  for select using (auth.uid() = user_id);
-- No client INSERT policy: only the RPC below writes, so the quota can't be
-- side-stepped by inserting nothing and scanning anyway.

create or replace function public.fridge_scan_quota()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'limit', 3,
    'used', count(*),
    'remaining', greatest(0, 3 - count(*)),
    -- When the oldest scan in the window ages out, one slot frees up.
    'resets_at', min(created_at) + interval '7 days'
  )
  from public.fridge_scans
  where user_id = auth.uid() and created_at > now() - interval '7 days';
$$;
grant execute on function public.fridge_scan_quota() to authenticated;

-- Records a completed scan and returns the quota that remains AFTER it.
-- Returns ok=false without recording when the caller is already at the limit,
-- so a client that skips the pre-check still can't overrun it.
create or replace function public.record_fridge_scan(p_item_count int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare used int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select count(*) into used
  from public.fridge_scans
  where user_id = auth.uid() and created_at > now() - interval '7 days';

  if used >= 3 then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded')
      || public.fridge_scan_quota();
  end if;

  insert into public.fridge_scans (user_id, item_count)
  values (auth.uid(), p_item_count);

  return jsonb_build_object('ok', true) || public.fridge_scan_quota();
end;
$$;
grant execute on function public.record_fridge_scan(int) to authenticated;

-- 8. Reset Premium — the counterpart to grant_platform_entitlement, for testing.
--
-- This does NOT cancel anything at Apple or Google. It only clears the two
-- things this app looks at when deciding whether you're premium: the platform
-- entitlement row and the legacy profiles.is_premium flag. A real subscription
-- keeps billing and RevenueCat will re-grant on the next sync — cancelling for
-- real can only happen in the store's own subscription settings.
--
-- A client can't do this directly: entitlements deliberately has no client
-- UPDATE policy, so the reset has to go through a definer function.
create or replace function public.revoke_platform_entitlement()
returns jsonb language plpgsql security definer set search_path = public as $$
declare touched int := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  update public.entitlements
  set status = 'expired', current_period_end = now(), updated_at = now()
  where user_id = auth.uid() and scope = 'platform' and status <> 'expired';
  get diagnostics touched = row_count;

  update public.profiles set is_premium = false
  where id = auth.uid() and is_premium is true;

  return jsonb_build_object('ok', true, 'entitlements_expired', touched);
end; $$;
grant execute on function public.revoke_platform_entitlement() to authenticated;

commit;
