-- Grant the signed-in user an active platform entitlement AND record the
-- subscription revenue, so the creator earnings pool reflects it.
-- The app calls this AFTER RevenueCat confirms a purchase (receipt validated).
-- Test/dev path — production should use the RevenueCat webhook as the
-- authoritative writer.
drop function if exists public.grant_platform_entitlement(text);

create or replace function public.grant_platform_entitlement(p_product text default null, p_price_cents int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare existing uuid; net int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select id into existing
  from public.entitlements
  where user_id = auth.uid() and scope = 'platform' and creator_id is null
  limit 1;

  if existing is null then
    insert into public.entitlements
      (user_id, scope, status, product_id, rc_app_user_id, current_period_end)
    values
      (auth.uid(), 'platform', 'active', p_product, auth.uid()::text, now() + interval '32 days');

    -- Record the subscription revenue once (net = after the 15% store fee).
    if coalesce(p_price_cents, 0) > 0 then
      net := round(p_price_cents * 0.85);  -- US: no VAT deducted
      insert into public.purchase_events
        (user_id, event_type, product_id, price_cents, net_cents, currency, occurred_at)
      values
        (auth.uid(), 'INITIAL_PURCHASE', p_product, p_price_cents, net, 'USD', now());
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
