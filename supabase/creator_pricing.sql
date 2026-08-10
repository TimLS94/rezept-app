-- ============================================================================
-- Phase 2 — creator-set pricing.
--
-- THE MODEL: app Premium and creator content are two separate wallets.
--   • App Premium ($4.99/mo) buys the TOOLS — fridge scan, imports, planning.
--     It deliberately does NOT unlock any creator's paid recipes.
--   • Creator content is paid to the creator, either per recipe (forever) or
--     as a monthly membership to that creator. 75% goes to them directly.
--
-- So there are exactly two ways into a paid recipe:
--   1. Creator membership   → every paid recipe by that one creator
--   2. Single recipe purchase → that one recipe, forever
--
-- Keeping these separate is what makes creator earnings legible: a creator's
-- payout is the sum of what people actually paid them, not a share of a pool.
--
-- Prices come from a FIXED TIER LIST, not a free-text field: Apple and Google
-- only bill through pre-registered IAP products, so every price a creator can
-- pick has to exist as a product in the store. The check constraints below are
-- the DB half of that contract — keep them in sync with PRICE_TIERS in
-- lib/pricing.ts and with the products registered in RevenueCat.
--
-- Idempotent. Run in the Supabase SQL Editor AFTER payments.sql.
-- ============================================================================

begin;

-- ── Creator-side price configuration ───────────────────────────────────────
alter table public.profiles
  add column if not exists default_recipe_price_cents integer;

-- subscription_price_cents predates the tier list (payments.sql added it as a
-- free integer). Any value that isn't a tier has no store product behind it and
-- could never be charged, so null it out — otherwise the constraint below
-- aborts the whole script on a pre-existing row.
update public.profiles set subscription_price_cents = null
where subscription_price_cents is not null
  and subscription_price_cents not in (299, 499, 699, 999, 1499);

-- Allowed tiers (cents). Null = creator hasn't set one.
do $$ begin
  alter table public.profiles add constraint profiles_sub_price_tier
    check (subscription_price_cents is null
           or subscription_price_cents in (299, 499, 699, 999, 1499));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles add constraint profiles_recipe_price_tier
    check (default_recipe_price_cents is null
           or default_recipe_price_cents in (99, 199, 299, 499, 999));
exception when duplicate_object then null; end $$;

-- ── Per-recipe price. Null = fall back to the creator's default. ────────────
alter table public.recipes
  add column if not exists price_cents integer;

do $$ begin
  alter table public.recipes add constraint recipes_price_tier
    check (price_cents is null or price_cents in (99, 199, 299, 499, 999));
exception when duplicate_object then null; end $$;

-- ── One-off recipe unlocks (permanent, not a subscription). ────────────────
create table if not exists public.recipe_purchases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade not null,
  recipe_id   uuid references public.recipes(id) on delete cascade not null,
  creator_id  uuid references public.profiles(id) on delete set null,
  price_cents integer not null,
  created_at  timestamptz default now() not null,
  unique (user_id, recipe_id)
);
create index if not exists recipe_purchases_user_idx on public.recipe_purchases(user_id);
alter table public.recipe_purchases enable row level security;

drop policy if exists "Users view own recipe purchases" on public.recipe_purchases;
create policy "Users view own recipe purchases" on public.recipe_purchases
  for select using (auth.uid() = user_id);
-- No client INSERT: only the RPC below writes, after the store confirmed payment.

-- ── The price a given recipe actually sells for. ───────────────────────────
-- Per-recipe override wins, then the creator's default. Null means the creator
-- never set a price, so single purchase isn't offered (subscription only).
create or replace function public.recipe_price_cents(p_recipe_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(r.price_cents, p.default_recipe_price_cents)
  from public.recipes r
  left join public.profiles p on p.id = r.influencer_id
  where r.id = p_recipe_id;
$$;
grant execute on function public.recipe_price_cents(uuid) to anon, authenticated;

-- ── Access gate, now with creator subscriptions + single purchases. ─────────
-- Replaces the version in payments.sql. The locked teaser additionally carries
-- the two prices, so the client can render the unlock options without a second
-- round trip (and without ever seeing the premium steps).
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
  price int;
  sub_price int;
  sub_on boolean;
begin
  select * into r from public.recipes where id = p_recipe_id;
  if r.id is null then return null; end if;

  select to_jsonb(p) into prof
  from (select id, full_name, username, avatar_url
        from public.profiles where id = r.influencer_id) p;

  select coalesce(r.price_cents, pr.default_recipe_price_cents),
         pr.subscription_price_cents,
         coalesce(pr.subscription_enabled, false)
    into price, sub_price, sub_on
  from public.profiles pr where pr.id = r.influencer_id;

  ing_count  := coalesce(jsonb_array_length(case when jsonb_typeof(r.ingredients)  = 'array' then r.ingredients  else '[]'::jsonb end), 0);
  step_count := coalesce(jsonb_array_length(case when jsonb_typeof(r.instructions) = 'array' then r.instructions else '[]'::jsonb end), 0);

  -- NOTE: app Premium (profiles.is_premium / entitlements scope='platform') is
  -- deliberately absent here. Premium buys app features, not creator content —
  -- if it unlocked paid recipes, creators would be selling something their
  -- audience had already bought from us, and every creator price would be
  -- undercut by a subscription they see no money from.
  has_access := (coalesce(r.is_paid, false) = false)
    or r.influencer_id = auth.uid()
    or exists (
      select 1 from public.entitlements e
      where e.user_id = auth.uid() and e.status = 'active'
        and e.scope = 'creator' and e.creator_id = r.influencer_id
    )
    or exists (
      select 1 from public.recipe_purchases rp
      where rp.user_id = auth.uid() and rp.recipe_id = r.id
    );

  base := to_jsonb(r)
    || jsonb_build_object('profiles', prof, 'ingredients_count', ing_count, 'steps_count', step_count);

  if has_access then
    return base || jsonb_build_object('locked', false);
  end if;

  select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb) into teaser_ing
  from (
    select elem, ord from jsonb_array_elements(
      case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end
    ) with ordinality as t(elem, ord)
    order by ord limit 3
  ) s;

  return (base - 'instructions')
    || jsonb_build_object(
         'locked', true,
         'ingredients', teaser_ing,
         'unlock_price_cents', price,
         'creator_subscription_price_cents', case when sub_on then sub_price else null end
       );
