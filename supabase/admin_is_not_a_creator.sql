-- ============================================================================
-- Ein Admin ist kein Creator.
--
-- is_creator ist eine generierte Spalte, und sie lautete:
--
--     generated always as (role in ('creator', 'admin')) stored
--
-- Damit erschien das Admin-Konto im Creator-Verzeichnis: die Suche listet über
-- `.eq('is_creator', true)`, und die öffentliche Leseregel auf profiles gibt
-- genau diese Zeilen frei. Da das Betriebskonto weder Namen noch Benutzernamen
-- trägt, fiel die Anzeige auf "Creator" zurück und druckte die interne UUID als
-- Handle — ein Profil ohne Rezepte, ohne Namen, mit einer ID als Kennung.
--
-- Die Rolle 'admin' bleibt davon unberührt: canUploadRecipes und
-- is_creator_or_admin() lesen `role` direkt, ein Admin darf also weiterhin
-- Rezepte anlegen und Bewerbungen freigeben. Er hat nur keine öffentliche
-- Creator-Seite mehr — was richtig ist, denn er hat keine.
--
-- Sollte ein Admin später doch veröffentlichen wollen, bekommt er die Rolle
-- 'creator'. Zwei Rollen in einer Spalte gibt es nicht, und das ist die
-- ehrlichere von beiden.
--
-- Idempotent. Im Supabase SQL Editor ausführen.
-- ============================================================================

begin;

-- Die öffentliche Leseregel hängt an der Spalte, also muss sie weichen und
-- danach unverändert zurückkommen. Wortgleich wiederhergestellt: sie ist das,
-- was Fremde überhaupt ein Creator-Profil sehen lässt, und eine Abweichung
-- hier wäre entweder eine Sperre oder ein Leck.
drop policy if exists "Anyone can view creator profiles" on public.profiles;

alter table public.profiles drop column if exists is_creator;
alter table public.profiles
  add column is_creator boolean
  generated always as (role = 'creator') stored;

create policy "Anyone can view creator profiles" on public.profiles
  for select using (is_creator = true);

-- Und das Leserecht auf die Spalte zurück.
--
-- Dropping a column drops its grants with it, and profiles has no table-level
-- SELECT any more — only column grants (harden_profile_reads.sql). So the
-- rebuilt column came back readable by nobody, and Postgres refuses the whole
-- query over one missing column: `.eq('is_creator', true)` failed with
-- "permission denied for table profiles", the client swallowed it, and the
-- creator directory went empty. The same shape as the nutrition column before
-- it — a rebuilt column is a new column, whatever its name.
grant select (is_creator) on public.profiles to anon, authenticated;

commit;

-- ── Prüfen ──────────────────────────────────────────────────────────────────
--   select email, role, is_creator from public.profiles order by role;
-- Erwartet: is_creator ist nur bei role = 'creator' wahr.
