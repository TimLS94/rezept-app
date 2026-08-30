-- ============================================================================
-- Monitoring: seeing trouble before a tester reports it.
--
-- app_errors.sql catches what breaks on the phone. This is the other half —
-- what the server does, and whether it is healthy. Between them:
--
--   app_errors     crashes and exceptions in the app
--   service_events every AI gateway call: which op, did it work, how long,
--                  and what the failure was when it did not
--
-- Why a table rather than the platform's own logs: the edge function log is a
-- stream you have to already be watching, it cannot be queried across days,
-- and it cannot be joined to anything. "Instagram imports started failing
-- three days ago" is a question, not a log line, and only a table can answer
-- it.
--
-- Deliberately no request bodies, no captions, no recipe content. An
-- operations table that accumulates user content is a liability that grows on
-- its own; counts and error codes are enough to see a problem, and they age
-- into harmlessness.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

create table if not exists public.service_events (
  id          bigserial primary key,
  op          text not null,
  ok          boolean not null,
  error       text,
  duration_ms integer,
  user_id     uuid,
  meta        jsonb,
  created_at  timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists service_events_time_idx on public.service_events (created_at desc);
create index if not exists service_events_op_idx on public.service_events (op, created_at desc);

alter table public.service_events enable row level security;
-- Written only by the service role (the gateway). No client policy at all.
revoke all on public.service_events from anon, authenticated;

-- ── The one call a dashboard makes ─────────────────────────────────────────
-- Everything worth a glance, in one round trip: is anything failing, is
-- anything slowing down, is anyone using it, is anything selling.
--
-- Admin only, checked inside the function, so there is no version of this an
-- ordinary signed-in user can reach.
create or replace function public.admin_health(p_hours int default 24)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  is_admin boolean;
  since timestamptz := now() - make_interval(hours => p_hours);
begin
  select role = 'admin' into is_admin from public.profiles where id = auth.uid();
  if not coalesce(is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'since', since,
    'hours', p_hours,

    -- Per-operation health. A failure rate is the number that shows a problem
    -- starting; a raw failure count only shows one that has already arrived.
    'ops', coalesce((
      select jsonb_agg(x order by x->>'calls' desc) from (
        select jsonb_build_object(
                 'op', op,
                 'calls', count(*),
                 'failed', count(*) filter (where not ok),
                 'failure_rate', round(100.0 * count(*) filter (where not ok) / greatest(count(*), 1), 1),
                 'p50_ms', percentile_disc(0.5) within group (order by duration_ms),
                 'p95_ms', percentile_disc(0.95) within group (order by duration_ms),
                 'top_error', (
                   select error from public.service_events e2
                   where e2.op = e.op and not e2.ok and e2.created_at > since
                   group by error order by count(*) desc limit 1)
               ) as x
        from public.service_events e
        where created_at > since
        group by op
      ) t), '[]'::jsonb),

    -- App-side crashes, grouped, because one bug reported forty times is one
    -- bug.
    'errors', coalesce((
      select jsonb_agg(x order by x->>'count' desc) from (
        select jsonb_build_object(
                 'message', message, 'kind', kind, 'count', count(*),
                 'users', count(distinct user_id), 'last_seen', max(created_at),
                 'update_id', max(update_id)) as x
        from public.app_errors
        where created_at > since
        group by message, kind
        order by count(*) desc limit 15
      ) t), '[]'::jsonb),

    'usage', jsonb_build_object(
      'signups', (select count(*) from public.profiles where created_at > since),
      'total_users', (select count(*) from public.profiles),
      'cooks', (select count(*) from public.cook_log where created_at > since),
      'recipes_saved', (select count(*) from public.my_recipes where created_at > since),
      'imports', (select count(*) from public.recipe_imports where created_at > since),
      'fridge_scans', (select count(*) from public.fridge_scans where created_at > since)
    ),

    'money', jsonb_build_object(
      'active_premium', (select count(*) from public.entitlements
                         where scope = 'platform' and status = 'active'),
      -- Both ways an account can hold Premium without paying: granted by
      -- grant_test_premium.sql (store 'test'), or by the dev-unlock endpoint
      -- (product_id 'dev_unlock', no store). Counting only the first would
      -- have reported zero while the second was reachable by anyone.
      'comped', (select count(*) from public.entitlements
                 where status = 'active'
                   and (store = 'test' or product_id = 'dev_unlock' or store is null)),
      'purchases', (select count(*) from public.purchase_events where occurred_at > since),
      'gross_cents', (select coalesce(sum(price_cents), 0) from public.purchase_events
                      where occurred_at > since),
      'payouts_pending', (select count(*) from public.creator_payouts where status = 'pending')
    ));
end; $$;

revoke all on function public.admin_health(int) from public, anon;
grant execute on function public.admin_health(int) to authenticated;

-- ── Keeping it small ───────────────────────────────────────────────────────
-- Operational data has no value once it is old, and a table nobody prunes is
-- a bill that grows quietly. Call this from a scheduled job, or by hand.
create or replace function public.prune_monitoring(p_keep_days int default 30)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a int; b int;
begin
  delete from public.service_events where created_at < now() - make_interval(days => p_keep_days);
  get diagnostics a = row_count;
  delete from public.app_errors where created_at < now() - make_interval(days => p_keep_days);
  get diagnostics b = row_count;
  return jsonb_build_object('service_events', a, 'app_errors', b);
end; $$;

revoke all on function public.prune_monitoring(int) from public, anon, authenticated;

commit;
