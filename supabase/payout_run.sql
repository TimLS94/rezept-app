-- ============================================================================
-- Closing a month: turning estimates into owed amounts.
--
-- creator_earnings_estimate() has always shown a creator what they are on
-- track to earn. Nothing ever turned that into a fixed, owed figure —
-- creator_payouts was declared "written by the monthly reconciliation job"
-- and the job did not exist, so every payout row a creator could see was one
-- nobody could create.
--
-- This is that job, and it deliberately stops one step short of moving money.
-- It computes the period, freezes the numbers and writes an audit row per
-- creator with status 'pending'. Paying is a separate act (see the note at
-- the bottom), because how the money physically moves is not a decision a
-- SQL function should be making on its own.
--
-- The formula, in one place, matching creator_earnings_estimate():
--
--   direct   = the creator's own sales and profile subscriptions, net of the
--              store's cut, minus the platform's 25%
--   pool     = a share of platform-wide Premium revenue, split between
--              creators by their share of cooks by subscribers. 0% by
--              default: Premium buys app features, so that money stays with
--              the app. Change pool_share_bps in ONE place — here and in
--              creator_earnings_estimate() — or the estimate stops matching
--              what is actually paid, which is the worst possible bug in this
--              part of the system.
--
-- Idempotent per period: re-running recomputes a period that is still
-- pending, and refuses to touch one already marked paid. A figure someone has
-- been paid against must never move underneath them.
--
-- Run in the Supabase SQL Editor, then call it once a month:
--   select public.run_payouts('2026-08-01');
-- ============================================================================

begin;

create or replace function public.run_payouts(p_month date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p_start        date;
  p_end          date;
  platform_bps   int := 2500;   -- platform's cut of a creator's own sales
  pool_share_bps int := 0;      -- share of app-Premium revenue given to creators
  pool_net       int;
  creator_pool   int;
  total_paid     int;
  written        int := 0;
  skipped        int := 0;
  total_net      int := 0;
  rec            record;
begin
  -- Default to the month that has just finished, which is the only month it
  -- is ever safe to close: closing the current one would pay out half of it
  -- and then have nothing left to pay when it ends.
  p_start := coalesce(date_trunc('month', p_month)::date,
                      (date_trunc('month', now()) - interval '1 month')::date);
  p_end   := (p_start + interval '1 month - 1 day')::date;

  if p_start >= date_trunc('month', now())::date then
    return jsonb_build_object('ok', false, 'error', 'period_not_finished',
                              'period_start', p_start);
  end if;

  -- Platform-wide Premium revenue for the period: nobody's in particular.
  select coalesce(sum(net_cents), 0) into pool_net
  from public.purchase_events
  where occurred_at >= p_start and occurred_at < (p_end + 1)
    and creator_id is null;

  creator_pool := floor(pool_net * pool_share_bps / 10000.0);

  -- Cooks by people who were subscribers at the time, deduplicated the same
  -- way the estimate does it: one user cooking one recipe on one day counts
  -- once, however many times they open cook mode.
  select count(distinct (cl.user_id::text || ':' || cl.recipe_id || ':' || cl.created_at::date::text))
    into total_paid
  from public.cook_log cl
  join public.recipes r on r.id::text = cl.recipe_id
  where cl.created_at >= p_start and cl.created_at < (p_end + 1)
    and public.was_subscriber_at(cl.user_id, cl.created_at);

  for rec in
    -- Every creator with either kind of earning in the period. A creator with
    -- neither gets no row at all, rather than a row saying zero.
    with direct as (
      select creator_id,
             coalesce(sum(net_cents), 0) as net_cents
      from public.purchase_events
      where occurred_at >= p_start and occurred_at < (p_end + 1)
        and creator_id is not null
      group by creator_id
    ),
    cooks as (
      select r.influencer_id as creator_id,
             count(distinct (cl.user_id::text || ':' || cl.recipe_id || ':' || cl.created_at::date::text)) as paid_cooks
      from public.cook_log cl
      join public.recipes r on r.id::text = cl.recipe_id
      where cl.created_at >= p_start and cl.created_at < (p_end + 1)
        and public.was_subscriber_at(cl.user_id, cl.created_at)
      group by r.influencer_id
    )
    select coalesce(d.creator_id, c.creator_id) as creator_id,
           coalesce(d.net_cents, 0)            as direct_net,
           coalesce(c.paid_cooks, 0)           as paid_cooks
    from direct d
    full outer join cooks c on c.creator_id = d.creator_id
    where coalesce(d.creator_id, c.creator_id) is not null
  loop
    declare
      direct_cents int := floor(rec.direct_net * (10000 - platform_bps) / 10000.0);
      pool_cents   int := case when total_paid > 0
                               then floor(creator_pool * (rec.paid_cooks::numeric / total_paid))
                               else 0 end;
      gross        int := direct_cents + pool_cents;
      platform_fee int := rec.direct_net - direct_cents;
      already      text;
    begin
      if gross <= 0 then
        continue;
      end if;

      select status into already
      from public.creator_payouts
      where creator_id = rec.creator_id
        and period_start = p_start and period_end = p_end;

      -- A paid row is history. Recomputing it would change a number someone
      -- has already been paid against.
      if already = 'paid' then
        skipped := skipped + 1;
        continue;
      end if;

      insert into public.creator_payouts
        (creator_id, period_start, period_end, gross_cents, platform_fee_cents,
         net_cents, breakdown, status)
      values
        (rec.creator_id, p_start, p_end, gross, platform_fee, gross,
         jsonb_build_object(
           'formula_version', 1,
           'store_fee_bps', public.store_fee_bps(),
           'platform_bps', platform_bps,
           'pool_share_bps', pool_share_bps,
           'pool_net_cents', pool_net,
           'creator_pool_cents', creator_pool,
           'paid_cooks', rec.paid_cooks,
           'total_paid_cooks', total_paid,
           'direct_net_cents', rec.direct_net,
           'direct_cents', direct_cents,
           'pool_cents', pool_cents,
           'computed_at', now()),
         'pending')
      on conflict (creator_id, period_start, period_end) do update
        set gross_cents = excluded.gross_cents,
            platform_fee_cents = excluded.platform_fee_cents,
            net_cents = excluded.net_cents,
            breakdown = excluded.breakdown;

      written := written + 1;
      total_net := total_net + gross;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'period_start', p_start, 'period_end', p_end,
    'creators_written', written,
    'already_paid_skipped', skipped,
    'total_net_cents', total_net,
    'pool_net_cents', pool_net,
    'total_paid_cooks', total_paid);
end; $$;

-- Nobody but the service role runs this. It decides what people are owed.
revoke all on function public.run_payouts(date) from public, anon, authenticated;

commit;

-- ── What is deliberately NOT here ──────────────────────────────────────────
-- Moving the money. Two reasons, and both are decisions rather than code:
--
--  1. Stripe Connect transfers are funded from your Stripe balance. Revenue
--     from in-app purchases arrives at Apple and Google, not at Stripe, so
--     that balance is empty. Either you top the Stripe balance up from your
--     bank before each run, or creators get paid some other way entirely.
--
--  2. Apple pays out roughly 30–45 days after the month closes. Paying a
--     creator on the 1st means paying them out of your own pocket and waiting
--     to be reimbursed. Paying on receipt means telling creators plainly when
--     the money comes.
--
-- Once that is decided, marking a row paid is:
--
--   update public.creator_payouts
--   set status = 'paid', stripe_transfer_id = 'tr_...'
--   where id = '...';
