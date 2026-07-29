-- ============================================================================
-- Recipe of the week (run once in the Supabase SQL Editor; idempotent).
-- Returns the recipe favorited most often across ALL users in the last 7 days.
-- SECURITY DEFINER so it can aggregate everyone's favorites without exposing
-- individual favorite_recipes rows (those stay per-user via RLS). A rolling
-- 7-day window means a fresh winner each week automatically.
-- ============================================================================

create or replace function public.recipe_of_the_week()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select recipe
  from public.favorite_recipes
  where recipe_id = (
    select recipe_id
    from public.favorite_recipes
    where created_at >= now() - interval '7 days'
    group by recipe_id
    order by count(*) desc
    limit 1
  )
  limit 1;
$$;

-- Callable by guests and signed-in users.
grant execute on function public.recipe_of_the_week() to anon, authenticated;
