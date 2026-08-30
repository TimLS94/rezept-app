-- ============================================================================
-- Alerting: being told, rather than remembering to look.
--
-- The dashboard answers "how are things" for someone who thought to ask. This
-- is for the hours nobody asks — the point of monitoring is that a failure
-- rate climbing on a Saturday reaches you on the Saturday.
--
-- Three ideas keep it from becoming noise, which is the only way an alert
-- system ever fails:
--
--   Rules are about rates and firsts, not totals. "12% of imports failed" is
--   a signal; "47 imports failed" is a number that grows whether or not
--   anything is wrong.
--
--   Every rule needs a floor of traffic before it can fire. One failed call
--   out of one is 100% and means nothing.
--
--   An alert that has already been sent stays quiet until it clears. Being
--   told hourly about a thing you already know is how people learn to ignore
--   alerts, and an ignored alert is worse than none because it feels like
--   cover.
--
-- Idempotent. Run in the Supabase SQL Editor, after monitoring.sql.
-- ============================================================================

begin;

-- What has already been said, so it is not said again every hour.
create table if not exists public.alert_state (
  key         text primary key,
  first_fired timestamptz not null default now(),
  last_fired  timestamptz not null default now(),
  times       integer not null default 1,
  resolved_at timestamptz
);

alter table public.alert_state enable row level security;
revoke all on public.alert_state from anon, authenticated;

-- ── The rules ──────────────────────────────────────────────────────────────
-- Returns what is wrong right now, whether or not it has been reported.
-- Deciding what to send is the caller's job; deciding what is broken is this
-- function's.
create or replace function public.evaluate_alerts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  out_alerts jsonb := '[]'::jsonb;
  r record;
  n int;
begin
  -- 1. An operation failing more than it works. Twenty calls minimum, so a
  --    quiet night cannot trip it.
  for r in
    select op,
           count(*) as calls,
           count(*) filter (where not ok) as failed,
           round(100.0 * count(*) filter (where not ok) / count(*), 1) as rate,
           (select error from public.service_events e2
            where e2.op = e.op and not e2.ok and e2.created_at > now() - interval '1 hour'
            group by error order by count(*) desc limit 1) as top_error
    from public.service_events e
    where created_at > now() - interval '1 hour'
    group by op
    having count(*) >= 20 and count(*) filter (where not ok) * 100.0 / count(*) > 25
  loop
    out_alerts := out_alerts || jsonb_build_object(
      'key', 'op_failing:' || r.op,
      'severity', 'high',
      'title', r.op || ' is failing',
      'detail', format('%s%% of %s calls in the last hour failed. Most common: %s',
                       r.rate, r.calls, coalesce(r.top_error, 'unknown')));
  end loop;

  -- 2. A crash affecting more than a handful of people. Counted in people,
  --    not in reports: one person in a retry loop is not an outage.
  for r in
    select message, kind, count(distinct user_id) as users, count(*) as hits
    from public.app_errors
    where created_at > now() - interval '1 hour' and user_id is not null
    group by message, kind
    having count(distinct user_id) >= 3
  loop
    out_alerts := out_alerts || jsonb_build_object(
      'key', 'crash:' || left(md5(r.message), 12),
      'severity', 'high',
      'title', 'Crash affecting ' || r.users || ' people',
      'detail', left(r.message, 300));
  end loop;

  -- 3. The Instagram lookup allowance, which is small enough to run out in a
  --    day and takes the feature with it when it does.
  select count(*) into n
  from public.service_events
  where op = 'instagram-post' and error = 'rapidapi-429'
    and created_at > now() - interval '6 hours';
  if n >= 3 then
    out_alerts := out_alerts || jsonb_build_object(
      'key', 'rapidapi_quota',
      'severity', 'medium',
      'title', 'Instagram lookups are out of quota',
      'detail', format('%s refusals in six hours. The plan allowance is spent — imports by link are down until it resets or the plan is raised.', n));
  end if;

  -- 4. Nothing at all coming in. Silence is ambiguous — a quiet night looks
  --    identical to a broken gateway — so this is medium and worded as a
  --    question rather than a fact.
  select count(*) into n from public.service_events where created_at > now() - interval '6 hours';
  if n = 0 and exists (select 1 from public.service_events
                       where created_at > now() - interval '7 days') then
    out_alerts := out_alerts || jsonb_build_object(
      'key', 'silence',
      'severity', 'medium',
      'title', 'No AI calls in six hours',
      'detail', 'Either nobody is using it, or something between the app and the gateway is broken. Worth a look.');
  end if;

  -- 5. A comped account still live, which is a launch-day embarrassment
  --    rather than an outage.
  select count(*) into n from public.entitlements
  where status = 'active'
    and (store = 'test' or product_id = 'dev_unlock' or store is null);
  if n > 0 then
    out_alerts := out_alerts || jsonb_build_object(
      'key', 'comped_accounts',
      'severity', 'low',
      'title', n || ' comped account(s) still active',
      'detail', 'Free subscriptions granted for testing. Sweep them before launch — see grant_test_premium.sql.');
  end if;

  return jsonb_build_object('ok', true, 'at', now(), 'alerts', out_alerts);
