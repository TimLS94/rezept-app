-- Migration: account roles + premium flag
-- One role column (no separate tables). Premium is a separate flag because a
-- subscription expires, a role does not. Safe to run on an existing database.

alter table public.profiles add column if not exists role text not null default 'user';

do $$
begin
  alter table public.profiles
    add constraint profiles_role_check check (role in ('user', 'creator', 'admin'));
exception
  when duplicate_object then null;
end $$;

-- Premium is driven by subscription status, not by role.
alter table public.profiles add column if not exists is_premium boolean not null default false;
alter table public.profiles add column if not exists premium_until timestamp with time zone;

-- Backfill: anyone flagged as a creator in migration 002 becomes role 'creator'.
update public.profiles set role = 'creator'
where role = 'user'
  and coalesce(is_creator, false) = true;
