-- Migration: Personal recipe book (my_recipes)
-- Users can save their own recipes (imported or manually created)
-- These are private to the user, not published to Discover

create table if not exists public.my_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  prep_time integer default 0,
  cook_time integer default 0,
  servings integer default 4,
  calories integer default 0,
  cost numeric(10,2) default 0,
  difficulty text default 'Easy',
  tags text[] default '{}',
  ingredients jsonb default '[]',
  instructions text[] default '{}',
  source_url text, -- original Instagram/TikTok URL if imported
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Index for fast user lookups
create index if not exists my_recipes_user_id_idx on public.my_recipes(user_id);

-- RLS: Users can only see/edit their own recipes
alter table public.my_recipes enable row level security;

drop policy if exists "Users can view own recipes" on public.my_recipes;
create policy "Users can view own recipes" on public.my_recipes
  for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own recipes" on public.my_recipes;
create policy "Users can insert own recipes" on public.my_recipes
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own recipes" on public.my_recipes;
create policy "Users can update own recipes" on public.my_recipes
  for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own recipes" on public.my_recipes;
create policy "Users can delete own recipes" on public.my_recipes
  for delete using (auth.uid() = user_id);
