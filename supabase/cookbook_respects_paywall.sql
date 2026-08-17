-- ============================================================================
-- The cookbook stops serving paid content it never checked.
--
-- my_cookbook_creator_recipes() returned to_jsonb(r) — the whole recipes row,
-- instructions included — for everything in cookbook_saves, with no
-- entitlement check at read time. save_recipe_to_cookbook() checks when you
-- save, and that was treated as enough.
--
-- It isn't. A free recipe that its creator later marks as paid stays fully
-- readable through the cookbook forever, and the cookbook's creator-recipe
-- screen renders exactly that payload. get_recipe_full() can strip a recipe
-- perfectly and this function hands out the same content beside it.
--
-- A save is a bookmark, so it is re-checked on every read. A PURCHASE is not:
-- it stays full content forever, which is the whole point of buying it, and
-- the snapshot exists so it survives the creator deleting the recipe.
--
-- Idempotent. Run in the Supabase SQL Editor after cookbook_saves.sql.
-- ============================================================================

begin;

create or replace function public.my_cookbook_creator_recipes()
returns jsonb language sql stable security definer set search_path = public as $$
  with bought as (
    -- Paid for. Full content, always, live row or frozen snapshot.
    select coalesce(to_jsonb(r), rp.recipe_snapshot)
           || jsonb_build_object(
                'saved_at', rp.created_at,
                'purchased', true,
                'locked', false,
                'available', r.id is not null) as item
    from public.recipe_purchases rp
    left join public.recipes r on r.id = rp.recipe_id
    where rp.user_id = auth.uid()
      and (r.id is not null or rp.recipe_snapshot is not null)
  ),
  saved as (
    select
      case
        when entitled then
          to_jsonb(r) || jsonb_build_object('locked', false)
        else
          -- Same shape get_recipe_full uses for a locked recipe: no steps, and
          -- only the first three ingredients as a teaser.
          (to_jsonb(r) - 'instructions')
          || jsonb_build_object(
               'locked', true,
               'ingredients', coalesce((
                 select jsonb_agg(elem order by ord)
                 from (
                   select elem, ord
                   from jsonb_array_elements(
                     case when jsonb_typeof(r.ingredients) = 'array'
                          then r.ingredients else '[]'::jsonb end
                   ) with ordinality as t(elem, ord)
                   order by ord limit 3
                 ) s
               ), '[]'::jsonb))
      end
      || jsonb_build_object(
           'saved_at', cs.created_at,
           'purchased', false,
           'available', true) as item
    from public.cookbook_saves cs
    join public.recipes r on r.id = cs.recipe_id
    cross join lateral (
      -- The same test as get_recipe_full: free, your own, or covered by an
      -- active subscription to this creator.
      select (coalesce(r.is_paid, false) = false)
          or r.influencer_id = auth.uid()
          or exists (
               select 1 from public.entitlements e
               where e.user_id = auth.uid() and e.status = 'active'
                 and e.scope = 'creator' and e.creator_id = r.influencer_id
             ) as entitled
    ) acc
    where cs.user_id = auth.uid()
      and not exists (
        select 1 from public.recipe_purchases p
        where p.user_id = cs.user_id and p.recipe_id = cs.recipe_id
      )
  )
  select coalesce(jsonb_agg(item order by item->>'saved_at' desc), '[]'::jsonb)
  from (select item from bought union all select item from saved) t;
$$;

commit;

-- ── Check afterwards ──────────────────────────────────────────────────────
-- Save a paid recipe you have no entitlement for, then:
--   select jsonb_array_elements(public.my_cookbook_creator_recipes())
--          -> 'locked';
-- must be true, and 'instructions' must be absent from that row.
