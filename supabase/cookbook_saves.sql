-- ============================================================================
-- Free creator recipes in the cookbook.
--
-- The "From creators" tab held only purchases, so a free recipe had nowhere to
-- live except favourites — and favourites are a bookmark, not a library.
-- cookbook_saves is the free counterpart to recipe_purchases.
--
-- The two are deliberately NOT the same thing:
--
--   recipe_purchases  paid for. Snapshotted, never cascades, cannot be removed
--                     by the user. What you bought stays yours forever, even
--                     after the creator deletes the recipe.
--   cookbook_saves    free. A pointer, no snapshot, cascades on delete. The
--                     creator can still unpublish free work, and it then leaves
--                     the cookbook. Nothing was paid, so nothing is owed.
--
-- Idempotent. Run in the Supabase SQL Editor AFTER purchases_survive_deletion.sql.
-- ============================================================================

begin;

create table if not exists public.cookbook_saves (
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index if not exists cookbook_saves_user_idx
  on public.cookbook_saves (user_id, created_at desc);

alter table public.cookbook_saves enable row level security;

-- Your saves are yours alone. No "anyone can view" here: what someone keeps in
-- their cookbook is private, unlike a public follow.
drop policy if exists "Users read own cookbook saves" on public.cookbook_saves;
create policy "Users read own cookbook saves" on public.cookbook_saves
  for select using (auth.uid() = user_id);

drop policy if exists "Users remove own cookbook saves" on public.cookbook_saves;
create policy "Users remove own cookbook saves" on public.cookbook_saves
  for delete using (auth.uid() = user_id);

-- Deliberately no INSERT policy: saving goes through save_recipe_to_cookbook()
-- below, which checks entitlement first. A direct insert would let anyone put a
-- paid recipe in their cookbook and read it from there.
--
-- The grants say the same thing a second time, at table level. Supabase's
-- default privileges hand new public tables to `authenticated` wholesale, so
-- without this the only thing standing between a client and an arbitrary insert
-- would be the absent policy — one `alter table … disable row level security`
-- away from being nothing at all.
revoke all on public.cookbook_saves from anon, authenticated;
grant select, delete on public.cookbook_saves to authenticated;

-- ── Save a recipe you're allowed to read ──────────────────────────────────
-- Mirrors the has_access test in get_recipe_full: free, your own, covered by a
-- creator subscription, or bought. Anything else is refused.
create or replace function public.save_recipe_to_cookbook(p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.recipes; allowed boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select * into r from public.recipes where id = p_recipe_id;
  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'recipe_not_found');
  end if;

  allowed := (coalesce(r.is_paid, false) = false)
    or r.influencer_id = auth.uid()
    or exists (
      select 1 from public.entitlements e
      where e.user_id = auth.uid() and e.status = 'active'
        and e.scope = 'creator' and e.creator_id = r.influencer_id
    )
    or exists (
      select 1 from public.recipe_purchases rp
      where rp.user_id = auth.uid() and rp.recipe_id = r.id
    );

  if not allowed then
    return jsonb_build_object('ok', false, 'error', 'not_entitled');
  end if;

  insert into public.cookbook_saves (user_id, recipe_id)
  values (auth.uid(), p_recipe_id)
  on conflict (user_id, recipe_id) do nothing;

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.save_recipe_to_cookbook(uuid) to authenticated;

-- ── The whole "From creators" tab in one call ─────────────────────────────
-- Purchases and free saves in one list, newest first, each flagged with how it
-- got there. `purchased` drives the UI: a purchase can't be removed and shows a
-- "your copy" note once the creator has taken the original down, while a free
-- save is just a save.
--
-- A recipe that was saved for free and later bought appears once, as a
-- purchase — the stronger claim wins.
create or replace function public.my_cookbook_creator_recipes()
returns jsonb language sql stable security definer set search_path = public as $$
  with bought as (
    select coalesce(to_jsonb(r), rp.recipe_snapshot)
           || jsonb_build_object(
                'saved_at', rp.created_at,
                'purchased', true,
                'available', r.id is not null) as item
    from public.recipe_purchases rp
    left join public.recipes r on r.id = rp.recipe_id
    where rp.user_id = auth.uid()
      and (r.id is not null or rp.recipe_snapshot is not null)
  ),
  saved as (
    select to_jsonb(r)
           || jsonb_build_object(
                'saved_at', cs.created_at,
                'purchased', false,
                'available', true) as item
    from public.cookbook_saves cs
    join public.recipes r on r.id = cs.recipe_id
    where cs.user_id = auth.uid()
      and not exists (
        select 1 from public.recipe_purchases p
        where p.user_id = cs.user_id and p.recipe_id = cs.recipe_id
      )
  )
  select coalesce(jsonb_agg(item order by item->>'saved_at' desc), '[]'::jsonb)
  from (select item from bought union all select item from saved) t;
$$;
grant execute on function public.my_cookbook_creator_recipes() to authenticated;

commit;
