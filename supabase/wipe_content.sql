-- ============================================================================
-- Inhalte löschen, Schema behalten.
--
-- Vor dem kalten Start: alle Test- und Dummy-Rezepte raus, alle Accounts raus
-- bis auf den Admin, damit der Katalog sauber aufgebaut werden kann.
--
-- Das hier ist NICHT reset_and_rebuild.sql. Diese Datei ist 14 Tabellen ver-
-- altet und würde beim Ausführen das neuere Schema zerstören — Collections,
-- Import-Kontingente, Creator-Bewerbungen, Fehler-Logs. Sie legt das Schema
-- neu an, wie es vor Monaten aussah. Nicht anfassen.
--
-- Hier passiert das Gegenteil: das Schema wird nicht angerührt, nur Zeilen
-- verschwinden. Und die Tabellenliste wird zur Laufzeit aus dem Katalog
-- gelesen, statt sie aufzuschreiben — aufgeschriebene Listen veralten, und
-- genau daran ist die andere Datei gestorben.
--
-- ⚠ Das ist die Produktionsdatenbank. Es gibt keine zweite. Vorher sichern:
--     supabase db dump --db-url "<connection string>" -f backup.sql
--   Der Connection String steht im Dashboard unter Project Settings →
--   Database → Connection string → URI.
--
-- Im Supabase SQL Editor ausführen, Abschnitt für Abschnitt.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TEIL 1 — Ansehen. Ändert nichts.
-- ────────────────────────────────────────────────────────────────────────────
-- Was steht überhaupt drin? Erst lesen, dann entscheiden. Die Zahlen sagen
-- auch, ob eine Tabelle vergessen wurde, die hier eigentlich hingehört.

select
  c.relname                        as tabelle,
  to_char(c.reltuples::bigint, 'FM999G999') as zeilen_geschaetzt
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.reltuples desc, c.relname;

-- Und die Accounts, mit dem Admin obenauf:
select
  u.email,
  p.role,
  u.created_at::date as seit,
  (select count(*) from public.recipes r where r.user_id = u.id) as rezepte
from auth.users u
left join public.profiles p on p.id = u.id
order by (p.role = 'admin') desc nulls last, u.created_at;


-- ────────────────────────────────────────────────────────────────────────────
-- TEIL 2 — Löschen. Ab hier ist es endgültig.
-- ────────────────────────────────────────────────────────────────────────────
-- Erst die Zeile mit der E-Mail anpassen, dann den Block markieren und
-- ausführen. Ohne Treffer bricht er ab, statt alles zu löschen — ein Tippfehler
-- in der Adresse darf nicht bedeuten, dass auch der Admin verschwindet.
--
-- REIHENFOLGE: erst Inhalte, dann Accounts. Nicht umgekehrt, und das ist kein
-- Stilfrage. Die meisten Fremdschlüssel auf profiles kaskadieren, aber einer
-- nicht:
--
--     public.recipes (influencer_id) → public.profiles     ohne ON DELETE
--
-- Ohne ON DELETE gilt NO ACTION, und Postgres verweigert dann das Löschen
-- eines Creators, solange noch ein Rezept auf ihn zeigt. Ein Wipe, der mit den
-- Accounts anfängt, läuft also erst halb durch und bricht dann ab — mit
-- gelöschten Testnutzern und stehengebliebenem Katalog. Sind die Inhalte zuerst
-- weg, kann der Fremdschlüssel nichts mehr blockieren.
--
-- TRUNCATE statt DELETE, weil es die Tabellen in EINER Anweisung leert: die
-- Fremdschlüssel zwischen den Inhaltstabellen (collection_recipes → collections
-- und so weiter) spielen dann keine Rolle, weil nichts zwischendurch in einem
-- halb geleerten Zustand steht.

do $$
declare
  keep_email constant text := 'tim.schaefer94@web.de';  -- ← anpassen
  keep_id    uuid;
  tables     text;
  n          bigint;
begin
  select id into keep_id from auth.users where lower(email) = lower(keep_email);
  if keep_id is null then
    raise exception
      'Kein Account mit % — nichts gelöscht. Adresse prüfen.', keep_email;
  end if;
  if not exists (select 1 from public.profiles where id = keep_id and role = 'admin') then
    raise warning '% hat nicht die Rolle admin — wird unten gesetzt.', keep_email;
  end if;

  -- Schritt 1: alle Inhalte.
  --
  -- Die Tabellenliste kommt aus dem Katalog, nicht aus dieser Datei.
  -- Aufgeschriebene Listen veralten, und genau daran ist reset_and_rebuild.sql
  -- gestorben. profiles bleibt außen vor — das Admin-Profil soll überleben.
  select string_agg(format('public.%I', c.relname), ', ')
    into tables
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not in ('profiles', 'schema_migrations');

  execute format('truncate table %s cascade', tables);
  raise notice 'Inhalte geleert: %', tables;

  -- Schritt 2: alle Accounts außer dem Admin. profiles hängt per CASCADE an
  -- auth.users, die Profile der anderen gehen also mit.
  delete from auth.users where id <> keep_id;
  get diagnostics n = row_count;
  raise notice 'Accounts gelöscht: %', n;

  -- Schritt 3: Rolle bestätigen. Ohne sie kann niemand Creator freigeben, und
  -- das fällt sonst erst auf, wenn der Kumpel schon auf die Freigabe wartet.
  update public.profiles set role = 'admin' where id = keep_id;

  raise notice 'Fertig. Admin: %', keep_email;
end $$;


-- ────────────────────────────────────────────────────────────────────────────
-- TEIL 3 — Nachsehen, dass es stimmt.
-- ────────────────────────────────────────────────────────────────────────────
-- Genau eine Zeile, Rolle admin. Alles andere heißt: nochmal hinschauen.

select u.email, p.role
from auth.users u join public.profiles p on p.id = u.id;

select count(*) as rezepte_uebrig from public.recipes;
