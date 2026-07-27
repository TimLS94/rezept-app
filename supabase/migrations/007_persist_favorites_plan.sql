-- Migration: persist favorites and the weekly meal plan per user.
-- Recipes are stored as a JSON snapshot so local seed recipes and uploaded
-- recipes both survive without extra lookups. Safe to run on an existing db.

create extension if not exists "uuid-ossp";

-- Favorites: one row per saved recipe.
create table if not exists public.favorite_recipes (
  user_id uuid references public.profiles(id) on delete cascade not null,
  recipe_id text not null,
  recipe jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (user_id, recipe_id)
);

alter table public.favorite_recipes enable row level security;

drop policy if exists "Users view own favorites" on public.favorite_recipes;
create policy "Users view own favorites" on public.favorite_recipes
  for select using (auth.uid() = user_id);

drop policy if exists "Users add own favorites" on public.favorite_recipes;
create policy "Users add own favorites" on public.favorite_recipes
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users remove own favorites" on public.favorite_recipes;
create policy "Users remove own favorites" on public.favorite_recipes
  for delete using (auth.uid() = user_id);

-- Weekly meal plan: one row per planned meal, grouped by the Monday week start.
create table if not exists public.meal_plan_items (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  week_start date not null,
  recipe jsonb not null,
  done boolean default false,
  sort integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists meal_plan_items_user_week_idx
  on public.meal_plan_items(user_id, week_start);

alter table public.meal_plan_items enable row level security;

drop policy if exists "Users view own plan" on public.meal_plan_items;
create policy "Users view own plan" on public.meal_plan_items
  for select using (auth.uid() = user_id);

drop policy if exists "Users add own plan" on public.meal_plan_items;
create policy "Users add own plan" on public.meal_plan_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own plan" on public.meal_plan_items;
create policy "Users update own plan" on public.meal_plan_items
  for update using (auth.uid() = user_id);

drop policy if exists "Users remove own plan" on public.meal_plan_items;
create policy "Users remove own plan" on public.meal_plan_items
  for delete using (auth.uid() = user_id);
