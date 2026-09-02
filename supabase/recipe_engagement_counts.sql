-- ============================================================================
-- Wie oft ein Rezept gekocht, favorisiert und ins Kochbuch gelegt wurde.
--
-- Die Daten liegen längst da — cook_log, favorite_recipes, cookbook_saves füllen
-- sich seit dem ersten Tag. Sichtbar war davon nichts: ein Creator konnte nicht
-- erkennen, ob sein Rezept jemand gekocht hat.
--
-- Gezählt wird in PERSONEN, nicht in Einträgen. Wer dasselbe Gericht fünfmal
-- kocht, ist eine Person, die es mag — nicht fünf. Einträge zu zählen hieße,
-- dass ein einzelner begeisterter Nutzer die Zahl bestimmt, die alle anderen
-- sehen. Dieselbe Entscheidung wie in popular_recipes_this_week.
--
-- SECURITY DEFINER, weil alle drei Tabellen per-User-RLS haben: die Funktion
-- darf zählen, der Aufrufer darf die Zeilen nicht sehen. Herausgegeben werden
-- nur Summen, nie wer.
--
-- Der Creator seiner eigenen Rezepte ist NICHT ausgenommen. Wer sein eigenes
-- Rezept kocht, hat es gekocht — das ist keine Manipulation, sondern der
-- Normalfall bei jemandem, der Rezepte veröffentlicht, die er selbst isst.
--
-- Idempotent. Im Supabase SQL Editor ausführen.
-- ============================================================================

begin;

-- ── Pro Rezept ─────────────────────────────────────────────────────────────
create or replace function public.recipe_engagement(p_recipe_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cooked',    (select count(distinct user_id) from public.cook_log        where recipe_id = p_recipe_id::text),
    'favorited', (select count(distinct user_id) from public.favorite_recipes where recipe_id = p_recipe_id::text),
    'saved',     (select count(distinct user_id) from public.cookbook_saves   where recipe_id = p_recipe_id)
  );
$$;
grant execute on function public.recipe_engagement(uuid) to authenticated, anon;

-- ── Für alle Rezepte eines Creators auf einmal ─────────────────────────────
-- Ein Aufruf statt einer pro Karte: das Studio zeigt die Zahl an jedem Rezept,
-- und eine Abfrage je Kachel wäre bei 200 Rezepten eine Abfrage je Kachel.
create or replace function public.creator_engagement(p_creator_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with mine as (
    select id::text as rid from public.recipes where influencer_id = p_creator_id
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'cooked',    (select count(distinct (user_id, recipe_id)) from public.cook_log        where recipe_id in (select rid from mine)),
      'favorited', (select count(distinct (user_id, recipe_id)) from public.favorite_recipes where recipe_id in (select rid from mine)),
      'saved',     (select count(distinct (user_id, recipe_id)) from public.cookbook_saves   where recipe_id::text in (select rid from mine))
    ),
    'perRecipe', coalesce((
      select jsonb_object_agg(rid, jsonb_build_object(
        'cooked',    (select count(distinct user_id) from public.cook_log        c where c.recipe_id = mine.rid),
        'favorited', (select count(distinct user_id) from public.favorite_recipes f where f.recipe_id = mine.rid),
        'saved',     (select count(distinct user_id) from public.cookbook_saves  s where s.recipe_id::text = mine.rid)
      ))
      from mine
    ), '{}'::jsonb)
  );
$$;
grant execute on function public.creator_engagement(uuid) to authenticated, anon;

commit;
