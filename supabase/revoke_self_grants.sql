-- ============================================================================
-- Close the self-service unlock hole.  (Audit finding SD-01)
--
-- grant_platform_entitlement(), grant_recipe_purchase() and
-- grant_creator_entitlement() check exactly one thing: that auth.uid() is not
-- null. No receipt, no store confirmation. Any registered account could call
-- them over HTTP and hand itself Premium, a paid recipe, or a creator
-- subscription — verified against production: the anonymous call is refused
-- only for being anonymous.
--
-- Unlocks now go through supabase/functions/verify-purchase, which asks
-- RevenueCat what the account actually bought and writes with the service
-- role. Nothing else may write entitlements.
--
-- ┌───────────────────────────────────────────────────────────────────────┐
-- │ RUN THIS ONLY AFTER:                                                  │
-- │   1. verify-purchase is deployed and REVENUECAT_SECRET_KEY is set     │
-- │   2. a build containing lib/purchases.ts calling it is live           │
-- │                                                                       │
-- │ Running it earlier does not expose anything — it makes purchases      │
-- │ fail closed, which is the safe direction, but paying users would hit  │
-- │ a dead end.                                                           │
-- └───────────────────────────────────────────────────────────────────────┘
--
-- Idempotent.
-- ============================================================================

begin;

revoke execute on function public.grant_platform_entitlement(text, int)
  from public, anon, authenticated;

-- These two may not exist on every database yet (they arrived with
-- creator_pricing.sql); revoking a missing function is an error, so each is
-- guarded rather than assumed.
do $$
begin
  if to_regprocedure('public.grant_recipe_purchase(uuid, int)') is not null then
    execute 'revoke execute on function public.grant_recipe_purchase(uuid, int)
             from public, anon, authenticated';
  end if;

  if to_regprocedure('public.grant_creator_entitlement(uuid, int)') is not null then
    execute 'revoke execute on function public.grant_creator_entitlement(uuid, int)
             from public, anon, authenticated';
  end if;
end $$;

-- Belt and braces: no direct writes to the tables the functions used to touch.
-- The service role bypasses RLS and grants, so verify-purchase is unaffected.
revoke insert, update, delete on public.entitlements from anon, authenticated;
revoke insert, update, delete on public.recipe_purchases from anon, authenticated;
revoke insert, update, delete on public.purchase_events from anon, authenticated;

commit;

-- ── Check afterwards ──────────────────────────────────────────────────────
-- Expect zero rows:
--
--   select p.proname, r.rolname
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral aclexplode(p.proacl) a
--   join pg_roles r on r.oid = a.grantee
--   where n.nspname = 'public'
--     and p.proname like 'grant_%entitlement' or p.proname = 'grant_recipe_purchase'
--     and r.rolname in ('anon', 'authenticated');
