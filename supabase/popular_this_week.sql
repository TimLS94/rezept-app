-- ============================================================================
-- What other people are actually cooking this week.
--
-- cook_log is per-user RLS: you can read your own rows and nobody else's,
-- which is right. Popularity needs to see across everyone, so it goes through
-- a SECURITY DEFINER function that returns counts only — never a user id,
-- never a row. "Twelve people cooked this" is public; who they are is not.
--
-- Measured in distinct people, not entries. One person cooking the same
-- recipe five times is one person who likes it, and counting entries would
-- let a single enthusiastic user decide what the whole app sees.
--
-- Idempotent. Run in the Supabase SQL Editor.
-- ============================================================================

begin;

create or replace function public.popular_recipes_this_week(p_limit int default 12)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('recipe_id', recipe_id, 'people', people, 'cooks', cooks)
              order by people desc, cooks desc),
    '[]'::jsonb)
  from (
    select recipe_id,
           count(distinct user_id) as people,
           count(*)                as cooks
    from public.cook_log
    where created_at >= now() - interval '7 days'
      and recipe_id is not null
    group by recipe_id
    order by count(distinct user_id) desc, count(*) desc
    limit greatest(p_limit, 1)
  ) t;
$$;

grant execute on function public.popular_recipes_this_week(int) to anon, authenticated;

commit;
