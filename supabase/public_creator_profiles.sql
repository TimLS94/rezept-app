-- ============================================================================
-- Make CREATOR profiles publicly readable (run once in the Supabase SQL Editor).
--
-- profiles RLS previously only allowed reading your OWN row, so the creator
-- search and the public creator page ("/creator/[handle]") could never load
-- another user's profile → "creator not found". This adds a second SELECT policy
-- (policies are OR'd) so anyone can read rows where is_creator = true.
--
-- NOTE (privacy): this exposes ALL columns of creator rows via the API, incl.
-- email. Fine for now; harden later with a view that exposes only public columns
-- (id, full_name, username, avatar_url, bio, socials) if creator emails must
-- stay private.
-- ============================================================================

drop policy if exists "Anyone can view creator profiles" on public.profiles;
create policy "Anyone can view creator profiles" on public.profiles
  for select using (is_creator = true);
