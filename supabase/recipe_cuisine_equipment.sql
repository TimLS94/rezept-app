-- ============================================================================
-- Küche und Equipment — beide optional, beide auf beiden Rezeptwegen.
--
-- Zwei Angaben, die auf der Karte fehlten und die jedes Rezept ohnehin enthält:
-- woher das Gericht kommt, und was man dafür braucht. "Im Air Fryer bei 200°C"
-- steht im Text; das Modell liest es und hat es bisher weggeworfen.
--
-- Beide Spalten kommen auf recipes UND my_recipes. Nicht aus Ordnungsliebe:
-- die beiden Wege — Creator-Katalog und persönliches Kochbuch — sind schon
-- einmal auseinandergelaufen (Nährwerte gab es nur im Kochbuch-Editor), und
-- ein Feld, das nur auf einer Seite existiert, geht beim Übernehmen verloren.
--
-- Nur Anzeige, kein Filter. Ob jemand einen Air Fryer besitzt, weiß die App
-- nicht, und das zu erfassen wäre ein eigenes Feature — Geräteliste im Profil,
-- Frage im Onboarding, Logik im Matching. Die Spalte trägt das später, ohne
-- dass etwas neu gebaut werden muss; sie vorher zu verplanen wäre Arbeit auf
-- Vorrat für einen Katalog aus einem Rezept.
--
-- equipment ist text[] wie tags, nicht jsonb: es ist eine Liste kurzer Namen,
-- und text[] lässt sich später ohne Umbau durchsuchen und filtern.
--
-- Idempotent. Im Supabase SQL Editor ausführen.
-- ============================================================================

begin;

alter table public.recipes
  add column if not exists cuisine   text,
  add column if not exists equipment text[];

alter table public.my_recipes
  add column if not exists cuisine   text,
  add column if not exists equipment text[];

-- Lesbar für den Client. recipes hat kein Tabellen-SELECT mehr, sondern
-- Spaltenrechte — eine neue Spalte ist dort standardmäßig UNLESBAR, und eine
-- einzige fehlende Spalte lässt die ganze Abfrage scheitern. Genau so ist
-- `nutrition` durchgerutscht und hat den Katalog leer aussehen lassen.
grant select (cuisine)   on public.recipes to authenticated, anon;
grant select (equipment) on public.recipes to authenticated, anon;

commit;

-- ── Prüfen ──────────────────────────────────────────────────────────────────
-- Muss leer bleiben: Spalten aus RECIPE_LIST_COLUMNS ohne Leserecht.
--
--   select unnest(string_to_array(
--     'id,title,description,image_url,prep_time,cook_time,servings,calories,cost,'
--     'difficulty,tags,kid_approved,is_paid,price_cents,nutrition,cuisine,equipment,'
--     'influencer_id,influencer_name,influencer_handle,influencer_avatar,'
--     'created_at,ingredients_count,steps_count', ',')) as spalte
--   except
--   select column_name from information_schema.column_privileges
--   where table_schema='public' and table_name='recipes'
--     and grantee='authenticated' and privilege_type='SELECT';
