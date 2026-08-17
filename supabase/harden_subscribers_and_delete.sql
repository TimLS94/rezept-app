-- ============================================================================
-- SD-05: who follows whom stops being public.
-- SD-06: delete_account() checks that somebody is signed in.
--
-- Idempotent. Safe to run before or after the other hardening files.
-- ============================================================================

begin;

-- ── SD-05 ─────────────────────────────────────────────────────────────────
-- `Anyone can view subscriptions` let any caller read subscriber_id together
-- with creator_id, so the full follow graph was downloadable with the public
-- anon key. Confirmed against production.
--
-- The policy existed to power subscriber counts on creator pages. A count is
-- not the list, so the count moves into a function and the list becomes
-- private.
--
-- Dropped by shape, not by name. The same permissive rule exists under at
-- least two names in this repo's history — "Anyone can view subscriptions" in
-- creator_discovery.sql and "Anyone can view subscriber counts" in
-- reset_and_rebuild.sql — and dropping one by name left the other in place,
-- which is exactly how the first version of this file failed to close
-- anything. Anything that grants SELECT here and is not one of the two rules
-- created below goes.
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'creator_subscribers'
      and cmd in ('SELECT', 'ALL')
      and policyname not in ('Users view own subscriptions', 'Creators view their subscribers')
  loop
    execute format('drop policy %I on public.creator_subscribers', pol.policyname);
  end loop;
end $$;

drop policy if exists "Users view own subscriptions" on public.creator_subscribers;
create policy "Users view own subscriptions" on public.creator_subscribers
  for select using (auth.uid() = subscriber_id);

-- Creators may see who subscribes to them — that is their own audience, and
-- the payout screen already shows it.
drop policy if exists "Creators view their subscribers" on public.creator_subscribers;
create policy "Creators view their subscribers" on public.creator_subscribers
  for select using (auth.uid() = creator_id);

-- The public number, without the names behind it.
create or replace function public.creator_subscriber_count(p_creator_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.creator_subscribers where creator_id = p_creator_id;
$$;
grant execute on function public.creator_subscriber_count(uuid) to anon, authenticated;

-- ── SD-06 ─────────────────────────────────────────────────────────────────
-- delete_account() had no signed-in check and answered an anonymous call with
-- HTTP 204 — success. It deleted nothing only because `influencer_id = NULL`
-- never matches in SQL. That is an accident of NULL semantics, not a decision,
-- and it would stop protecting us the moment one of these predicates changed.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  delete from public.recipes where influencer_id = auth.uid();
  delete from auth.users where id = auth.uid();  -- cascades to profiles + children
end;
$$;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

commit;
