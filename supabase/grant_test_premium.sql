-- ============================================================================
-- Give a tester Premium, by email.
--
-- This writes the same row the RevenueCat webhook writes, because that is what
-- the app reads: an active `platform` entitlement, or the legacy
-- profiles.is_premium flag. Nothing here touches Apple or Google — no money
-- moves, nothing is subscribed, and the tester will not be charged.
--
-- Two things make a test grant findable again later, which matters because
-- forgetting one means shipping with a stranger holding a free subscription:
--
--   store      = 'test'      → every comped account is one WHERE away
--   product_id = 'test-comp'
--
-- current_period_end is set 60 days out as documentation of intent. Note the
-- app does not read it — it checks status only — so an expiry does NOT revoke
-- access on its own. Run the sweep at the bottom before launch.
--
-- Idempotent: re-running re-grants rather than duplicating.
-- Run in the Supabase SQL Editor.
-- ============================================================================

begin;

-- ── Grant ──────────────────────────────────────────────────────────────────
-- Change the email, run, and read the returned row. No row back means no
-- account with that address has signed up yet — the person has to create
-- their account first; there is nothing to attach an entitlement to.
with target as (
  select p.id
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower('alexander.oschwald@gmail.com')
)
insert into public.entitlements
  (user_id, scope, creator_id, product_id, store, status, current_period_end)
select id, 'platform', null, 'test-comp', 'test', 'active', now() + interval '60 days'
from target
on conflict (user_id, scope, creator_id) do update
  set status = 'active',
      product_id = 'test-comp',
      store = 'test',
      current_period_end = now() + interval '60 days',
      updated_at = now()
returning user_id, status, current_period_end;

commit;

-- ── Check ──────────────────────────────────────────────────────────────────
-- Who currently holds Premium without having paid for it.
--
-- TWO categories, not one. `store = 'test'` is what this file grants. But the
-- dev-unlock path in verify-purchase writes `product_id = 'dev_unlock'` and no
-- store at all, so a query on store alone misses every one of those — and
-- while ALLOW_DEV_UNLOCK was set, any signed-in account could grant itself one
-- by calling the endpoint directly. Check both:
--
--   select u.email, e.product_id, e.store, e.status, e.current_period_end
--   from public.entitlements e
--   join auth.users u on u.id = e.user_id
--   where e.status = 'active'
--     and (e.store = 'test' or e.product_id = 'dev_unlock'
--          or e.store is null);

-- ── Revoke, one tester ─────────────────────────────────────────────────────
--   update public.entitlements e
--   set status = 'expired', current_period_end = now(), updated_at = now()
--   from auth.users u
--   where u.id = e.user_id
--     and lower(u.email) = lower('alexander.oschwald@gmail.com')
--     and e.store = 'test';

-- ── Sweep before launch ────────────────────────────────────────────────────
-- Expires everything granted without a payment. Real subscriptions are
-- untouched: those carry store 'app_store' or 'play_store' and a product id
-- from lib/pricing.ts.
--
-- Not before launch, though — testers need theirs until the day you submit.
-- That is what the marking is for: so this can wait until the right moment
-- rather than being remembered.
--
--   update public.entitlements
--   set status = 'expired', current_period_end = now(), updated_at = now()
--   where status <> 'expired'
--     and (store = 'test' or product_id = 'dev_unlock' or store is null);