end; $$;

revoke all on function public.evaluate_alerts() from public, anon, authenticated;

-- ── What is new since last time ────────────────────────────────────────────
-- Marks what it returns as sent, so the next call stays quiet about it. An
-- alert that stops appearing is marked resolved, and may fire again after
-- that — a problem that comes back is news.
create or replace function public.pending_alerts()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  evaluated jsonb := public.evaluate_alerts();
  current_keys text[];
  fresh jsonb := '[]'::jsonb;
  a jsonb;
begin
  select coalesce(array_agg(x->>'key'), '{}') into current_keys
  from jsonb_array_elements(evaluated->'alerts') x;

  -- Anything that has gone away is resolved, and may speak again later.
  update public.alert_state
  set resolved_at = now()
  where resolved_at is null and not (key = any(current_keys));

  for a in select * from jsonb_array_elements(evaluated->'alerts') loop
    -- Unreported, or reported and since resolved.
    if not exists (
      select 1 from public.alert_state
      where key = a->>'key' and resolved_at is null
    ) then
      insert into public.alert_state (key) values (a->>'key')
      on conflict (key) do update
        set last_fired = now(), times = public.alert_state.times + 1, resolved_at = null;
      fresh := fresh || a;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'at', now(), 'alerts', fresh,
                            'all', evaluated->'alerts');
end; $$;

revoke all on function public.pending_alerts() from public, anon, authenticated;

commit;

-- ── Running it on a schedule ───────────────────────────────────────────────
-- Needs pg_cron and pg_net, both available in Supabase (Database →
-- Extensions). Hourly is the right cadence for this set of rules: every rule
-- above is about something that would still be true in an hour, and a
-- five-minute cron on rules like these produces noise, not vigilance.
--
-- Set the two secrets first:
--   npx supabase secrets set ALERT_SECRET=<a long random string>
--   npx supabase secrets set ALERT_WEBHOOK_URL=<your Slack/Discord webhook>
--   npx supabase functions deploy alerts
--
-- Then, with <PROJECT_REF> and <ALERT_SECRET> filled in:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
--   select cron.schedule('spoondrop-alerts', '7 * * * *', $cron$
--     select net.http_post(
--       url := 'https://<PROJECT_REF>.supabase.co/functions/v1/alerts',
--       headers := jsonb_build_object('x-alert-secret', '<ALERT_SECRET>'),
--       body := '{}'::jsonb);
--   $cron$);
--
-- Minute 7 rather than 0: everyone's cron fires on the hour, and the quietest
-- minute is the one nobody chose.
--
-- To stop:  select cron.unschedule('spoondrop-alerts');
-- To see:   select * from cron.job_run_details order by start_time desc limit 20;
