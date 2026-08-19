-- ============================================================================
-- Somewhere to keep what the user tells us during onboarding.
--
-- One jsonb column rather than eight typed ones. These answers are a profile
-- of taste, not a schema: the set will change as the app learns what is worth
-- asking, and every change would otherwise be a migration plus a grant plus a
-- deploy. `family_size` stays its own column because the app already reads it
-- for portion scaling.
--
-- Column-level grants are how profiles works since harden_profile_reads.sql —
-- the table grants nothing wholesale, so the new column needs naming twice:
-- once to be readable, once to be writable by its owner.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

-- Marks onboarding as done. Kept separate from `preferences` so "skipped every
-- question" and "never saw it" stay distinguishable — the first should not be
-- asked again, the second should.
alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Readable by the owner through my_profile(), which returns the whole row.
-- Not added to the public column grants: what someone cooks for and what they
-- are allergic to is nobody else's business.
grant update (preferences, onboarded_at) on public.profiles to authenticated;

commit;
