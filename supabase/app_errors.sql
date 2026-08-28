-- ============================================================================
-- Somewhere for crashes to land.
--
-- Until now there was nowhere. No Sentry, no error boundary, no global
-- handler — so "it crashed" reached us as a sentence from a tester and
-- nothing else. App Store Connect keeps native crash logs, but a JavaScript
-- error shows up there as a frame inside the engine, which tells you the app
-- died without telling you where or why.
--
-- Anyone signed in can write; nobody but an admin can read. That asymmetry is
-- the point: a crash report has to be writable at the worst possible moment,
-- by an app that is already in trouble, and its contents — a stack trace, a
-- screen name — are nobody else's business.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

create table if not exists public.app_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  kind        text not null,           -- 'render' | 'js' | 'promise' | 'handled'
  message     text not null,
  stack       text,
  screen      text,
  app_version text,
  update_id   text,                    -- which OTA bundle was running
  platform    text,
  extra       jsonb,
  created_at  timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists app_errors_time_idx on public.app_errors (created_at desc);
create index if not exists app_errors_kind_idx on public.app_errors (kind, created_at desc);

alter table public.app_errors enable row level security;

-- Write-only for the app. No select policy at all, so a client cannot read
-- back what anyone else's device reported.
drop policy if exists "Anyone signed in can report an error" on public.app_errors;
create policy "Anyone signed in can report an error" on public.app_errors
  for insert with check (auth.uid() = user_id or user_id is null);

revoke all on public.app_errors from anon, authenticated;
grant insert on public.app_errors to authenticated, anon;

-- ── What the dashboard asks ────────────────────────────────────────────────
-- Grouped by message, because one bug reported forty times is one bug. Admin
-- only: the check is inside the function, so there is no version of this that
-- an ordinary signed-in user can call.
create or replace function public.admin_error_summary(p_days int default 7)
returns jsonb language plpgsql security definer set search_path = public as $$
declare is_admin boolean;
begin
  select role = 'admin' into is_admin from public.profiles where id = auth.uid();
  if not coalesce(is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  return jsonb_build_object(
    'ok', true,
    'since', (now() - make_interval(days => p_days)),
    'groups', coalesce((
      select jsonb_agg(g order by g->>'count' desc)
      from (
        select jsonb_build_object(
                 'message', message,
                 'kind', kind,
                 'count', count(*),
                 'users', count(distinct user_id),
                 'last_seen', max(created_at),
                 'update_id', max(update_id),
                 'screen', max(screen),
                 'stack', max(stack)
               ) as g
        from public.app_errors
        where created_at > now() - make_interval(days => p_days)
        group by message, kind
        order by count(*) desc
        limit 50
      ) t
    ), '[]'::jsonb));
end; $$;

revoke all on function public.admin_error_summary(int) from public, anon;
grant execute on function public.admin_error_summary(int) to authenticated;

commit;
