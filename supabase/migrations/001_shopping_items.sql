-- Migration: shopping_items table
-- Safe to run on an existing database (idempotent). Paste into the Supabase SQL Editor.

create extension if not exists "uuid-ossp";

create table if not exists public.shopping_items (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  recipe_id text,            -- source recipe id (from the local recipe catalogue); null for manual items
  recipe_name text,          -- source recipe title, used to group items by meal
  name text not null,
  amount decimal default 1,
  unit text default '',
  category text default 'other',
  checked boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
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
