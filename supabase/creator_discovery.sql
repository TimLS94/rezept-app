-- ============================================================================
-- Creator discovery + subscriptions + paywall flag
-- (run once in the Supabase SQL Editor; idempotent).
--   1. recipes.is_paid — paywall flag used by the profile / creator pages.
--   2. Keep is_creator ALWAYS in sync with role (generated column) so queries
--      like `.eq('is_creator', true)` match every creator/admin automatically.
--   3. Add creator_subscribers so users can subscribe to a creator.
-- ============================================================================

-- 0. Paywall flag on recipes.
alter table public.recipes add column if not exists is_paid boolean default false;

-- 1. is_creator now derives from role — no more drift between the two.
alter table public.profiles drop column if exists is_creator;
alter table public.profiles
  add column is_creator boolean
  generated always as (role in ('creator', 'admin')) stored;

-- 2. Subscriptions: one row per (creator, subscriber).
create table if not exists public.creator_subscribers (
  creator_id    uuid references public.profiles(id) on delete cascade not null,
  subscriber_id uuid references public.profiles(id) on delete cascade not null,
  created_at    timestamptz default timezone('utc'::text, now()) not null,
  primary key (creator_id, subscriber_id)
);
alter table public.creator_subscribers enable row level security;

-- Public read so subscriber counts are visible to everyone (refine later if the
-- who-subscribes-to-whom relationship should be private).
drop policy if exists "Anyone can view subscriptions" on public.creator_subscribers;
create policy "Anyone can view subscriptions" on public.creator_subscribers
  for select using (true);

drop policy if exists "Users can subscribe" on public.creator_subscribers;
create policy "Users can subscribe" on public.creator_subscribers
  for insert with check (auth.uid() = subscriber_id);

drop policy if exists "Users can unsubscribe" on public.creator_subscribers;
create policy "Users can unsubscribe" on public.creator_subscribers
  for delete using (auth.uid() = subscriber_id);
