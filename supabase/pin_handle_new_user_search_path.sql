-- ============================================================================
-- handle_new_user bekommt einen festen search_path.
--
-- Die einzige von 47 SECURITY-DEFINER-Funktionen ohne einen. Sie läuft mit den
-- Rechten ihres Eigentümers, und ohne festgesetzten search_path entscheidet die
-- Sitzung des Aufrufers, welches Schema zuerst durchsucht wird — wer dort ein
-- eigenes `profiles` unterbringen kann, lässt die Funktion in sein Objekt
-- schreiben statt in unseres.
--
-- Konkret ausnutzbar ist das hier nicht: die Funktion qualifiziert
-- `public.profiles` vollständig, und `authenticated` hat kein CREATE auf public
-- (geprüft). Es bleibt trotzdem die eine Stelle, an der die Absicherung fehlt,
-- und sie kostet eine Zeile.
--
-- Idempotent. Im Supabase SQL Editor ausführen.
-- ============================================================================

begin;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

commit;
