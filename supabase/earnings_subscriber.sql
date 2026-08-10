-- ⚠️ SUPERSEDED — historical. supabase/payments.sql carries the current Model B
-- functions (incl. the is_premium fallback in was_subscriber_at). Run that one.
--
-- Model B: only cooks by active SUBSCRIBERS earn money (Sybil-resistant).
-- All cooks still count as reach; the earnings share uses subscriber cooks only.
-- Re-run in the SQL Editor after this change.

create or replace function public.was_subscriber_at(p_user uuid, p_when timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = p_user
      and e.scope = 'platform'
      and e.created_at <= p_when
      and coalesce(e.current_period_end, now()) >= p_when
  );
$$;
grant execute on function public.was_subscriber_at(uuid, timestamptz) to authenticated;

create or replace function public.creator_earnings_estimate()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me            uuid := auth.uid();
  p_start       date := date_trunc('month', now())::date;
  p_end         date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  platform_bps  int  := 2500;
  pool_net      int;
  my_total      int;
  my_paid       int;
  total_paid    int;
  creator_pool  int;
  my_share      numeric := 0;
  est_cents     int := 0;
begin
  select coalesce(sum(net_cents), 0) into pool_net
  from public.purchase_events
  where occurred_at >= p_start and occurred_at < (p_end + 1);

  creator_pool := floor(pool_net * (10000 - platform_bps) / 10000.0);

  select count(distinct (cl.user_id::text || ':' || cl.recipe_id || ':' || cl.created_at::date::text)) into my_total
  from public.cook_log cl join public.recipes r on r.id::text = cl.recipe_id
  where r.influencer_id = me and cl.created_at >= p_start and cl.created_at < (p_end + 1);

  select count(distinct (cl.user_id::text || ':' || cl.recipe_id || ':' || cl.created_at::date::text)) into my_paid
  from public.cook_log cl join public.recipes r on r.id::text = cl.recipe_id
  where r.influencer_id = me and cl.created_at >= p_start and cl.created_at < (p_end + 1)
    and public.was_subscriber_at(cl.user_id, cl.created_at);

  select count(distinct (cl.user_id::text || ':' || cl.recipe_id || ':' || cl.created_at::date::text)) into total_paid
  from public.cook_log cl join public.recipes r on r.id::text = cl.recipe_id
  where cl.created_at >= p_start and cl.created_at < (p_end + 1)
    and public.was_subscriber_at(cl.user_id, cl.created_at);

  if total_paid > 0 then
    my_share  := my_paid::numeric / total_paid;
    est_cents := floor(creator_pool * my_share);
  end if;

  return jsonb_build_object(
    'period_start', p_start, 'period_end', p_end, 'is_estimate', true, 'currency', 'USD',
    'pool_net_cents', pool_net, 'creator_pool_cents', creator_pool, 'platform_fee_pct', platform_bps / 100.0,
    'my_total_cooks', my_total, 'my_paid_cooks', my_paid, 'total_paid_cooks', total_paid,
    'my_share_pct', round(my_share * 100, 2), 'estimated_cents', est_cents
  );
end; $$;
grant execute on function public.creator_earnings_estimate() to authenticated;
