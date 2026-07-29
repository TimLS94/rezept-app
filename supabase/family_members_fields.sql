-- One-off: add the columns the app uses for family members (run once, idempotent).
-- The app stores gender, weight and a portion_multiplier per member, but the
-- table only had name/age/portion_size — so inserts (incl. Quick Add) failed.
alter table public.family_members add column if not exists gender text;
alter table public.family_members add column if not exists weight numeric;
alter table public.family_members add column if not exists portion_multiplier numeric default 1.0;
