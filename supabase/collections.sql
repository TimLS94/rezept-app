-- ============================================================================
-- Collections: your own sections in the cookbook.
--
-- Breakfast, Dinner, Dessert — but only as a starting point. The app creates
-- a handful the first time you open the tab and then never touches them
-- again: they are ordinary rows from that moment on, so they can be renamed,
-- re-iconed, reordered and deleted like any other. A preset that cannot be
-- changed is a category, and people's cooking does not fit our categories.
--
-- recipe_id is text, not uuid, because a collection can hold anything the
-- cookbook holds: a personal recipe (uuid), a creator's (uuid) and a bundled
-- seed recipe (a short string). `source` records which, so opening an entry
-- knows where to look without asking three tables.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

create table if not exists public.collections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete cascade not null,
  name       text not null,
  icon       text default '📁',
  position   integer default 0,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists collections_user_idx on public.collections (user_id, position);

create table if not exists public.collection_recipes (
  collection_id uuid references public.collections(id) on delete cascade not null,
  recipe_id     text not null,
  source        text not null default 'creator' check (source in ('mine', 'creator', 'seed')),
  added_at      timestamptz default timezone('utc'::text, now()) not null,
  primary key (collection_id, recipe_id)
);

alter table public.collections enable row level security;
alter table public.collection_recipes enable row level security;

drop policy if exists "Users read own collections" on public.collections;
create policy "Users read own collections" on public.collections
  for select using (auth.uid() = user_id);

drop policy if exists "Users create own collections" on public.collections;
create policy "Users create own collections" on public.collections
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own collections" on public.collections;
create policy "Users update own collections" on public.collections
  for update using (auth.uid() = user_id);

drop policy if exists "Users delete own collections" on public.collections;
create policy "Users delete own collections" on public.collections
  for delete using (auth.uid() = user_id);

-- Membership is reachable only through a collection you own. Checking the
-- parent on every statement is what stops someone adding rows to a stranger's
-- collection by guessing its id.
drop policy if exists "Users read own collection recipes" on public.collection_recipes;
create policy "Users read own collection recipes" on public.collection_recipes
  for select using (exists (
    select 1 from public.collections c
    where c.id = collection_id and c.user_id = auth.uid()));

drop policy if exists "Users add to own collections" on public.collection_recipes;
create policy "Users add to own collections" on public.collection_recipes
  for insert with check (exists (
    select 1 from public.collections c
    where c.id = collection_id and c.user_id = auth.uid()));

drop policy if exists "Users remove from own collections" on public.collection_recipes;
create policy "Users remove from own collections" on public.collection_recipes
  for delete using (exists (
    select 1 from public.collections c
    where c.id = collection_id and c.user_id = auth.uid()));

grant select, insert, update, delete on public.collections to authenticated;
grant select, insert, delete on public.collection_recipes to authenticated;

commit;
