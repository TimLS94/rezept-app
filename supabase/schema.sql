-- ============================================================================
-- FeedFamily — current database schema (source of truth)
--
-- Idempotent & constructive: creates every table/policy/trigger the app needs,
-- safe to run (and re-run) on a fresh or existing database. It does NOT drop
-- anything. For a clean wipe-and-rebuild, use supabase/reset_and_rebuild.sql.
--
-- Consolidates: base schema + migrations 002/005/006/007/008 + creator fields.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ── profiles (base + roles + creator identity) ─────────────────────────────
create table if not exists public.profiles (
  id            uuid references auth.users on delete cascade primary key,
  email         text,
  full_name     text,
  avatar_url    text,
  family_size   integer default 2,
  weekly_budget decimal default 150,
  username      text,
  bio           text,
  instagram_url text,
  tiktok_url    text,
  website       text,
  role          text not null default 'user' check (role in ('user', 'creator', 'admin')),
  -- Derived from role so `is_creator` queries always match creators/admins.
  is_creator    boolean generated always as (role in ('creator', 'admin')) stored,
  is_premium    boolean not null default false,
  premium_until timestamptz,
  created_at    timestamptz default timezone('utc'::text, now()) not null,
  updated_at    timestamptz default timezone('utc'::text, now()) not null
);
alter table public.profiles enable row level security;
drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);
-- Creator profiles are public (needed for search + public creator pages).
drop policy if exists "Anyone can view creator profiles" on public.profiles;
create policy "Anyone can view creator profiles" on public.profiles
  for select using (is_creator = true);
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- ── recipes (public creator uploads) ───────────────────────────────────────
create table if not exists public.recipes (
  id                uuid default uuid_generate_v4() primary key,
  title             text not null,
  description       text,
  image_url         text,
  prep_time         integer,
  cook_time         integer,
  servings          integer default 4,
  difficulty        text check (difficulty in ('Easy', 'Medium', 'Hard')),
  calories          integer,
  cost              decimal default 0,
  is_paid           boolean default false,  -- paywall: premium-only content
  kid_approved      boolean default false,
  tags              text[],
  ingredients       jsonb,
  instructions      jsonb,
  influencer_id     uuid references public.profiles(id),
  influencer_name   text,
  influencer_handle text,
  influencer_avatar text,
  created_at        timestamptz default timezone('utc'::text, now()) not null,
  updated_at        timestamptz default timezone('utc'::text, now()) not null
);
create index if not exists recipes_influencer_id_idx on public.recipes(influencer_id);
alter table public.recipes enable row level security;

drop policy if exists "Anyone can view recipes" on public.recipes;
create policy "Anyone can view recipes" on public.recipes
  for select using (true);
-- Only creators/admins may publish (mirrors FEATURES.publicRecipeUploads = false).
drop policy if exists "Creators can create recipes" on public.recipes;
create policy "Creators can create recipes" on public.recipes
  for insert to authenticated
  with check (
    influencer_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('creator', 'admin')
    )
  );
drop policy if exists "Creators can update their own recipes" on public.recipes;
create policy "Creators can update their own recipes" on public.recipes
  for update using (auth.uid() = influencer_id);
drop policy if exists "Creators can delete their own recipes" on public.recipes;
create policy "Creators can delete their own recipes" on public.recipes
  for delete using (auth.uid() = influencer_id);

-- ── family_members ─────────────────────────────────────────────────────────
create table if not exists public.family_members (
  id                   uuid default uuid_generate_v4() primary key,
  profile_id           uuid references public.profiles(id) on delete cascade not null,
  name                 text not null,
  age                  integer,
  gender               text,
  weight               numeric,
  portion_multiplier   numeric default 1.0,
  portion_size         text default 'medium',
  dietary_restrictions text[],
  created_at           timestamptz default timezone('utc'::text, now()) not null
);
alter table public.family_members enable row level security;
drop policy if exists "Users can manage their family members" on public.family_members;
create policy "Users can manage their family members" on public.family_members
  for all using (auth.uid() = profile_id);

-- ── shopping_items ─────────────────────────────────────────────────────────
create table if not exists public.shopping_items (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  recipe_id   text,
  recipe_name text,
  name        text not null,
  amount      decimal default 1,
  unit        text default '',
  category    text default 'other',
  checked     boolean default false,
  created_at  timestamptz default timezone('utc'::text, now()) not null
);
create index if not exists shopping_items_user_id_idx on public.shopping_items(user_id);
alter table public.shopping_items enable row level security;
drop policy if exists "Users can view their own shopping items" on public.shopping_items;
create policy "Users can view their own shopping items" on public.shopping_items
  for select using (auth.uid() = user_id);
drop policy if exists "Users can add shopping items" on public.shopping_items;
create policy "Users can add shopping items" on public.shopping_items
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update their own shopping items" on public.shopping_items;
create policy "Users can update their own shopping items" on public.shopping_items
  for update using (auth.uid() = user_id);
drop policy if exists "Users can remove their own shopping items" on public.shopping_items;
create policy "Users can remove their own shopping items" on public.shopping_items
  for delete using (auth.uid() = user_id);

-- ── my_recipes (private cookbook) ──────────────────────────────────────────
create table if not exists public.my_recipes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  description  text,
  image_url    text,
  prep_time    integer default 0,
  cook_time    integer default 0,
  servings     integer default 4,
  calories     integer default 0,
  cost         numeric(10,2) default 0,
  difficulty   text default 'Easy',
  tags         text[] default '{}',
  ingredients  jsonb default '[]',
  instructions text[] default '{}',
  source_url   text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);
create index if not exists my_recipes_user_id_idx on public.my_recipes(user_id);
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

-- ── favorite_recipes ───────────────────────────────────────────────────────
create table if not exists public.favorite_recipes (
  user_id    uuid references public.profiles(id) on delete cascade not null,
  recipe_id  text not null,
  recipe     jsonb not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
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

-- ── meal_plan_items ────────────────────────────────────────────────────────
create table if not exists public.meal_plan_items (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  week_start date not null,
  recipe     jsonb not null,
  done       boolean default false,
  sort       integer default 0,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
create index if not exists meal_plan_items_user_week_idx on public.meal_plan_items(user_id, week_start);
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

-- ── creator_subscribers (users subscribing to a creator) ───────────────────
create table if not exists public.creator_subscribers (
  creator_id    uuid references public.profiles(id) on delete cascade not null,
  subscriber_id uuid references public.profiles(id) on delete cascade not null,
  created_at    timestamptz default timezone('utc'::text, now()) not null,
  primary key (creator_id, subscriber_id)
);
alter table public.creator_subscribers enable row level security;
drop policy if exists "Anyone can view subscriptions" on public.creator_subscribers;
create policy "Anyone can view subscriptions" on public.creator_subscribers
  for select using (true);
drop policy if exists "Users can subscribe" on public.creator_subscribers;
create policy "Users can subscribe" on public.creator_subscribers
  for insert with check (auth.uid() = subscriber_id);
drop policy if exists "Users can unsubscribe" on public.creator_subscribers;
create policy "Users can unsubscribe" on public.creator_subscribers
  for delete using (auth.uid() = subscriber_id);

-- ── auto-create a profile row on signup ────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── recipe of the week: most-favorited recipe across all users (last 7 days) ─
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
