-- Migration: restrict recipe uploads to creators/admins (server-side).
-- The app hides the upload UI from regular users, but RLS must enforce it too so
-- the gate can't be bypassed via the API. Safe to run on an existing database.
--
-- NOTE: this mirrors FEATURES.publicRecipeUploads = false. If you later open
-- uploads to all users, loosen this policy to match.

drop policy if exists "Authenticated users can create recipes" on public.recipes;
drop policy if exists "Creators can create recipes" on public.recipes;

create policy "Creators can create recipes" on public.recipes
  for insert to authenticated
  with check (
    influencer_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('creator', 'admin')
    )
  );
