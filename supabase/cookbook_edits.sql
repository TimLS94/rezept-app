-- ============================================================================
-- Local edits to creator recipes in the cookbook.
--
-- When a user edits a creator recipe in their cookbook, the changes are stored
-- here rather than modifying the original. This allows:
--   - Users to customize recipes to their taste
--   - Original recipe to remain unchanged
--   - Edits to be tied to subscription status (if sub ends, edits are preserved
--     but recipe access is blocked)
--
-- The edits are stored as a JSON patch - only the fields that were changed.
-- When displaying, the app merges original + edits.
--
-- Idempotent. Run in the Supabase SQL Editor AFTER cookbook_saves.sql.
-- ============================================================================

begin;

create table if not exists public.cookbook_edits (
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  edits      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index if not exists cookbook_edits_user_idx
  on public.cookbook_edits (user_id);

alter table public.cookbook_edits enable row level security;

-- Users can only see and modify their own edits
drop policy if exists "Users read own cookbook edits" on public.cookbook_edits;
create policy "Users read own cookbook edits" on public.cookbook_edits
  for select using (auth.uid() = user_id);

drop policy if exists "Users insert own cookbook edits" on public.cookbook_edits;
create policy "Users insert own cookbook edits" on public.cookbook_edits
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own cookbook edits" on public.cookbook_edits;
create policy "Users update own cookbook edits" on public.cookbook_edits
  for update using (auth.uid() = user_id);

drop policy if exists "Users delete own cookbook edits" on public.cookbook_edits;
create policy "Users delete own cookbook edits" on public.cookbook_edits
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.cookbook_edits to authenticated;

-- ── Save edits to a cookbook recipe ────────────────────────────────────────
-- Only allowed if user has the recipe in their cookbook (saved or purchased)
create or replace function public.save_cookbook_edits(
  p_recipe_id uuid,
  p_edits jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  -- Check if user has this recipe in cookbook (saved or purchased)
  if not exists (
    select 1 from public.cookbook_saves cs
    where cs.user_id = auth.uid() and cs.recipe_id = p_recipe_id
  ) and not exists (
    select 1 from public.recipe_purchases rp
    where rp.user_id = auth.uid() and rp.recipe_id = p_recipe_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'recipe_not_in_cookbook');
  end if;

  insert into public.cookbook_edits (user_id, recipe_id, edits, updated_at)
  values (auth.uid(), p_recipe_id, p_edits, now())
  on conflict (user_id, recipe_id) do update
  set edits = p_edits, updated_at = now();

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.save_cookbook_edits(uuid, jsonb) to authenticated;

-- ── Get edits for a recipe ─────────────────────────────────────────────────
create or replace function public.get_cookbook_edits(p_recipe_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(edits, '{}'::jsonb)
  from public.cookbook_edits
  where user_id = auth.uid() and recipe_id = p_recipe_id;
$$;
grant execute on function public.get_cookbook_edits(uuid) to authenticated;

-- ── Update my_cookbook_creator_recipes to include edits ────────────────────
create or replace function public.my_cookbook_creator_recipes()
returns jsonb language sql stable security definer set search_path = public as $$
  with bought as (
    select coalesce(to_jsonb(r), rp.recipe_snapshot)
           || jsonb_build_object(
                'saved_at', rp.created_at,
                'purchased', true,
                'available', r.id is not null,
                'edits', coalesce(ce.edits, '{}'::jsonb)) as item
    from public.recipe_purchases rp
    left join public.recipes r on r.id = rp.recipe_id
    left join public.cookbook_edits ce on ce.user_id = rp.user_id and ce.recipe_id = rp.recipe_id
    where rp.user_id = auth.uid()
      and (r.id is not null or rp.recipe_snapshot is not null)
  ),
  saved as (
    select to_jsonb(r)
           || jsonb_build_object(
                'saved_at', cs.created_at,
                'purchased', false,
                'available', true,
                'edits', coalesce(ce.edits, '{}'::jsonb)) as item
    from public.cookbook_saves cs
    join public.recipes r on r.id = cs.recipe_id
    left join public.cookbook_edits ce on ce.user_id = cs.user_id and ce.recipe_id = cs.recipe_id
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
