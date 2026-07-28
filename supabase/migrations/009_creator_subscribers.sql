-- Creator subscribers table for tracking who follows which creator
-- Run: supabase db push (or via Supabase Dashboard)

create table if not exists public.creator_subscribers (
  creator_id    uuid references public.profiles(id) on delete cascade not null,
  subscriber_id uuid references public.profiles(id) on delete cascade not null,
  created_at    timestamptz default timezone('utc'::text, now()) not null,
  primary key (creator_id, subscriber_id)
);

alter table public.creator_subscribers enable row level security;

-- Anyone can see subscriber counts (for public profiles)
create policy "Anyone can view subscriber counts" on public.creator_subscribers
  for select using (true);

-- Users can subscribe to creators
create policy "Users can subscribe" on public.creator_subscribers
  for insert with check (auth.uid() = subscriber_id);

-- Users can unsubscribe
create policy "Users can unsubscribe" on public.creator_subscribers
  for delete using (auth.uid() = subscriber_id);

-- Index for fast lookups
create index if not exists creator_subscribers_creator_idx on public.creator_subscribers(creator_id);
create index if not exists creator_subscribers_subscriber_idx on public.creator_subscribers(subscriber_id);
