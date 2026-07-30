-- ============================================================================
-- Cook log — one row per finished cook session (run once in the SQL Editor).
-- Captures BOTH "recipes cooked" (row count per user) and the recipe feedback
-- (rating 1-5, filled in on the completion screen). Idempotent.
-- ============================================================================

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
create policy "Users view own cook log" on public.cook_log
  for select using (auth.uid() = user_id);

drop policy if exists "Users add own cook log" on public.cook_log;
create policy "Users add own cook log" on public.cook_log
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own cook log" on public.cook_log;
create policy "Users update own cook log" on public.cook_log
  for update using (auth.uid() = user_id);
