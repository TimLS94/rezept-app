-- ============================================================================
-- Pending DB changes — run once in the Supabase SQL Editor. All idempotent.
-- Bundles the recent one-offs so you only run a single script.
-- ============================================================================

-- 1. Family members: columns the app writes (fixes Quick Add / adding members).
alter table public.family_members add column if not exists gender text;
alter table public.family_members add column if not exists weight numeric;
alter table public.family_members add column if not exists portion_multiplier numeric default 1.0;

-- 2. Recipes: updated_at (fixes "Could not find the 'updated_at' column" on edit).
alter table public.recipes add column if not exists updated_at timestamptz default timezone('utc'::text, now()) not null;

-- 3. Recipe of the week: most-favorited recipe across all users (last 7 days).
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
