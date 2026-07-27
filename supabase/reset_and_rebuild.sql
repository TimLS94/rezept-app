-- ============================================================================
-- FeedFamily — RESET & REBUILD  (run once in the Supabase SQL Editor)
--
-- Drops ALL app tables and recreates the complete, current schema in one go.
-- This is the single source of truth for the database — it consolidates the
-- base schema + migrations 002/005/006/007/008 + creator profile fields.
--
-- ⚠️  DESTRUCTIVE: every row in the app tables below is deleted.
--     Auth accounts (auth.users) are KEPT — only public app data is rebuilt.
--     A profile row is re-created for every existing account afterwards.
-- ============================================================================

begin;

create extension if not exists "uuid-ossp";

-- ── 1. Drop app tables (CASCADE clears FKs, policies, indexes) ──────────────
drop table if exists public.meal_plan_items   cascade;
drop table if exists public.favorite_recipes  cascade;
drop table if exists public.favorites         cascade;  -- legacy, replaced by favorite_recipes
drop table if exists public.my_recipes        cascade;
drop table if exists public.shopping_items    cascade;
drop table if exists public.family_members    cascade;
drop table if exists public.recipes           cascade;
drop table if exists public.profiles          cascade;

-- ── 2. profiles (base + roles + creator identity) ──────────────────────────
create table public.profiles (
  id            uuid references auth.users on delete cascade primary key,
  email         text,
  full_name     text,
  avatar_url    text,
  family_size   integer default 2,
  weekly_budget decimal default 150,
  is_creator    boolean default false,
  username      text,
  bio           text,
  instagram_url text,
  tiktok_url    text,
  website       text,
  role          text not null default 'user' check (role in ('user', 'creator', 'admin')),
  is_premium    boolean not null default false,
  premium_until timestamptz,
  created_at    timestamptz default timezone('utc'::text, now()) not null,
  updated_at    timestamptz default timezone('utc'::text, now()) not null
);
alter table public.profiles enable row level security;
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can insert their own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- ── 3. recipes (public creator uploads) ────────────────────────────────────
create table public.recipes (
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
  kid_approved      boolean default false,
  tags              text[],
  ingredients       jsonb,
  instructions      jsonb,
  influencer_id     uuid references public.profiles(id),
  influencer_name   text,
  influencer_handle text,
  influencer_avatar text,
  created_at        timestamptz default timezone('utc'::text, now()) not null
);
create index recipes_influencer_id_idx on public.recipes(influencer_id);
alter table public.recipes enable row level security;

create policy "Anyone can view recipes" on public.recipes
  for select using (true);
-- Only creators/admins may publish (mirrors FEATURES.publicRecipeUploads = false).
create policy "Creators can create recipes" on public.recipes
  for insert to authenticated
  with check (
    influencer_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('creator', 'admin')
    )
  );
create policy "Creators can update their own recipes" on public.recipes
  for update using (auth.uid() = influencer_id);
create policy "Creators can delete their own recipes" on public.recipes
  for delete using (auth.uid() = influencer_id);

-- ── 4. family_members ──────────────────────────────────────────────────────
create table public.family_members (
  id                  uuid default uuid_generate_v4() primary key,
  profile_id          uuid references public.profiles(id) on delete cascade not null,
  name                text not null,
  age                 integer,
  portion_size        text default 'medium',
  dietary_restrictions text[],
  created_at          timestamptz default timezone('utc'::text, now()) not null
);
alter table public.family_members enable row level security;
create policy "Users can manage their family members" on public.family_members
  for all using (auth.uid() = profile_id);

-- ── 5. shopping_items ──────────────────────────────────────────────────────
create table public.shopping_items (
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
create index shopping_items_user_id_idx on public.shopping_items(user_id);
alter table public.shopping_items enable row level security;
create policy "Users can view their own shopping items" on public.shopping_items
  for select using (auth.uid() = user_id);
create policy "Users can add shopping items" on public.shopping_items
  for insert with check (auth.uid() = user_id);
create policy "Users can update their own shopping items" on public.shopping_items
  for update using (auth.uid() = user_id);
create policy "Users can remove their own shopping items" on public.shopping_items
  for delete using (auth.uid() = user_id);

-- ── 6. my_recipes (private cookbook) ───────────────────────────────────────
create table public.my_recipes (
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
create index my_recipes_user_id_idx on public.my_recipes(user_id);
alter table public.my_recipes enable row level security;
create policy "Users can view own recipes" on public.my_recipes
  for select using (auth.uid() = user_id);
create policy "Users can insert own recipes" on public.my_recipes
  for insert with check (auth.uid() = user_id);
create policy "Users can update own recipes" on public.my_recipes
  for update using (auth.uid() = user_id);
create policy "Users can delete own recipes" on public.my_recipes
  for delete using (auth.uid() = user_id);

-- ── 7. favorite_recipes ────────────────────────────────────────────────────
create table public.favorite_recipes (
  user_id    uuid references public.profiles(id) on delete cascade not null,
  recipe_id  text not null,
  recipe     jsonb not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  primary key (user_id, recipe_id)
);
alter table public.favorite_recipes enable row level security;
create policy "Users view own favorites" on public.favorite_recipes
  for select using (auth.uid() = user_id);
create policy "Users add own favorites" on public.favorite_recipes
  for insert with check (auth.uid() = user_id);
create policy "Users remove own favorites" on public.favorite_recipes
  for delete using (auth.uid() = user_id);

-- ── 8. meal_plan_items ─────────────────────────────────────────────────────
create table public.meal_plan_items (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  week_start date not null,
  recipe     jsonb not null,
  done       boolean default false,
  sort       integer default 0,
  created_at timestamptz default timezone('utc'::text, now()) not null
);
create index meal_plan_items_user_week_idx on public.meal_plan_items(user_id, week_start);
alter table public.meal_plan_items enable row level security;
create policy "Users view own plan" on public.meal_plan_items
  for select using (auth.uid() = user_id);
create policy "Users add own plan" on public.meal_plan_items
  for insert with check (auth.uid() = user_id);
create policy "Users update own plan" on public.meal_plan_items
  for update using (auth.uid() = user_id);
create policy "Users remove own plan" on public.meal_plan_items
  for delete using (auth.uid() = user_id);

-- ── 9. auto-create a profile row on signup ─────────────────────────────────
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

-- ── 10. backfill profiles for existing accounts + promote the test creator ──
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

update public.profiles set role = 'creator'
where email = 'schaefer.l.tim+creator@gmail.com';

commit;
