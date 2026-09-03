-- ============================================================================
-- Creator bekommen Premium, und dafür ein engeres Instagram-Limit.
--
-- ── Warum eine Berechtigungszeile und kein Rollen-Check ────────────────────
-- Premium wird an zwei Orten geprüft: im Client über lib/auth.tsx und im Server
-- in get_recipe_full, cookable_recipes, save_recipe_to_cookbook und weiteren.
-- Keine dieser Funktionen kennt eine zentrale Prüfung — jede liest entitlements
-- selbst. Im Client "role === 'creator'" zu ergänzen, hätte die Oberfläche
-- freigeschaltet, während der Server weiterhin bezahlte Inhalte entfernt: ein
-- Creator hätte die Knöpfe gesehen und beim Antippen nichts bekommen.
--
-- Also die Zeile, die alle schon lesen. Zehn Funktionen bleiben unverändert.
--
-- ── Wiedererkennbar ────────────────────────────────────────────────────────
-- store = 'creator', product_id = 'creator-comp'. Bewusst NICHT 'test': der
-- Sweep vor dem Start räumt store='test' und dev_unlock ab, und diese Zeilen
-- sollen ihn überleben. Sie sind kein vergessener Testzugang, sondern Teil der
-- Abmachung mit dem Creator — er füllt den Katalog, er zahlt nicht dafür.
--
-- ── Instagram: 5 statt 50 ──────────────────────────────────────────────────
-- 50 war für den kalten Start gedacht. Jeder Aufruf kostet einen Scraper-Aufruf
-- aus einem gemeinsamen, bezahlten Kontingent — beim BASIC-Tarif 20 im MONAT
-- für die ganze App. Ein einziger Creator mit 50 pro Woche verbraucht das
-- Monatskontingent an einem Nachmittag und legt die Funktion für alle anderen
-- still. Fünf pro Woche und Creator ist eine Zahl, die mehrere Creator neben-
-- einander tragen kann.
--
-- Text- und Screenshot-Importe bleiben bei 300: die kosten nur einen Modell-
-- aufruf, keinen Fremddienst.
--
-- Idempotent. Im Supabase SQL Editor ausführen.
-- ============================================================================

begin;

-- ── Instagram-Deckel ───────────────────────────────────────────────────────
create or replace function public.import_limit(p_kind text)
returns int language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select role from public.profiles where id = auth.uid()), 'user')
         in ('creator', 'admin')
    then case when p_kind = 'instagram' then 5 else 300 end
    else case when p_kind = 'instagram' then 3 else  10 end
  end;
$$;

-- ── Premium für Creator ────────────────────────────────────────────────────
create or replace function public.sync_creator_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role in ('creator', 'admin') then
    insert into public.entitlements
      (user_id, scope, creator_id, product_id, store, status, current_period_end)
    values (new.id, 'platform', null, 'creator-comp', 'creator', 'active',
            now() + interval '100 years')
    on conflict (user_id, scope, creator_id) do update
      set status = 'active',
          product_id = 'creator-comp',
          store = 'creator',
          current_period_end = now() + interval '100 years',
          updated_at = now()
      -- Eine echte, bezahlte Mitgliedschaft wird NICHT überschrieben. Sonst
      -- verlöre ein zahlender Nutzer, der Creator wird, seine Kaufhistorie —
      -- und beim nächsten RevenueCat-Webhook stritten sich zwei Quellen um
      -- dieselbe Zeile.
      where public.entitlements.store not in ('app_store', 'play_store');

  -- Wer die Rolle verliert, verliert die Freigabe. Nur die geschenkte:
  -- ein gekauftes Abo bleibt, wovon die Rolle unabhängig ist.
  elsif old.role in ('creator', 'admin') then
    update public.entitlements
       set status = 'expired', current_period_end = now(), updated_at = now()
     where user_id = new.id and scope = 'platform' and store = 'creator';
  end if;
  return new;
end; $$;

drop trigger if exists creator_entitlement_sync on public.profiles;
create trigger creator_entitlement_sync
  after insert or update of role on public.profiles
  for each row execute function public.sync_creator_entitlement();

-- ── Bestehende Creator nachtragen ──────────────────────────────────────────
insert into public.entitlements
  (user_id, scope, creator_id, product_id, store, status, current_period_end)
select id, 'platform', null, 'creator-comp', 'creator', 'active', now() + interval '100 years'
from public.profiles where role in ('creator', 'admin')
on conflict (user_id, scope, creator_id) do update
  set status = 'active', product_id = 'creator-comp', store = 'creator',
      current_period_end = now() + interval '100 years', updated_at = now()
  where public.entitlements.store not in ('app_store', 'play_store');

commit;
