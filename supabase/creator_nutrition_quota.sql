-- ============================================================================
-- Das Tageslimit für die Nährwertschätzung kennt jetzt die Rolle.
--
-- estimate-nutrition fiel in den else-Zweig von ai_daily_limit und bekam damit
-- 20 Schätzungen pro Tag. Für jemanden, der sein eigenes Kochbuch pflegt, ist
-- das reichlich. Für den, der den Katalog aufbaut, sind 200 Rezepte damit zehn
-- Tage Arbeit — und der Abbruch käme mitten im Stapel, ohne dass in der App
-- erklärt würde, warum plötzlich nichts mehr geht.
--
-- Dieselbe Form wie bei import_limit: die Rolle entscheidet, gelesen über eine
-- SECURITY-DEFINER-Funktion, damit `role` für den Client unlesbar bleibt.
--
-- Nicht unbegrenzt. Jede Schätzung ist ein Modellaufruf und kostet Geld, und
-- eine Obergrenze, die im Normalbetrieb nie erreicht wird, begrenzt trotzdem
-- den Schaden, wenn ein Creator-Konto übernommen wird.
--
-- Idempotent. Läuft nach ai_quota.sql. Im Supabase SQL Editor ausführen.
-- ============================================================================

begin;

create or replace function public.ai_daily_limit(p_op text)
returns int language sql stable security definer set search_path = public as $$
  select case
    when p_op = 'estimate-nutrition' and public.is_creator_or_admin() then 300
    else case p_op
      when 'recipe-from-text'   then 40
      when 'recipe-from-images' then 30
      when 'fridge-items'       then 10   -- der Wochendeckel in lib/fridge.ts gilt zusätzlich
      when 'instagram-post'     then 30
      when 'transcribe-video'   then 15   -- der teuerste Aufruf, den wir machen
      else 20
    end
  end;
$$;

commit;