end; $$;
grant execute on function public.get_recipe_full(uuid) to anon, authenticated;

-- ── Purchase grants (called after the store confirms payment). ─────────────
-- Both record a purchase_event WITH creator_id set, which is what keeps the
-- money attributed instead of pooled — see the earnings function below.
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
    net := round(p_price_cents * 0.85);   -- after the 15% store fee
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
    net := round(p_price_cents * 0.85);
    insert into public.purchase_events (user_id, event_type, product_id, price_cents, net_cents, currency, creator_id, occurred_at)
    values (auth.uid(), 'CREATOR_SUBSCRIPTION', p_creator_id::text, p_price_cents, net, 'USD', p_creator_id, now());
  end if;

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.grant_creator_entitlement(uuid, int) to authenticated;

-- ── Earnings: direct sales, plus an optional share of platform revenue. ────
--
-- Under the current model a creator's income is their OWN sales: recipe
-- purchases and memberships, 75% of net. App Premium pays for the app's tools
-- and infrastructure, so none of it is shared out by default — hence
-- pool_share_bps = 0.
--
-- The cook-based pool machinery below is kept intact and driven by that single
-- constant. Set it to e.g. 2500 to hand a quarter of Premium revenue to
-- creators as a reach bonus, split by how often their recipes are cooked; the
-- earnings screen already renders the two streams separately. Deleting the
-- code instead would mean rebuilding (and re-testing) all of it to turn the
-- idea back on.
--
-- The pool only ever counts events with creator_id IS NULL. Without that
-- filter a creator's own direct sales would be tipped into the pool and split
-- across every creator by cook count — they'd be paying their competitors.
create or replace function public.creator_earnings_estimate()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me            uuid := auth.uid();
  p_start       date := date_trunc('month', now())::date;
  p_end         date := (date_trunc('month', now()) + interval '1 month - 1 day')::date;
  platform_bps  int  := 2500;   -- platform's cut of a creator's own sales
  pool_share_bps int := 0;      -- share of app-Premium revenue given to creators
  pool_net      int;
  my_total      int;
  my_paid       int;
  total_paid    int;
  creator_pool  int;
  my_share      numeric := 0;
  pool_cents    int := 0;
  direct_net    int;
  direct_cents  int := 0;
begin
  -- Pooled: platform-wide subscription revenue, nobody's in particular.
  select coalesce(sum(net_cents), 0) into pool_net
  from public.purchase_events
  where occurred_at >= p_start and occurred_at < (p_end + 1)
    and creator_id is null;

  -- 0 by default: Premium buys app features, so that revenue stays with the app.
  creator_pool := floor(pool_net * pool_share_bps / 10000.0);

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
    my_share   := my_paid::numeric / total_paid;
    pool_cents := floor(creator_pool * my_share);
  end if;

  -- Direct: this creator's own recipe sales and profile subscriptions.
  select coalesce(sum(net_cents), 0) into direct_net
  from public.purchase_events
  where occurred_at >= p_start and occurred_at < (p_end + 1)
    and creator_id = me;
  direct_cents := floor(direct_net * (10000 - platform_bps) / 10000.0);

  return jsonb_build_object(
    'period_start', p_start, 'period_end', p_end, 'is_estimate', true, 'currency', 'USD',
    'pool_net_cents', pool_net, 'creator_pool_cents', creator_pool,
    'platform_fee_pct', platform_bps / 100.0,
    'my_total_cooks', my_total, 'my_paid_cooks', my_paid, 'total_paid_cooks', total_paid,
    'my_share_pct', round(my_share * 100, 2),
    'pool_cents', pool_cents,
    'direct_cents', direct_cents,
    'estimated_cents', pool_cents + direct_cents
  );
end; $$;
grant execute on function public.creator_earnings_estimate() to authenticated;

commit;
