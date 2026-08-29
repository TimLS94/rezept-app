-- ============================================================================
-- Indexes for the queries added since the last audit.
--
-- cook_log had indexes on user_id and recipe_id — right for "what did this
-- person cook", which was all it was ever asked. Since then four things ask
-- it a different question, across every user, by time:
--
--   popular_recipes_this_week()   on every Home screen focus
--   creator_earnings_estimate()   on every creator's earnings screen
--   run_payouts()                 monthly
--   admin_health() / alerts       hourly
--
-- None of those can use either existing index, so each one reads the whole
-- table. That is invisible at a hundred rows and is the first thing to fall
-- over at a hundred thousand — and it falls over on the Home screen, which is
-- the worst possible place for it.
--
-- The composite is ordered (created_at, recipe_id) rather than the reverse
-- because every one of these filters on time first and then groups.
--
-- Idempotent, and CONCURRENTLY is deliberately not used: these tables are
-- small today, and a plain create takes a brief lock rather than risking a
-- half-built index nobody notices.
-- ============================================================================

begin;

create index if not exists cook_log_time_idx
  on public.cook_log (created_at desc);

create index if not exists cook_log_time_recipe_idx
  on public.cook_log (created_at, recipe_id);

-- admin_health counts sign-ups in a window; my_recipes and profiles are both
-- scanned by time there.
create index if not exists profiles_created_idx
  on public.profiles (created_at desc);

create index if not exists my_recipes_created_idx
  on public.my_recipes (created_at desc);

-- was_subscriber_at() is called once per cooked meal inside the payout run and
-- the earnings estimate — a lookup per row, over a window.
--
-- It reads `entitlements`, not `creator_subscribers`: platform Premium is what
-- makes a cook a paid cook. An earlier draft of this file indexed
-- creator_subscribers on (user_id, creator_id) and was wrong twice over — that
-- table's columns are creator_id and subscriber_id, and it is not the table the
-- function touches. It failed loudly, which is the good version of being wrong.
create index if not exists entitlements_user_scope_idx
  on public.entitlements (user_id, scope, created_at);

commit;
