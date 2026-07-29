-- One-off: add updated_at to recipes (run once in the Supabase SQL Editor).
-- The recipe edit screen writes updated_at, but the table only had created_at,
-- so updates failed with "Could not find the 'updated_at' column". Idempotent.
alter table public.recipes add column if not exists updated_at timestamptz default timezone('utc'::text, now()) not null;
