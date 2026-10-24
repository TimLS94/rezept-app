-- ============================================================================
-- Apple App Review test account.
--
-- App Store review needs working login credentials in App Store Connect.
--
-- DO NOT create the user by inserting into auth.users by hand — the
-- identities/auth schema differs between Supabase versions and a partial
-- insert leaves a broken account. Use the dashboard instead:
--
--   Authentication → Users → Add user → Create new user
--     Email:               apple.review@spoondrop.app
--     Password:            pick one, and put it in App Store Connect under
--                          App Review Information. It is NOT written down
--                          here: this repository is public, and a working
--                          login in a public file is a working login for
--                          everybody.
--     Auto Confirm User:   ON   ← required, reviewer gets no mailbox
--
-- The handle_new_user trigger creates the profiles row automatically.
-- Then run the grant below so the reviewer is never blocked by a paywall.
-- Same row the RevenueCat webhook writes, marked store='test' so it can be
-- swept before launch (see grant_test_premium.sql). No money moves.
--
-- Idempotent. Run in the Supabase SQL Editor AFTER creating the user.
-- ============================================================================

begin;

insert into public.entitlements
  (user_id, scope, creator_id, product_id, store, status, current_period_end)
select u.id, 'platform', null, 'test-comp', 'test', 'active', now() + interval '60 days'
from auth.users u
where lower(u.email) = lower('apple.review@spoondrop.app')
on conflict (user_id, scope, creator_id) do update
  set status = 'active',
      product_id = 'test-comp',
      store = 'test',
      current_period_end = now() + interval '60 days',
      updated_at = now()
returning user_id, status, current_period_end;

commit;

-- No row returned? The account doesn't exist yet — create it in the
-- dashboard first (steps above).

-- ── Check ──────────────────────────────────────────────────────────────────
--   select u.id, u.email, u.email_confirmed_at, e.status, e.store
--   from auth.users u
--   left join public.entitlements e on e.user_id = u.id and e.scope = 'platform'
--   where u.email = 'apple.review@spoondrop.app';
