-- ============================================================================
-- A creator membership was granting app-wide Premium.
--
-- The webhook wrote `scope: 'platform'` for every purchase event, whatever had
-- been bought. So subscribing to one creator for $4.99 — and, after recipes
-- became consumables, buying a single $0.99 recipe, which Apple reports as
-- NON_RENEWING_PURCHASE — unlocked all of Premium.
--
-- revenuecat-webhook/index.ts now routes by product id. This file clears the
-- rows the old version already wrote. Run it AFTER deploying the function,
-- otherwise the next webhook event writes them straight back.
--
-- Run in the Supabase SQL Editor.
-- ============================================================================

-- ── Look first ─────────────────────────────────────────────────────────────
-- Platform entitlements whose product is not a platform product. Every row is
-- someone holding Premium they never bought.
select u.email, e.product_id, e.store, e.status, e.current_period_end
from public.entitlements e
join auth.users u on u.id = e.user_id
where e.scope = 'platform'
  and e.status <> 'expired'
  and e.product_id is not null
  and e.product_id not in ('premium_monthly', 'premium_yearly')
  and e.store in ('app_store', 'play_store');

-- ── Then revoke ────────────────────────────────────────────────────────────
-- Deliberately narrow. `store in (...)` keeps comped accounts (store 'test',
-- 'creator') out of it: those are grants someone made on purpose, and sweeping
-- them here would silently revoke them under the banner of a bug fix. The
-- sweep for those lives in grant_test_premium.sql, where it belongs.
--
-- The matching creator-scope row is untouched: that membership was paid for
-- and stays valid. Only the Premium it should never have carried goes away.
update public.entitlements
set status = 'expired', current_period_end = now(), updated_at = now()
where scope = 'platform'
  and status <> 'expired'
  and product_id is not null
  and product_id not in ('premium_monthly', 'premium_yearly')
  and store in ('app_store', 'play_store');
