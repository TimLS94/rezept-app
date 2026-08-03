-- Grant the signed-in user an active platform entitlement.
-- The app calls this AFTER RevenueCat confirms a purchase (customerInfo shows the
-- entitlement active — RevenueCat has already validated the store receipt).
-- This removes the edge-function/secret dependency for unlocking during testing.
--
-- NOTE (production hardening): this trusts the client's purchase claim. For a
-- fully tamper-proof setup, keep the RevenueCat webhook / sync-entitlements
-- function as the authoritative writer and drop the grant to authenticated.
create or replace function public.grant_platform_entitlement(p_product text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare existing uuid;
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
  else
    update public.entitlements
    set status = 'active',
        product_id = coalesce(p_product, product_id),
        current_period_end = now() + interval '32 days',
        updated_at = now()
    where id = existing;
  end if;

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.grant_platform_entitlement(text) to authenticated;
