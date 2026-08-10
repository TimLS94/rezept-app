-- ============================================================================
-- SECURITY — stop users from writing their own privilege columns.
--
-- The RLS policy on profiles is "you may update your own row", which is correct
-- as far as it goes: it restricts WHICH row, but says nothing about WHICH
-- COLUMNS. Postgres grants UPDATE at table level by default, so "your own row"
-- has meant every column of it — including `role` and `is_premium`.
--
-- Verified against the live database on 2026-08-05 with nothing but the anon
-- key that ships inside the app bundle:
--     update profiles set role = 'admin' where id = <own id>;   -- succeeded
--     update profiles set is_premium = true where id = <own id>; -- succeeded
--
-- So anyone who unpacks the IPA/APK could make themselves an admin, or hand
-- themselves Premium. Both were restored during the test; this script closes it.
--
-- The fix is column-level privileges. Note that revoking a column-level right
-- while a table-level right exists does nothing in Postgres — the table-level
-- grant has to go first, then the safe columns are granted back explicitly.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

revoke update on public.profiles from authenticated, anon;

-- Everything a user legitimately edits about themselves: their identity, their
-- links, and (for creators) their own prices. Deliberately absent:
--   role, is_premium, premium_until, is_creator  → entitlement & permissions
--   payouts_enabled, stripe_connect_id           → payout state, set by us
--   id, email, created_at, updated_at            → identity / bookkeeping
grant update (
  full_name,
  username,
  avatar_url,
  bio,
  instagram_url,
  tiktok_url,
  website,
  family_size,
  weekly_budget,
  subscription_enabled,
  subscription_price_cents,
  default_recipe_price_cents
) on public.profiles to authenticated;

commit;

-- ── Consequence: assigning the creator role ───────────────────────────────
-- app/influencer-login.tsx calls promoteToCreator() after every successful
-- sign-in on that screen, which writes role = 'creator'. That write now fails
-- (it only console.warns, so nothing crashes — the role just isn't granted).
--
-- That call was a hole in its own right: the "6-digit code" there is an email
-- OTP, not an invite, so anyone signing in via /influencer-login became a
-- creator. It also contradicts the comment in lib/recipes.ts, which says the
-- role is assigned deliberately by an admin.
--
-- Until that screen is reworked, grant the role here:
--   update public.profiles set role = 'creator' where username = 'their_handle';
--
-- ── Verify (expect: first two fail, third succeeds) ────────────────────────
-- Run these as a normal signed-in user, not in the SQL editor's admin session:
--   update public.profiles set role = 'admin' where id = auth.uid();
--   update public.profiles set is_premium = true where id = auth.uid();
--   update public.profiles set full_name = 'still works' where id = auth.uid();


-- ============================================================================
-- DO NOT RUN YET — this is the launch blocker, and running it now would break
-- the debug unlock you are currently testing with.
--
-- The three grant_* functions are SECURITY DEFINER and executable by any
-- authenticated user, and none of them verifies that a payment happened. They
-- exist so the app can record a purchase right after RevenueCat confirms it —
-- but nothing stops a client from calling them without buying anything:
--
--   rpc('grant_platform_entitlement', {p_price_cents: 0})  → free Premium
--   rpc('grant_recipe_purchase', {p_recipe_id: <any>, p_price_cents: 0})
--                                                          → free paid recipe
--   rpc('grant_creator_entitlement', {p_creator_id: <any>, p_price_cents: 0})
--                                                          → free membership
--
-- The last two defeat the creator paywall entirely: every price a creator sets
-- can be bypassed with one request using the anon key from the app bundle.
--
-- The fix is to stop trusting the client with grants. Move them behind the
-- RevenueCat webhook (supabase/functions/revenuecat-webhook), which runs with
-- the service role and receives a signed, verified purchase event from the
-- store. Then run:
--
--   revoke execute on function public.grant_platform_entitlement(text, int) from authenticated;
--   revoke execute on function public.grant_recipe_purchase(uuid, int)       from authenticated;
--   revoke execute on function public.grant_creator_entitlement(uuid, int)   from authenticated;
--
-- After that the client can no longer self-grant, and the debug unlock button
-- in Settings stops working — which is the point.
-- ============================================================================
