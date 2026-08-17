-- ============================================================================
-- Creator profiles stop handing out e-mail addresses.  (Audit finding SD-04)
--
-- The policy `Anyone can view creator profiles USING (is_creator = true)` does
-- what it says — it allows the ROW. Postgres RLS has no column dimension, so
-- allowing the row allows every column in it. Read anonymously against
-- production, a creator profile returned: email, stripe_connect_id,
-- payouts_enabled, role, is_premium, premium_until, weekly_budget, family_size.
--
-- Column privileges are the missing half. `lock_recipe_content.sql` already
-- uses this pattern for ingredients and instructions.
--
-- Because column grants are not row-aware, taking `role` away from
-- `authenticated` takes it away from the owner too. my_profile() gives the
-- owner their own full row back.
--
-- ┌───────────────────────────────────────────────────────────────────────┐
-- │ Ship together with the app build that calls my_profile().             │
-- │ Running this against an older build breaks the role and family        │
-- │ lookups on sign-in.                                                   │
-- └───────────────────────────────────────────────────────────────────────┘
--
-- Idempotent.
-- ============================================================================

begin;

-- Start from nothing and hand back only what a stranger may see. Listing the
-- public columns (rather than revoking the private ones) means a column added
-- later is private by default — the safer direction to be wrong in.
revoke select on public.profiles from anon, authenticated;

grant select (
  id,
  full_name,
  username,
  avatar_url,
  bio,
  instagram_url,
  tiktok_url,
  website,
  is_creator,
  subscription_enabled,
  subscription_price_cents,
  default_recipe_price_cents,
  created_at
) on public.profiles to anon, authenticated;

-- ── Your own profile, in full ─────────────────────────────────────────────
-- Everything the app needs about the signed-in user and nothing about anyone
-- else. Security definer so it can read the columns the grants above withhold.
create or replace function public.my_profile()
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) from public.profiles p where p.id = auth.uid();
$$;
grant execute on function public.my_profile() to authenticated;

commit;

-- ── Check afterwards ──────────────────────────────────────────────────────
-- As an anonymous client this must fail with 42501:
--   GET /rest/v1/profiles?select=email&limit=1
-- and this must still work:
--   GET /rest/v1/profiles?select=id,full_name,username&is_creator=eq.true
