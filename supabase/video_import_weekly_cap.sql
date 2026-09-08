-- ============================================================================
-- Video-Importe: 100 pro Woche für Creator, und eine eigene Kategorie dafür.
--
-- Bisher fielen Videos in den Sammeltopf "alles außer Instagram" — zusammen mit
-- Text und Screenshots, 300 pro Woche. Das ist die falsche Nachbarschaft: ein
-- Textimport ist ein Modellaufruf, ein Video ist ein Download, ein Upload und
-- ein Modell, das jeden zweiten Frame ansieht. Der teuerste Aufruf, den wir
-- machen, teilte sich ein Limit mit dem billigsten.
--
-- Genau genommen war er überhaupt nicht wochenbegrenzt: der Video-Pfad im
-- Creator-Import bucht kein Kontingent, es griffen nur die Tagesdeckel. Diese
-- Datei legt die Kategorie an; der Client bucht sie ab dem nächsten Update.
--
-- Drei Kategorien statt zwei. Die alte Abfrage teilte über
-- `kind = 'instagram'` gegen `kind <> 'instagram'`, was mit einer dritten
-- Kategorie stillschweigend falsch wird: Videos hätten von den 300 der
-- Textimporte gezehrt und umgekehrt. Die Zuordnung steht jetzt an einer Stelle.
--
-- Idempotent. Läuft nach import_quota.sql und creator_premium_and_instagram_cap.sql.
-- ============================================================================

begin;

-- ── Welche Kategorie eine Import-Art belegt ────────────────────────────────
create or replace function public.import_bucket(p_kind text)
returns text language sql immutable as $$
  select case
    when p_kind = 'instagram' then 'instagram'
    when p_kind = 'video'     then 'video'
    else 'other'
  end;
$$;

-- ── Die Grenzen ────────────────────────────────────────────────────────────
create or replace function public.import_limit(p_kind text)
returns int language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select role from public.profiles where id = auth.uid()), 'user')
         in ('creator', 'admin')
    then case public.import_bucket(p_kind)
           -- Instagram bleibt bei 5: die echte Decke ist der RapidAPI-Tarif,
           -- der monatlich zählt, nicht wir.
           when 'instagram' then 5
           when 'video'     then 100
           else 300
         end
    else case public.import_bucket(p_kind)
           when 'instagram' then 3
           -- Video ist heute nur im Creator-Bereich erreichbar. Die Zahl steht
           -- hier, damit ein späteres Freischalten für alle nicht versehentlich
           -- den 10er-Topf der Textimporte aufmacht.
           when 'video'     then 2
           else 10
         end
  end;
$$;

-- ── Verbrauch und Buchung, jetzt über die Kategorie ────────────────────────
create or replace function public.import_quota(p_kind text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'kind', coalesce(p_kind, 'other'),
    'limit', public.import_limit(p_kind),
    'used', count(*),
    'remaining', greatest(0, public.import_limit(p_kind) - count(*)),
    'resets_at', min(created_at) + interval '7 days'
  )
  from public.recipe_imports
  where user_id = auth.uid()
    and created_at > now() - interval '7 days'
    and public.import_bucket(kind) = public.import_bucket(p_kind);
$$;

create or replace function public.record_import(p_kind text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare used int; lim int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  lim := public.import_limit(p_kind);

  select count(*) into used
  from public.recipe_imports
  where user_id = auth.uid()
    and created_at > now() - interval '7 days'
    and public.import_bucket(kind) = public.import_bucket(p_kind);

  if used >= lim then
    return jsonb_build_object('ok', false, 'error', 'quota_exceeded')
           || public.import_quota(p_kind);
  end if;

  insert into public.recipe_imports (user_id, kind) values (auth.uid(), p_kind);

  return jsonb_build_object('ok', true) || public.import_quota(p_kind);
end; $$;

-- ── Tagesdeckel, damit die Woche überhaupt erreichbar ist ──────────────────
-- 100 pro Woche nützen nichts, wenn bei 15 Transkriptionen am Tag Schluss ist.
-- Für Creator hochgesetzt, für alle anderen unverändert — Video bleibt der
-- teuerste Aufruf, und ein übernommenes Konto soll ihn nicht beliebig ziehen.
create or replace function public.ai_daily_limit(p_op text)
returns int language sql stable security definer set search_path = public as $$
  select case
    when public.is_creator_or_admin() then case p_op
      when 'estimate-nutrition'  then 300
      when 'transcribe-video'    then 30
      when 'recipe-from-video'   then 30
      when 'recipe-from-text'    then 300
      when 'recipe-from-images'  then 100
      when 'instagram-post'      then 30
      else 20
    end
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
