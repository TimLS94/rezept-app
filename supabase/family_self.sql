-- ============================================================================
-- The person doing the cooking counts too.
--
-- family_members held everyone except the account holder, and
-- getFamilyServings() sums that table — so a household of four was counted as
-- three and the shopping list bought for three. The cook was feeding everyone
-- but themselves.
--
-- `is_self` marks the one row that is the account holder. It is created
-- automatically, cannot be deleted, and is where nutrition goals belong: those
-- are one person's targets, not the household's.
--
-- Idempotent.
-- ============================================================================

begin;

alter table public.family_members
  add column if not exists is_self boolean not null default false;

-- One self per profile, so a retry or a second device cannot create two.
create unique index if not exists family_members_one_self
  on public.family_members (profile_id) where is_self;

commit;
