-- ============================================================================
-- Payments schema — entitlements, purchase events, creator payouts + earnings.
-- Phase 1: app-wide Premium; revenue split among creators by cooked recipes.
-- Platform fee: 25 %  →  creators collectively receive 75 % of NET proceeds.
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

-- ── Creator config (price + payout account). Safe to add now. ───────────────
alter table public.profiles add column if not exists subscription_enabled     boolean default false;
alter table public.profiles add column if not exists subscription_price_cents  integer;       -- Phase 2
alter table public.profiles add column if not exists stripe_connect_id         text;          -- payouts
alter table public.profiles add column if not exists payouts_enabled           boolean default false;

-- ── Entitlements: a user's active access. Scope = 'platform' (P1) | 'creator' (P2)
create table if not exists public.entitlements (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references public.profiles(id) on delete cascade not null,
  scope              text not null check (scope in ('platform','creator')),
  creator_id         uuid references public.profiles(id) on delete cascade,
  product_id         text,
  store              text,
  rc_app_user_id     text,
  status             text not null default 'active' check (status in ('active','grace','expired','refunded')),
  current_period_end timestamptz,
  created_at         timestamptz default now() not null,
  updated_at         timestamptz default now() not null,
  unique (user_id, scope, creator_id)
);
create index if not exists entitlements_user_idx on public.entitlements(user_id);
alter table public.entitlements enable row level security;
drop policy if exists "Users view own entitlements" on public.entitlements;
create policy "Users view own entitlements" on public.entitlements
  for select using (auth.uid() = user_id);
-- No client INSERT/UPDATE: only the webhook (service role) writes entitlements.

-- ── Purchase events: immutable audit + revenue basis (written by webhook). ───
create table if not exists public.purchase_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  event_type   text,
  product_id   text,
  store        text,
  price_cents  integer,          -- gross price as charged
  net_cents    integer,          -- proceeds after the store fee (what you receive)
  currency     text default 'USD',
  creator_id   uuid,             -- Phase 2 direct attribution; Phase 1 null (pool)
  occurred_at  timestamptz,
  raw          jsonb,
  created_at   timestamptz default now() not null
);
create index if not exists purchase_events_occurred_idx on public.purchase_events(occurred_at);
alter table public.purchase_events enable row level security;
-- No client policies: service-role only.

-- ── Creator payouts: one finalized row per creator & month, with a snapshot. ─
create table if not exists public.creator_payouts (
  id                 uuid primary key default gen_random_uuid(),
  creator_id         uuid references public.profiles(id) on delete cascade not null,
  period_start       date not null,
  period_end         date not null,
  gross_cents        integer not null,   -- creator's attributed share of the net pool
  platform_fee_cents integer not null,
  net_cents          integer not null,   -- what gets paid out
  breakdown          jsonb,              -- immutable snapshot: pool, cooks, %, fees, formula version
  status             text not null default 'pending' check (status in ('pending','paid','failed')),
  stripe_transfer_id text,
  created_at         timestamptz default now() not null,
  unique (creator_id, period_start, period_end)
);
create index if not exists creator_payouts_creator_idx on public.creator_payouts(creator_id);
alter table public.creator_payouts enable row level security;
drop policy if exists "Creators view own payouts" on public.creator_payouts;
create policy "Creators view own payouts" on public.creator_payouts
  for select using (auth.uid() = creator_id);
-- Writes are service-role only (the monthly reconciliation job).

-- ── Server-side premium gate: full recipe only if free or entitled, else a
-- teaser (metadata + first 3 ingredients, NO steps). Premium content never
-- reaches an unentitled client. Embeds profile + counts for the card/teaser.
create or replace function public.get_recipe_full(p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.recipes;
  has_access boolean;
  prof jsonb;
  base jsonb;
  ing_count int;
  step_count int;
  teaser_ing jsonb;
begin
  select * into r from public.recipes where id = p_recipe_id;
  if r.id is null then return null; end if;

  select to_jsonb(p) into prof
  from (select id, full_name, username, avatar_url
        from public.profiles where id = r.influencer_id) p;

  ing_count  := coalesce(jsonb_array_length(case when jsonb_typeof(r.ingredients)  = 'array' then r.ingredients  else '[]'::jsonb end), 0);
  step_count := coalesce(jsonb_array_length(case when jsonb_typeof(r.instructions) = 'array' then r.instructions else '[]'::jsonb end), 0);

  has_access := (coalesce(r.is_paid, false) = false)
    or r.influencer_id = auth.uid()
    or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_premium = true)
    or exists (
      select 1 from public.entitlements e
      where e.user_id = auth.uid() and e.status = 'active'
        and (e.scope = 'platform'
             or (e.scope = 'creator' and e.creator_id = r.influencer_id))
    );

  base := to_jsonb(r)
    || jsonb_build_object('profiles', prof, 'ingredients_count', ing_count, 'steps_count', step_count);

  if has_access then
    return base || jsonb_build_object('locked', false);
  end if;

  -- Locked: teaser only — first 3 ingredients, steps removed.
  select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb) into teaser_ing
  from (
    select elem, ord from jsonb_array_elements(
      case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end
    ) with ordinality as t(elem, ord)
    order by ord limit 3
  ) s;

  return (base - 'instructions')
    || jsonb_build_object('locked', true, 'ingredients', teaser_ing);
end; $$;
grant execute on function public.get_recipe_full(uuid) to anon, authenticated;

-- ── Live earnings estimate for the signed-in creator (current month). ───────
-- Split rule: creators share 75 % of the month's NET proceeds, weighted by the
-- number of times their recipes were cooked (cook_log). 25 % stays with platform.
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

  select count(*) into my_cooks
  from public.cook_log cl
  join public.recipes r on r.id::text = cl.recipe_id
  where r.influencer_id = me
    and cl.created_at >= p_start and cl.created_at < (p_end + 1);

  select count(*) into total_cooks
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

-- ── Per-recipe cook breakdown for the signed-in creator (current month). ────
create or replace function public.creator_engagement_breakdown()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me      uuid := auth.uid();
  p_start date := date_trunc('month', now())::date;
  result  jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into result
  from (
    select r.id as recipe_id, r.title, count(*)::int as cooks
    from public.cook_log cl
    join public.recipes r on r.id::text = cl.recipe_id
    where r.influencer_id = me and cl.created_at >= p_start
    group by r.id, r.title
    order by cooks desc
  ) t;
  return result;
end; $$;
grant execute on function public.creator_engagement_breakdown() to authenticated;

-- ── Client-side grant after a confirmed RevenueCat purchase (see grant_entitlement.sql).
-- Also records the subscription revenue so the creator earnings pool reflects it.
drop function if exists public.grant_platform_entitlement(text);
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
      net := round(p_price_cents * 0.85);  -- after 15% store fee (US: no VAT deducted)
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

commit;
