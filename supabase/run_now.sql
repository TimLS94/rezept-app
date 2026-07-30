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
create or replace function public.recipe_of_the_week()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select recipe
  from public.favorite_recipes
  where recipe_id = (
    select recipe_id
    from public.favorite_recipes
    where created_at >= now() - interval '7 days'
    group by recipe_id
    order by count(*) desc
    limit 1
  )
  limit 1;
$$;
grant execute on function public.recipe_of_the_week() to anon, authenticated;

commit;
