-- Migration: creator recipe uploads
-- Extends the existing recipes/profiles tables so users can upload their own
-- recipes. Safe to run on an existing database (idempotent).

-- Cost + creator avatar on recipes (title/description/image_url/prep_time/
-- cook_time/servings/difficulty/calories/kid_approved/tags/ingredients/
-- instructions/influencer_* already exist in the base schema).
alter table public.recipes add column if not exists cost decimal default 0;
alter table public.recipes add column if not exists influencer_avatar text;

-- Creator flag + public handle on profiles.
alter table public.profiles add column if not exists is_creator boolean default false;
alter table public.profiles add column if not exists username text;

-- The base schema already allows public read + authenticated insert on recipes.
-- Add update/delete so creators can manage their own uploads.
drop policy if exists "Creators can update their own recipes" on public.recipes;
create policy "Creators can update their own recipes" on public.recipes
  for update using (auth.uid() = influencer_id);

drop policy if exists "Creators can delete their own recipes" on public.recipes;
create policy "Creators can delete their own recipes" on public.recipes
  for delete using (auth.uid() = influencer_id);

create index if not exists recipes_influencer_id_idx on public.recipes(influencer_id);
