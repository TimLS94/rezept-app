-- ============================================================================
-- Kein Creator-Rezept war irgendwo sichtbar: "permission denied for table recipes"
--
-- lock_recipe_content.sql hat das Tabellen-SELECT auf recipes durch Spalten-
-- rechte ersetzt, damit ingredients und instructions nicht mehr an der Bezahl-
-- schranke vorbei gelesen werden können. Richtig so — aber `nutrition` fiel
-- dabei mit heraus, obwohl es kein bezahlter Inhalt ist. Es steht auf der Karte.
--
-- RECIPE_LIST_COLUMNS in lib/recipes.ts fragt es weiterhin ab. Postgres lehnt
-- die ganze Abfrage ab, sobald eine einzige Spalte fehlt — nicht nur diese
-- Spalte, die komplette Zeile. Und die Aufrufer behandeln den Fehler still:
--
--     if (error || !data) return [];
--
-- Ergebnis: leere Liste statt Fehlermeldung, überall wo diese Spaltenliste
-- benutzt wird. Die Studio-Seite zeigte "My recipes (0)", während das Rezept
-- in der Datenbank lag; Home, Discover und Suche zeigten den Katalog als leer.
-- Es sah nach einem verlorenen Upload aus und war ein fehlendes Spaltenrecht.
--
-- Nachtrag: die Makros im Editor blieben aus demselben Grund leer. Ein Wert,
-- den der Client nicht lesen darf, ist von einem Wert, den es nicht gibt, auf
-- dem Bildschirm nicht zu unterscheiden.
--
-- Idempotent. Im Supabase SQL Editor ausführen.
-- ============================================================================

begin;

grant select (nutrition) on public.recipes to authenticated, anon;

commit;

-- ── Prüfen ──────────────────────────────────────────────────────────────────
-- Muss künftig leer sein: jede Spalte aus RECIPE_LIST_COLUMNS, die authenticated
-- nicht lesen darf. Diese Abfrage ist die eigentliche Lehre aus dem Fehler —
-- die Spaltenliste im Code und die Rechte in der Datenbank sind zwei Listen,
-- die auseinanderlaufen können, ohne dass irgendetwas laut wird.
--
--   select unnest(string_to_array(
--     'id,title,description,image_url,prep_time,cook_time,servings,calories,cost,'
--     'difficulty,tags,kid_approved,is_paid,price_cents,nutrition,influencer_id,'
--     'influencer_name,influencer_handle,influencer_avatar,created_at,'
--     'ingredients_count,steps_count', ',')) as spalte
--   except
--   select column_name from information_schema.column_privileges
--   where table_schema='public' and table_name='recipes'
--     and grantee='authenticated' and privilege_type='SELECT';
