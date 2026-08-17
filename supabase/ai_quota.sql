-- ============================================================================
-- A daily ceiling on the AI calls the app pays for.
--
-- Every Gemini, Groq and RapidAPI call is billed to us, and until now nothing
-- limited how many a single account could trigger. The load test ran 60
-- concurrent requests without a single rejection, so there was no natural
-- brake either: one script could run up an unbounded bill.
--
-- Counted server-side, per user per UTC day. The client cannot be trusted to
-- count, and a counter it can reach by reinstalling is not a limit.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default (now() at time zone 'utc')::date,
  op      text not null,
  count   int  not null default 0,
  primary key (user_id, day, op)
);

alter table public.ai_usage enable row level security;

-- Readable so the app can show "2 of 5 left"; never writable from a client.
drop policy if exists "Users read own ai usage" on public.ai_usage;
create policy "Users read own ai usage" on public.ai_usage
  for select using (auth.uid() = user_id);

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;

-- ── The limits ────────────────────────────────────────────────────────────
-- Deliberately generous for real use and useless for abuse. A person importing
-- recipes all evening stays under; a script does not.
create or replace function public.ai_daily_limit(p_op text)
returns int language sql immutable as $$
  select case p_op
    when 'recipe-from-text'   then 40
    when 'recipe-from-images' then 30
    when 'fridge-items'       then 10   -- the weekly cap in lib/fridge.ts still applies on top
    when 'instagram-post'     then 30
    when 'transcribe-video'   then 15   -- the most expensive call we make
    else 20
  end;
$$;

-- ── Claim one unit, or refuse ─────────────────────────────────────────────
-- Atomic: the insert-or-increment and the check happen in one statement, so
-- two requests racing cannot both see "one left" and both take it.
create or replace function public.consume_ai_quota(p_op text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare lim int; used int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  lim := public.ai_daily_limit(p_op);

  insert into public.ai_usage (user_id, day, op, count)
  values (auth.uid(), (now() at time zone 'utc')::date, p_op, 1)
  on conflict (user_id, day, op) do update
    set count = public.ai_usage.count + 1
  returning count into used;

  if used > lim then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded',
                              'used', used - 1, 'limit', lim);
  end if;

  return jsonb_build_object('ok', true, 'used', used, 'limit', lim);
end; $$;

-- Only the service role calls this — the gateway function, never the app. If a
-- client could call it, it could burn its own quota, which is harmless, but it
-- could also not be trusted to call it at all, which is the point.
revoke all on function public.consume_ai_quota(text) from public, anon, authenticated;

commit;
