-- ============================================================================
-- Küche wird mehrwertig: `cuisines text[]` neben `cuisine`.
--
-- Ein Gericht kann aus zwei Küchen kommen — Fusion ist keine Ausnahme, sondern
-- ein ganzes Regal voll Rezepte. Eine einzelne Spalte zwingt den Creator, sich
-- für eine Hälfte zu entscheiden, und die andere geht verloren.
--
-- Die alte Spalte bleibt stehen, obwohl nichts mehr hineinschreibt. Der Grund
-- ist nicht Nostalgie: `cuisine` ist bereits in einem OTA-Update draußen und
-- steht in RECIPE_LIST_COLUMNS. recipes hat kein Tabellen-SELECT mehr, sondern
-- Spaltenrechte, und eine einzige fehlende Spalte lässt die KOMPLETTE Abfrage
-- scheitern — nicht das Feld, die ganze Zeile. Ein Bündel, das `cuisine` noch
-- abfragt, bekäme also nicht "keine Küche", sondern einen leeren Katalog.
-- Genau so hat `nutrition` die App leer aussehen lassen.
--
-- Sie verschwindet, wenn kein Gerät mehr die alte Fassung fährt. Bis dahin
-- kostet eine ungenutzte text-Spalte nichts.
--
-- Idempotent. Im Supabase SQL Editor ausführen.
-- ============================================================================

begin;

alter table public.recipes     add column if not exists cuisines text[];
alter table public.my_recipes  add column if not exists cuisines text[];

-- Was schon unter der Einzelspalte eingetragen wurde, mitnehmen.
update public.recipes
   set cuisines = array[cuisine]
 where cuisine is not null and cuisines is null;
update public.my_recipes
   set cuisines = array[cuisine]
 where cuisine is not null and cuisines is null;

grant select (cuisines) on public.recipes to authenticated, anon;

commit;
