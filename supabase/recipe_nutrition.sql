-- ============================================================================
-- Macros on a recipe, and whether anyone actually measured them.
--
-- `calories` already existed as a plain integer with no way to tell a figure
-- the creator worked out from one the app guessed. That distinction is the
-- whole point here: an estimate presented as a fact is the kind of claim the
-- FTC treats as deceptive, and it is simply dishonest to a user deciding what
-- to eat.
--
-- One jsonb column rather than four integer ones, so protein/carbs/fat and
-- the `estimated` flag stay together and cannot be written apart.
--
--   { "calories": 520, "protein": 32, "carbs": 48, "fat": 21,
--     "estimated": true, "estimated_at": "2026-08-20T..." }
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

alter table public.recipes
  add column if not exists nutrition jsonb;

alter table public.my_recipes
  add column if not exists nutrition jsonb;

-- recipes is read through get_recipe_full and the listing columns, both of
-- which return whole rows, so nothing further is needed there. my_recipes is
-- read with select('*') by its owner under RLS.
commit;
