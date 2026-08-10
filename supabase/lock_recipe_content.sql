-- ============================================================================
-- SECURITY — the paywall was only guarding one door.
--
-- get_recipe_full() correctly returns a teaser for a paid recipe. But the
-- `recipes` table itself was readable in full, so the gate was trivially
-- bypassed by asking for the row directly. Verified on the live database on
-- 2026-08-05, SIGNED OUT, with only the anon key from the app bundle:
--
--   rpc/get_recipe_full           → locked=true, 0 steps, 3 teaser ingredients
--   recipes?select=*&id=eq.<paid> → 12 ingredients, 7 steps
--
-- The app was doing exactly this itself on the creator profile page and in the
-- discover/search listing, which is why paid recipes appeared unlocked to a
-- user who had only app Premium — and would have appeared unlocked to a guest.
--
-- Fix: `ingredients` and `instructions` stop being directly readable at all.
-- The only ways to obtain them become
--   • get_recipe_full()     → enforces the paywall
--   • get_recipe_for_edit() → owner only
-- Listings keep working because everything else stays readable, plus two
-- generated count columns so a card can still say "12 ingredients · 7 steps".
--
-- Idempotent. Run in the Supabase SQL Editor AFTER creator_pricing.sql.
-- ============================================================================

begin;

-- Counts the client used to derive from the arrays it can no longer read.
-- Generated + stored, so they can never drift from the content.
alter table public.recipes add column if not exists ingredients_count integer
  generated always as (
    case when jsonb_typeof(ingredients) = 'array' then jsonb_array_length(ingredients) else 0 end
  ) stored;

alter table public.recipes add column if not exists steps_count integer
  generated always as (
    case when jsonb_typeof(instructions) = 'array' then jsonb_array_length(instructions) else 0 end
  ) stored;

-- Column-level SELECT. As with profiles, the table-level grant has to go first —
-- revoking a column while a table-wide grant exists does nothing.
revoke select on public.recipes from anon, authenticated;

grant select (
  id, title, description, image_url,
  prep_time, cook_time, servings, calories, cost, difficulty,
  tags, kid_approved,
  is_paid, price_cents,
  influencer_id, influencer_name, influencer_handle, influencer_avatar,
  created_at, updated_at,
  ingredients_count, steps_count
) on public.recipes to anon, authenticated;

-- ── Owners still need the whole row to edit it. ────────────────────────────
-- Column privileges apply to the role, not the row, so without this the
-- creator could no longer load their own ingredients into the editor.
create or replace function public.get_recipe_for_edit(p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.recipes;
begin
  select * into r from public.recipes where id = p_recipe_id;
  if r.id is null then return null; end if;
  if r.influencer_id is distinct from auth.uid() then
    return jsonb_build_object('error', 'not_owner');
  end if;
  return to_jsonb(r);
end; $$;
grant execute on function public.get_recipe_for_edit(uuid) to authenticated;

-- ── Recipes the caller could actually cook tonight. ───────────────────────
-- The fridge scan has to match against real ingredient lists, which it can no
-- longer read from the table. This returns full rows, but only for recipes the
-- caller is entitled to: free ones, their own, and anything they've bought or
-- subscribed to. A paid recipe they don't own is left out entirely — matching
-- it would mean handing over the ingredient list we just locked away.
create or replace function public.cookable_recipes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
  from public.recipes r
  where coalesce(r.is_paid, false) = false
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
$$;
grant execute on function public.cookable_recipes() to anon, authenticated;

commit;

-- ── Verify (signed out, anon key only) ────────────────────────────────────
--   recipes?select=title,ingredients  → must fail: permission denied
--   recipes?select=title,steps_count  → must succeed
--   rpc/get_recipe_full on a paid id  → locked=true, 3 teaser ingredients
