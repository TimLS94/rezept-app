-- ============================================================================
-- "Gekocht" zählt jetzt Kochvorgänge, nicht Personen.
--
-- recipe_engagement zählte count(distinct user_id) — übernommen aus
-- popular_recipes_this_week, wo es richtig ist: dort entscheidet die Zahl, was
-- ALLE auf der Startseite sehen, und ein einzelner Begeisterter soll das nicht
-- bestimmen können.
--
-- Als Anzeige unter einem Rezept ist es falsch. "3 cooks" verspricht eine
-- Anzahl. Wer sein Lieblingsgericht zum vierten Mal kocht und die Zahl stehen
-- sieht, hält die Zählung für kaputt — und hat recht damit, dass sie nicht das
-- zeigt, was sie behauptet.
--
-- favorited und saved bleiben distinct: dort gibt es ohnehin nur eine Zeile pro
-- Person und Rezept, und "zweimal favorisiert" ist keine sinnvolle Größe.
--
-- Idempotent. Läuft nach recipe_engagement_counts.sql.
-- ============================================================================

begin;

create or replace function public.recipe_engagement(p_recipe_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cooked',    (select count(*)                from public.cook_log        where recipe_id = p_recipe_id::text),
    'favorited', (select count(distinct user_id) from public.favorite_recipes where recipe_id = p_recipe_id::text),
    'saved',     (select count(distinct user_id) from public.cookbook_saves   where recipe_id = p_recipe_id)
  );
$$;

create or replace function public.creator_engagement(p_creator_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select id::text as rid from public.recipes where influencer_id = p_creator_id
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'cooked',    (select count(*) from public.cook_log where recipe_id in (select rid from mine)),
      'favorited', (select count(distinct (user_id, recipe_id)) from public.favorite_recipes where recipe_id in (select rid from mine)),
      'saved',     (select count(distinct (user_id, recipe_id)) from public.cookbook_saves where recipe_id::text in (select rid from mine))
    ),
    'perRecipe', coalesce((
      select jsonb_object_agg(rid, jsonb_build_object(
        'cooked',    (select count(*)                from public.cook_log        c where c.recipe_id = mine.rid),
        'favorited', (select count(distinct user_id) from public.favorite_recipes f where f.recipe_id = mine.rid),
        'saved',     (select count(distinct user_id) from public.cookbook_saves  s where s.recipe_id::text = mine.rid)
      ))
      from mine
    ), '{}'::jsonb)
  );
$$;

commit;
