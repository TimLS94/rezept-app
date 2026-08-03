-- Anti-abuse: earnings count DEDUPED cooks — at most one per user, per recipe,
-- per day. Repeatedly tapping "finished cooking" no longer inflates payouts.
-- The raw cook_log still stores every event (for the user's own streak/reward
-- and ratings); only the money math dedupes. Re-run in the SQL Editor.

create or replace function public.creator_earnings_estimate()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me            uuid := auth.uid();
  p_start       date := date_trunc('month', now())::date;
  p_end         date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  platform_bps  int  := 2500;                              -- 25 %
  pool_net      int;
  my_cooks      int;
  total_cooks   int;
  creator_pool  int;
  my_share      numeric := 0;
  est_cents     int := 0;
begin
  select coalesce(sum(net_cents), 0) into pool_net
  from public.purchase_events
  where occurred_at >= p_start and occurred_at < (p_end + 1);

  creator_pool := floor(pool_net * (10000 - platform_bps) / 10000.0);

  -- Deduped: one cook per (user, recipe, day).
  select count(distinct (cl.user_id::text || ':' || cl.recipe_id || ':' || cl.created_at::date::text)) into my_cooks
  from public.cook_log cl
  join public.recipes r on r.id::text = cl.recipe_id
  where r.influencer_id = me
    and cl.created_at >= p_start and cl.created_at < (p_end + 1);

  select count(distinct (cl.user_id::text || ':' || cl.recipe_id || ':' || cl.created_at::date::text)) into total_cooks
  from public.cook_log cl
  join public.recipes r on r.id::text = cl.recipe_id
  where cl.created_at >= p_start and cl.created_at < (p_end + 1);

  if total_cooks > 0 then
    my_share  := my_cooks::numeric / total_cooks;
    est_cents := floor(creator_pool * my_share);
  end if;

  return jsonb_build_object(
    'period_start',  p_start,
    'period_end',    p_end,
    'is_estimate',   true,
    'currency',      'USD',
    'pool_net_cents',      pool_net,
    'creator_pool_cents',  creator_pool,
    'platform_fee_pct',    platform_bps / 100.0,
    'my_cooks',      my_cooks,
    'total_cooks',   total_cooks,
    'my_share_pct',  round(my_share * 100, 2),
    'estimated_cents', est_cents
  );
end; $$;
grant execute on function public.creator_earnings_estimate() to authenticated;

create or replace function public.creator_engagement_breakdown()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me      uuid := auth.uid();
  p_start date := date_trunc('month', now())::date;
  result  jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into result
  from (
    select r.id as recipe_id, r.title,
           count(distinct (cl.user_id::text || ':' || cl.created_at::date::text))::int as cooks
    from public.cook_log cl
    join public.recipes r on r.id::text = cl.recipe_id
    where r.influencer_id = me and cl.created_at >= p_start
    group by r.id, r.title
    order by cooks desc
  ) t;
  return result;
end; $$;
grant execute on function public.creator_engagement_breakdown() to authenticated;
