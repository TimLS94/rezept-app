-- ============================================================================
-- A recipe cannot be for sale without a price.
--
-- It could be, and one was. The Studio's lock wrote is_paid and never looked
-- at price_cents — two columns that only mean something together, written
-- separately with nothing joining them. The result was a recipe shown as
-- premium with no way to buy it, which is a broken product and, when App
-- Review opens it, a 2.1(b) rejection.
--
-- The app now refuses to create that state. This is the half that holds
-- regardless of which client is writing, which is the half that lasts: the
-- app has been rewritten several times this month, the table has not.
--
-- Run in the Supabase SQL Editor.
-- ============================================================================

begin;

-- Free the ones already in that state. Not priced is not sellable, so this
-- takes nothing away from anyone — it says out loud what was already true.
update public.recipes
set is_paid = false
where coalesce(is_paid, false) and price_cents is null;

alter table public.recipes drop constraint if exists recipes_paid_needs_price;
alter table public.recipes add constraint recipes_paid_needs_price
  check (not (coalesce(is_paid, false) and price_cents is null));

commit;

-- ── Check afterwards ───────────────────────────────────────────────────────
--   select id, title, is_paid, price_cents
--   from public.recipes
--   where coalesce(is_paid, false)
--   order by price_cents;
--
-- Every row should carry a price. A write that would break this now fails
-- loudly at the database instead of quietly reaching a customer.
