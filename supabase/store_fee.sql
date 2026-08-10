-- ============================================================================
-- The store's cut, in one place.
--
-- Every grant function used to hard-code `* 0.85`, i.e. a 15% store fee. That
-- number is only correct if you are enrolled in the App Store Small Business
-- Program. It is not the default:
--
--   Apple, standard                          30%
--   Apple, Small Business Program (<$1M/yr)  15%   ← requires enrolling
--   Apple, subscription in year 2+           15% standard / 10% in the program
--   Google Play, first $1M per year          15%   (applied automatically)
--
-- Enrol at https://developer.apple.com/app-store/small-business-program/ before
-- the first sale. Until then every "you keep $X" figure shown to a creator is
-- 15 percentage points too high, and the creator pool is overstated by the same
-- amount — the app would be promising money that never arrives.
--
-- Change the rate HERE and every payout figure follows. Keep it in step with
-- STORE_FEE_BPS in lib/pricing.ts, which drives the same numbers in the UI.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

create or replace function public.store_fee_bps()
returns integer language sql immutable set search_path = public as $$
  -- 1500 = 15% (Small Business Program). Use 3000 until enrolment is confirmed.
  select 1500;
$$;
grant execute on function public.store_fee_bps() to authenticated;

-- Net proceeds after the store's cut, rounded to whole cents.
create or replace function public.net_after_store_fee(p_price_cents integer)
returns integer language sql immutable set search_path = public as $$
  select round(p_price_cents * (10000 - public.store_fee_bps()) / 10000.0)::int;
$$;
grant execute on function public.net_after_store_fee(integer) to authenticated;

-- ── Re-point the grant functions at it ────────────────────────────────────
-- Same bodies as in creator_pricing.sql / payments.sql, with the literal
-- replaced. Kept here so the fee lives in exactly one place.

create or replace function public.grant_recipe_purchase(p_recipe_id uuid, p_price_cents int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare creator uuid; net int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select influencer_id into creator from public.recipes where id = p_recipe_id;
  if creator is null then
    return jsonb_build_object('ok', false, 'error', 'recipe_not_found');
  end if;

  insert into public.recipe_purchases (user_id, recipe_id, creator_id, price_cents)
  values (auth.uid(), p_recipe_id, creator, p_price_cents)
  on conflict (user_id, recipe_id) do nothing;

  if found then
    net := public.net_after_store_fee(p_price_cents);
    insert into public.purchase_events (user_id, event_type, product_id, price_cents, net_cents, currency, creator_id, occurred_at)
    values (auth.uid(), 'RECIPE_PURCHASE', p_recipe_id::text, p_price_cents, net, 'USD', creator, now());
  end if;

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.grant_recipe_purchase(uuid, int) to authenticated;

create or replace function public.grant_creator_entitlement(p_creator_id uuid, p_price_cents int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare existing uuid; net int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select id into existing from public.entitlements
  where user_id = auth.uid() and scope = 'creator' and creator_id = p_creator_id limit 1;

  if existing is null then
    insert into public.entitlements (user_id, scope, creator_id, status, rc_app_user_id, current_period_end)
    values (auth.uid(), 'creator', p_creator_id, 'active', auth.uid()::text, now() + interval '32 days');
  else
    update public.entitlements
    set status = 'active', current_period_end = now() + interval '32 days', updated_at = now()
    where id = existing;
  end if;

  if coalesce(p_price_cents, 0) > 0 then
    net := public.net_after_store_fee(p_price_cents);
    insert into public.purchase_events (user_id, event_type, product_id, price_cents, net_cents, currency, creator_id, occurred_at)
    values (auth.uid(), 'CREATOR_SUBSCRIPTION', p_creator_id::text, p_price_cents, net, 'USD', p_creator_id, now());
  end if;

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.grant_creator_entitlement(uuid, int) to authenticated;

create or replace function public.grant_platform_entitlement(p_product text default null, p_price_cents int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare existing uuid; net int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  select id into existing from public.entitlements
  where user_id = auth.uid() and scope = 'platform' and creator_id is null limit 1;
  if existing is null then
    insert into public.entitlements (user_id, scope, status, product_id, rc_app_user_id, current_period_end)
    values (auth.uid(), 'platform', 'active', p_product, auth.uid()::text, now() + interval '32 days');
    if coalesce(p_price_cents, 0) > 0 then
      net := public.net_after_store_fee(p_price_cents);
      insert into public.purchase_events (user_id, event_type, product_id, price_cents, net_cents, currency, occurred_at)
      values (auth.uid(), 'INITIAL_PURCHASE', p_product, p_price_cents, net, 'USD', now());
    end if;
  else
    update public.entitlements
    set status = 'active', product_id = coalesce(p_product, product_id),
        current_period_end = now() + interval '32 days', updated_at = now()
    where id = existing;
  end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.grant_platform_entitlement(text, int) to authenticated;

-- Expose the rate so the app can show the real split instead of a guess.
create or replace function public.fee_breakdown()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'store_fee_bps', public.store_fee_bps(),
    'platform_fee_bps', 2500
  );
$$;
grant execute on function public.fee_breakdown() to anon, authenticated;

commit;
