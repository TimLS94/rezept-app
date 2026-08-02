-- Updated server-side premium gate (teaser-aware). Re-run this in the SQL Editor
-- if you already ran payments.sql before this change. Idempotent.
create or replace function public.get_recipe_full(p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.recipes;
  has_access boolean;
  prof jsonb;
  base jsonb;
  ing_count int;
  step_count int;
  teaser_ing jsonb;
begin
  select * into r from public.recipes where id = p_recipe_id;
  if r.id is null then return null; end if;

  select to_jsonb(p) into prof
  from (select id, full_name, username, avatar_url
        from public.profiles where id = r.influencer_id) p;

  ing_count  := coalesce(jsonb_array_length(case when jsonb_typeof(r.ingredients)  = 'array' then r.ingredients  else '[]'::jsonb end), 0);
  step_count := coalesce(jsonb_array_length(case when jsonb_typeof(r.instructions) = 'array' then r.instructions else '[]'::jsonb end), 0);

  has_access := (coalesce(r.is_paid, false) = false)
    or r.influencer_id = auth.uid()
    or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_premium = true)
    or exists (
      select 1 from public.entitlements e
      where e.user_id = auth.uid() and e.status = 'active'
        and (e.scope = 'platform'
             or (e.scope = 'creator' and e.creator_id = r.influencer_id))
    );

  base := to_jsonb(r)
    || jsonb_build_object('profiles', prof, 'ingredients_count', ing_count, 'steps_count', step_count);

  if has_access then
    return base || jsonb_build_object('locked', false);
  end if;

  select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb) into teaser_ing
  from (
    select elem, ord from jsonb_array_elements(
      case when jsonb_typeof(r.ingredients) = 'array' then r.ingredients else '[]'::jsonb end
    ) with ordinality as t(elem, ord)
    order by ord limit 3
  ) s;

  return (base - 'instructions')
    || jsonb_build_object('locked', true, 'ingredients', teaser_ing);
end; $$;
grant execute on function public.get_recipe_full(uuid) to anon, authenticated;
