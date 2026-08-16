-- ============================================================================
-- What you paid for stays yours, even if the creator deletes it.
--
-- recipe_purchases.recipe_id was `on delete cascade`, so a creator deleting a
-- recipe also deleted every purchase of it. People who had paid lost both the
-- recipe and the record that they ever bought it — no access, no receipt, no
-- way to prove it. Favourites never had this problem: favorite_recipes stores a
-- full jsonb snapshot, so a favourited recipe survives its author.
--
-- Purchases now work the same way: the recipe is snapshotted at the moment of
-- purchase, and the foreign key no longer cascades. A deleted recipe leaves
-- recipe_id null and the snapshot intact.
--
-- Idempotent. Run in the Supabase SQL Editor AFTER creator_pricing.sql.
-- ============================================================================

begin;

-- The buyer's own copy, frozen at purchase time. Also the receipt: it keeps the
-- title and the creator's name readable long after the original is gone.
alter table public.recipe_purchases
  add column if not exists recipe_snapshot jsonb;

-- recipe_id has to become nullable before the FK can stop cascading — a deleted
-- recipe leaves the purchase standing with a null pointer and a full snapshot.
alter table public.recipe_purchases
  alter column recipe_id drop not null;

alter table public.recipe_purchases
  drop constraint if exists recipe_purchases_recipe_id_fkey;

alter table public.recipe_purchases
  add constraint recipe_purchases_recipe_id_fkey
  foreign key (recipe_id) references public.recipes(id) on delete set null;

-- Backfill anything bought before this change, while the recipes still exist.
update public.recipe_purchases rp
set recipe_snapshot = to_jsonb(r)
from public.recipes r
where r.id = rp.recipe_id and rp.recipe_snapshot is null;

-- ── Record the snapshot on every future purchase ──────────────────────────
create or replace function public.grant_recipe_purchase(p_recipe_id uuid, p_price_cents int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare creator uuid; net int; snap jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  select influencer_id, to_jsonb(r) into creator, snap
  from public.recipes r where r.id = p_recipe_id;
  if creator is null then
    return jsonb_build_object('ok', false, 'error', 'recipe_not_found');
  end if;

  insert into public.recipe_purchases (user_id, recipe_id, creator_id, price_cents, recipe_snapshot)
  values (auth.uid(), p_recipe_id, creator, p_price_cents, snap)
  on conflict (user_id, recipe_id) do nothing;

  if found then
    net := public.net_after_store_fee(p_price_cents);
    insert into public.purchase_events (user_id, event_type, product_id, price_cents, net_cents, currency, creator_id, occurred_at)
    values (auth.uid(), 'RECIPE_PURCHASE', p_recipe_id::text, p_price_cents, net, 'USD', creator, now());
  end if;

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.grant_recipe_purchase(uuid, int) to authenticated;

-- ── Everything the signed-in user has bought, for their cookbook ──────────
-- Serves the live recipe where it still exists (so edits by the creator show
-- up) and falls back to the snapshot where it doesn't. `available` tells the
-- app which of the two it got, so it can mark a recipe whose author has since
-- removed it rather than pretending nothing happened.
create or replace function public.my_purchased_recipes()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
           coalesce(to_jsonb(r), rp.recipe_snapshot)
           || jsonb_build_object(
                'purchased_at', rp.created_at,
                'available', r.id is not null)
           order by rp.created_at desc), '[]'::jsonb)
  from public.recipe_purchases rp
  left join public.recipes r on r.id = rp.recipe_id
  where rp.user_id = auth.uid()
    and (r.id is not null or rp.recipe_snapshot is not null);
$$;
grant execute on function public.my_purchased_recipes() to authenticated;

commit;
