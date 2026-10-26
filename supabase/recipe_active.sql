-- ============================================================================
-- Taking a recipe down without destroying it.
--
-- Until now the only way to remove a recipe was to delete it. That is the
-- wrong tool for most of the reasons people actually have: a dead image, a
-- draft published early, a seasonal dish, a rights question still being
-- settled. Twenty-nine imported recipes currently sit in the catalogue with
-- Instagram URLs that expired, and the only remedy on offer is to throw the
-- recipe away and import it again.
--
-- The policy change is the part worth reading twice. It tests two columns OF
-- THE SAME TABLE, which is why it is safe: the catalogue went dark twice
-- before, both times because a read reached for something it had no rights
-- to — a column without a grant, and a policy with a subquery onto profiles.
-- An expression over recipes' own columns needs neither.
--
-- Buyers are unaffected. Paid content is served by get_recipe_full(), which
-- is SECURITY DEFINER and does not consult this policy at all, so someone who
-- paid keeps what they paid for whether the recipe is inactive or deleted.
--
-- Run in the Supabase SQL Editor.
-- ============================================================================

begin;

alter table public.recipes
  add column if not exists is_active boolean not null default true;

-- Read access for the column itself. select was revoked wholesale by
-- lock_recipe_content.sql and is granted column by column since, so a new
-- column is invisible until it is named here — and a query asking for an
-- ungranted column fails ENTIRELY, taking every other column with it.
grant select (is_active) on public.recipes to anon, authenticated;

-- update was never revoked, so the owner policy below already covers writing
-- this column. Nothing to grant.

create index if not exists recipes_active_idx
  on public.recipes (is_active, created_at desc);

-- Hidden from everyone except the person who published it, who needs to see
-- it in the Studio in order to put it back.
drop policy if exists "Anyone can view recipes" on public.recipes;
create policy "Anyone can view recipes" on public.recipes
  for select using (is_active or influencer_id = auth.uid());

commit;

-- ── Turn off the ones with dead images ─────────────────────────────────────
-- Instagram's CDN links expire. These rows kept a URL that no longer serves
-- anything, and no source was stored to re-fetch from, so the picture is gone
-- for good. Hiding them is better than a catalogue full of grey rectangles.
--
--   update public.recipes set is_active = false
--   where image_url like '%cdninstagram%' or image_url like '%fbcdn%';
--
-- Count them first:
--
--   select count(*) from public.recipes
--   where image_url like '%cdninstagram%' or image_url like '%fbcdn%';
