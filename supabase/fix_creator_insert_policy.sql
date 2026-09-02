-- ============================================================================
-- Creators konnten keine Rezepte anlegen: "permission denied for table profiles"
--
-- Die INSERT-Regel auf recipes prüfte die Rolle so:
--
--     exists (select 1 from profiles p
--             where p.id = auth.uid() and p.role in ('creator','admin'))
--
-- Eine RLS-Regel läuft mit den Rechten des Aufrufers, nicht des Eigentümers.
-- Der Aufrufer ist `authenticated`, und `authenticated` hat auf profiles kein
-- Tabellen-SELECT mehr — nur Spaltenrechte auf dreizehn öffentlich sichtbare
-- Spalten. `role` gehört nicht dazu; das war der Sinn der Härtung, weil eine
-- lesbare Rolle zusammen mit einem UPDATE-Recht eine Selbstbeförderung ist.
--
-- Die Regel las damit eine Spalte, die es für sie nicht gab. Postgres meldet
-- das als "permission denied for table profiles" — die Fehlermeldung nennt die
-- Tabelle, nicht die Spalte, weshalb es wie ein fehlendes Tabellenrecht aussah
-- und nicht wie das, was es war.
--
-- Ergebnis: KEIN Creator konnte ein Rezept hochladen. Nicht ein einzelner
-- Account, sondern alle — und der Katalog sollte gerade mit 200 Rezepten
-- gefüllt werden.
--
-- Die Rolle bleibt ungelesen für den Client. Stattdessen antwortet eine
-- SECURITY-DEFINER-Funktion mit ja oder nein, wie import_limit es schon tut:
-- die Prüfung findet statt, die Spalte wird nie herausgegeben.
--
-- Idempotent. Im Supabase SQL Editor ausführen.
-- ============================================================================

begin;

create or replace function public.is_creator_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('creator', 'admin')
  );
$$;

grant execute on function public.is_creator_or_admin() to authenticated;

drop policy if exists "Creators can create recipes" on public.recipes;
create policy "Creators can create recipes" on public.recipes
  for insert to authenticated
  with check (influencer_id = auth.uid() and public.is_creator_or_admin());

commit;
