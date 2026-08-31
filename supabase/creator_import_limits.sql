-- ============================================================================
-- Import-Allowances, die die Rolle kennen.
--
-- Die Zahlen in import_quota.sql sind für jemanden gedacht, der sein eigenes
-- Kochbuch füllt: drei Instagram-Importe und zehn andere pro Woche. Sie sind
-- eine Kostenbremse pro Nutzer, kein Werkzeug gegen denjenigen, der den
-- Katalog überhaupt erst befüllt — und genau den haben sie ausgebremst. Ein
-- freigeschalteter Creator mit 200 Rezepten wäre 20 Wochen beschäftigt
-- gewesen, das meiste davon mit Warten.
--
-- Also hängt die Grenze jetzt an der Rolle. Creator und Admin bekommen Luft,
-- alle anderen behalten exakt die alten Zahlen.
--
-- Zwei Dinge, die hier bewusst NICHT passieren:
--
--   Kein "unbegrenzt". Jeder Import kostet einen KI-Aufruf, Instagram zusätz-
--   lich einen Scraper-Aufruf, und beides ist echtes Geld. Eine Obergrenze,
--   die im Normalbetrieb nie erreicht wird, ist trotzdem eine Obergrenze —
--   sie begrenzt den Schaden, wenn ein Creator-Account übernommen wird.
--
--   Kein Freibrief für jeden. `creator` wird seit creator_applications.sql
--   nur per Admin-Freigabe vergeben. Die Rolle IST die Prüfung; wer sie hat,
--   ist von einem Menschen angesehen worden.
--
-- import_limit war IMMUTABLE, weil es nur rechnete. Es liest jetzt profiles,
-- also ist es STABLE und SECURITY DEFINER — sonst sähe es durch RLS die
-- eigene Zeile des Aufrufers nicht zuverlässig.
--
-- Idempotent. Läuft nach import_quota.sql, ersetzt nur diese eine Funktion.
-- Im Supabase SQL Editor ausführen.
-- ============================================================================

begin;

create or replace function public.import_limit(p_kind text)
returns int language sql stable security definer set search_path = public as $$
  select case
    when coalesce(
           (select role from public.profiles where id = auth.uid()),
           'user'
         ) in ('creator', 'admin')
    -- Instagram bleibt die kleinere Zahl, weil der RapidAPI-Plan die echte
    -- Decke ist: beim BASIC-Tarif sind es 20 Aufrufe pro MONAT für die ganze
    -- App. Hier großzügig zu sein, verschiebt das Limit nur woanders hin.
    then case when p_kind = 'instagram' then 50 else 300 end
    else case when p_kind = 'instagram' then 3  else 10  end
  end;
$$;

commit;

-- ── Prüfen ──────────────────────────────────────────────────────────────────
-- Als der jeweilige Nutzer aufzurufen, nicht als Postgres — die Funktion liest
-- auth.uid(), und im SQL Editor ist das NULL. Also in der App testen, oder:
--
--   select public.import_limit('instagram'), public.import_limit('text');
--
-- Ohne Session kommt 3 und 10 zurück. Das ist richtig so, nicht kaputt.
