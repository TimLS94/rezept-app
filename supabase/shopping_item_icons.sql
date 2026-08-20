-- ============================================================================
-- An icon the user picked for a shopping item.
--
-- Only set when someone chose one by hand. Left null, the app reads an icon
-- from the item's name, which is right for everything that came off a recipe
-- and keeps old rows working without a backfill.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

alter table public.shopping_items
  add column if not exists icon text;

commit;
