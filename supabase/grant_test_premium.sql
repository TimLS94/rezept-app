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
-- Who currently holds a comped subscription.
--
--   select u.email, e.status, e.current_period_end
--   from public.entitlements e
--   join auth.users u on u.id = e.user_id
--   where e.store = 'test';

-- ── Revoke, one tester ─────────────────────────────────────────────────────
--   update public.entitlements e
--   set status = 'expired', current_period_end = now(), updated_at = now()
--   from auth.users u
--   where u.id = e.user_id
--     and lower(u.email) = lower('alexander.oschwald@gmail.com')
--     and e.store = 'test';

-- ── Sweep before launch ────────────────────────────────────────────────────
-- Expires every comped account in one go. Real subscriptions are untouched:
-- they carry store 'app_store' or 'play_store', never 'test'.
--
--   update public.entitlements
--   set status = 'expired', current_period_end = now(), updated_at = now()
--   where store = 'test' and status <> 'expired';
