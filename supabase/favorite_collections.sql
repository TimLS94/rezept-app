-- One-off: let users file favorites into named collections/sections.
-- The distinct collection names ARE the categories (no separate table needed).
-- Idempotent. Run once in the Supabase SQL Editor.
alter table public.favorite_recipes add column if not exists collection text;
