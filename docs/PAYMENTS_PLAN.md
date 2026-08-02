# Payments — Implementierungsplan

Creator-Abo-Modell für FeedFamily. **Phase 1: app-weites Premium** (schnell launch-fähig),
Datenmodell aber schon so gebaut, dass **Phase 2: Abo pro Creator** ohne Umbau ergänzt werden kann.

Status: PLAN (noch kein Code). Zuletzt aktualisiert: 2026-08-02.

---

## 0. TL;DR

- **In-App-Käufe laufen über Apple IAP + Google Play Billing** (Pflicht für digitale Inhalte). Stripe **nur** für Creator-Auszahlung.
- Tooling: **RevenueCat** (`react-native-purchases-expo`) kapselt Kaufabwicklung, Belegvalidierung & Entitlements plattformübergreifend.
- **Server ist Source of Truth**: ein RevenueCat-Webhook schreibt Entitlements nach Supabase; Premium-Rezeptinhalte werden **serverseitig** (RLS/RPC) geschützt, nicht nur im UI.
- **Phase 1**: 1 App-weites Premium-Abo schaltet alle `is_paid`-Rezepte frei. Creator-Umsatz wird per Engagement (cook_log) aus dem Premium-Pool verteilt.
- **Phase 2**: pro-Creator-Abos als zusätzliche Entitlement-Zeilen mit `scope='creator'`. Die Zugriffsprüfung bleibt identisch.
- Braucht einen **echten Dev-Build** (kein Expo Go), da IAP native Module sind.

---

## 1. Architektur-Überblick

```
   App (react-native-purchases)                RevenueCat                 Supabase
 ┌───────────────────────────┐            ┌──────────────────┐      ┌────────────────────┐
 │ Paywall → Purchases.       │  Kauf →    │ Store-Beleg       │      │ entitlements       │
 │ purchase(pkg)              │──────────▶ │ validieren,       │      │ (source of truth)  │
 │ Purchases.logIn(user.id)   │            │ Entitlement setzen│      │                    │
 │                            │            │                   │─────▶│ Webhook Edge Fn    │
 │ UI-Gate via customerInfo   │◀───────────│ customerInfo      │      │ upsert entitlement │
 └───────────────────────────┘            └──────────────────┘      └─────────┬──────────┘
                                                                               │ RLS/RPC
                                                                     ┌─────────▼──────────┐
                                                                     │ get_recipe_full()  │
                                                                     │ prüft Entitlement  │
                                                                     └────────────────────┘

  Auszahlung (getrennt vom Money-in):
   Apple/Google zahlen dir ~monatlich (netto − 15/30 %)  →  du berechnest Creator-Anteile
   →  Stripe Connect (Express) zahlt Creator direkt aus.
```

Zwei getrennte Geldflüsse bewusst trennen:
- **Money-in**: über die Stores (IAP). Du bekommst den Netto-Betrag ausgezahlt.
- **Money-out**: über Stripe Connect an die Creator. Stripe übernimmt KYC, Bankdaten, Steuerformulare, Auszahlung.

---

## 2. Datenmodell (zukunftssicher für Phase 2)

Kernidee: Ein Entitlement gewährt Zugriff auf einen **Scope**. Phase 1 nutzt nur `platform`,
Phase 2 fügt `creator` hinzu — die Zugriffsprüfung ändert sich nicht.

```sql
-- Zugriffsrechte eines Nutzers. Eine Zeile pro aktivem Abo.
create table public.entitlements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles(id) on delete cascade not null,
  scope          text not null check (scope in ('platform','creator')), -- Phase 1: 'platform'
  creator_id     uuid references public.profiles(id) on delete cascade,  -- nur bei scope='creator'
  product_id     text,                 -- Store-Produkt-ID
  store          text,                 -- 'app_store' | 'play_store'
  rc_app_user_id text,                 -- RevenueCat App User ID (= profiles.id)
  status         text not null default 'active' check (status in ('active','grace','expired','refunded')),
  current_period_end timestamptz,      -- Ablauf des bezahlten Zeitraums
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null,
  unique (user_id, scope, creator_id)  -- ein aktives Abo je Scope/Creator
);
create index entitlements_user_idx on public.entitlements(user_id);
alter table public.entitlements enable row level security;
create policy "Users view own entitlements" on public.entitlements
  for select using (auth.uid() = user_id);
-- INSERT/UPDATE ausschließlich über den Webhook (service role) — keine Client-Policy.

-- Creator-Konfiguration (Preis + Auszahlungskonto). Schon jetzt anlegen.
alter table public.profiles add column if not exists subscription_enabled boolean default false;
alter table public.profiles add column if not exists subscription_price_cents integer;   -- Phase 2: Creator-Preis
alter table public.profiles add column if not exists stripe_connect_id text;             -- Auszahlung
alter table public.profiles add column if not exists payouts_enabled boolean default false;

-- Roh-Ereignisse vom Webhook (Audit + Rev-Share-Basis). Nie löschen.
create table public.purchase_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  event_type   text,                 -- INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, ...
  product_id   text,
  store        text,
  price_cents  integer,              -- Bruttopreis in kleinster Einheit
  currency     text,
  creator_id   uuid,                 -- Phase 2 direkt; Phase 1 null (Pool)
  occurred_at  timestamptz,
  raw          jsonb,                -- vollständiges RevenueCat-Event
  created_at   timestamptz default now() not null
);

-- Berechnete Auszahlungen pro Creator & Abrechnungszeitraum.
create table public.creator_payouts (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid references public.profiles(id) on delete cascade not null,
  period_start  date not null,
  period_end    date not null,
  gross_cents   integer not null,    -- dem Creator zugerechneter Bruttoanteil
  platform_fee_cents integer not null,
  net_cents     integer not null,    -- was ausgezahlt wird
  status        text not null default 'pending' check (status in ('pending','paid','failed')),
  stripe_transfer_id text,
  created_at    timestamptz default now() not null,
  unique (creator_id, period_start, period_end)
);
```

**Zugriffsprüfung (identisch in beiden Phasen):**
Ein Rezept ist freigeschaltet, wenn
`recipe.is_paid = false`
**ODER** es existiert ein aktives Entitlement mit `scope='platform'`
**ODER** (`scope='creator'` **UND** `creator_id = recipe.influencer_id`).
In Phase 1 wird nur die `platform`-Bedingung erfüllt sein.

---

## 3. Serverseitiger Schutz der Premium-Inhalte (wichtig!)

Heute gilt `recipes`-RLS „Anyone can view recipes" → Premium-Inhalt käme trotz UI-Sperre über die API.
Für echtes Geld muss der Zutaten-/Schritt-Inhalt **serverseitig** gated sein:

**Empfehlung: RPC `get_recipe_full(recipe_id)`** (SECURITY DEFINER), die die vollen Felder
(ingredients, instructions) nur zurückgibt, wenn frei **oder** der Aufrufer ein passendes
Entitlement hat. Öffentlich bleiben nur Metadaten (Titel, Bild, Teaser, Kalorien) für die Paywall-Vorschau.

```sql
create or replace function public.get_recipe_full(p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.recipes; has_access boolean;
begin
  select * into r from public.recipes where id = p_recipe_id;
  if r.id is null then return null; end if;

  has_access := (coalesce(r.is_paid,false) = false)
    or exists (
      select 1 from public.entitlements e
      where e.user_id = auth.uid() and e.status = 'active'
        and (e.scope = 'platform'
             or (e.scope = 'creator' and e.creator_id = r.influencer_id))
    )
    or r.influencer_id = auth.uid();   -- Creator sieht eigene Rezepte

  if has_access then
    return to_jsonb(r);                                  -- volle Daten
  else
    return to_jsonb(r) - 'ingredients' - 'instructions'; -- nur Vorschau
  end if;
end; $$;
grant execute on function public.get_recipe_full(uuid) to anon, authenticated;
```

App-seitig `fetchDbRecipeById` auf diese RPC umstellen. `locked`-Flag kommt dann daraus
(z.B. „instructions fehlt" ⇒ gesperrt). v1 kann zunächst UI-gated starten, **muss aber vor
echtem Zahlungsverkehr** auf serverseitig umgestellt sein.

---

## 4. RevenueCat-Integration (App)

1. Paket: `npx expo install react-native-purchases react-native-purchases-expo`
   Config-Plugin in `app.json` ergänzen. **Erfordert EAS Dev-Build** (nicht Expo Go).
2. Init beim App-Start (`app/_layout.tsx`):
   ```ts
   import Purchases from 'react-native-purchases';
   Purchases.configure({ apiKey: Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY });
   ```
3. Nutzer identifizieren, sobald eingeloggt (in `lib/auth.tsx`):
   `await Purchases.logIn(user.id)` — App User ID = Supabase-`profiles.id`. Bei Logout `Purchases.logOut()`.
4. Entitlement-Identifier in RevenueCat: **`premium`** (Phase 1). Phase 2: zusätzlich pro-Creator-Entitlements.
5. Paywall zeigt `Purchases.getOfferings()` → Kauf via `Purchases.purchasePackage(pkg)`.
6. UI-Gate (sofort) über `customerInfo.entitlements.active['premium']`; die echte Content-Freigabe kommt serverseitig (Abschnitt 3).

**Neue Dateien (geplant):**
- `lib/purchases.ts` — RevenueCat-Init, `logIn/logOut`, `getOfferings`, `purchase`, `restore`, `useEntitlements()` Hook.
- `components/Paywall.tsx` — Bottom-Sheet mit Preis, Vorteilen, „Abonnieren"- & „Käufe wiederherstellen"-Button (Restore ist Apple-Pflicht).

**Änderungen an bestehendem Code:**
- `lib/auth.tsx`: `isPremium` künftig aus Entitlements (Server + RC), nicht mehr aus `profiles.is_premium`.
- `app/recipe/[id].tsx`: `locked`-Logik nutzt Entitlement-Check; bei `locked` Paywall statt Inhalt.
- Creator-Seite `app/creator/[id].tsx`: „Abonnieren"-CTA (Phase 2) / Premium-Hinweis (Phase 1).

---

## 5. Webhook → Supabase (Source of Truth)

Edge Function `supabase/functions/revenuecat-webhook`:
- RevenueCat sendet Events (`INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `PRODUCT_CHANGE`).
- Header `Authorization: Bearer <shared-secret>` prüfen (in RevenueCat + als Supabase-Secret hinterlegt).
- Bei aktiven Events: `entitlements` upserten (`status`, `current_period_end`), Rohdaten in `purchase_events`.
- Bei `EXPIRATION`/`CANCELLATION` nach Periodenende: `status='expired'`.
- Nutzt **service-role Key** (umgeht RLS) — daher gibt es keine Client-INSERT-Policy auf `entitlements`.

---

## 6. Auszahlung an Creator (Stripe Connect)

1. **Onboarding**: Edge Function erstellt einen Stripe **Express**-Account, App öffnet den Onboarding-Link.
   `profiles.stripe_connect_id` + `payouts_enabled` speichern. UI: „Auszahlung einrichten" im Creator-Studio.
2. **Rev-Share-Berechnung** (monatlicher Job / Edge Function):
   - **Phase 1 (Pool)**: Premium-Netto-Einnahmen des Monats werden nach **gekochten Rezepten** verteilt —
     Anteil eines Creators = seine `cook_log`-Events / alle Cook-Events. Plattform behält **25 %**.
   - **Phase 2 (direkt)**: pro Creator aus dessen eigenen Abos, Plattform-Fee **25 %**.
   - Ergebnis je Creator in `creator_payouts` schreiben.
3. **Auszahlen**: Stripe **Transfer** auf den Connect-Account; Stripe zahlt gemäß Payout-Schedule an die Bank aus.
   `stripe_transfer_id` + `status='paid'` zurückschreiben.

> Hinweis Marge: Store-Fee (15–30 %) + Plattform-Fee kommen **beide** vor dem Creator-Anteil.
> Details siehe Abschnitt 6b.

---

## 6b. Creator-Vergütung, Tracking & Transparenz

### Grundprinzip: teile den NETTO-Erlös, nicht den Schaufensterpreis

IAP-Preise sind **inkl. USt**, und Apple/Google behalten Provision **plus** USt ein. Wenn du Creators
einen Anteil vom Sticker-Preis (9,99 €) versprichst, machst du Verlust. Deshalb: Creator bekommen
einen festen Prozentsatz vom **Netto-Erlös** (= was der Store dir tatsächlich auszahlt).

**Festgelegt: Creator 75 % / Plattform 25 % vom Netto-Erlös.** (Vergleich: YouTube 55 %, Twitch 50 %,
OnlyFans 80 %, Substack ~90 % — 75 % ist creator-freundlich und trotzdem tragfähig.)

### Was am Ende beim Creator ankommt (Annahmen: DE 19 % USt, Small-Business 15 % Store-Fee)

| Abo-Preis | − USt | − Store 15 % = Netto | Creator (75 %) | Plattform (25 %) |
|---|---|---|---|---|
| **9,99 €** (Phase 1, app-weit) | 8,39 € | **7,13 €** | **5,35 €** | 1,78 € |
| **4,99 €** (Phase 2, pro Creator) | 4,19 € | **3,56 €** | **2,67 €** | 0,89 € |

Bei 30 % Store-Fee (über 1 Mio $/Jahr oder ohne Small-Business-Programm) sinkt das Netto z.B. bei
9,99 € auf ~5,88 € → Creator ~4,41 €. **Die Store-Fee ist der größte Abzug — nicht deine Plattform.**
Das solltest du Creators offen so kommunizieren.

### Attribution: Wer bekommt welchen Anteil? (zwei Methoden)

Da Phase 1 **ein** app-weites Abo ist, muss der Erlös auf Creator verteilt werden. Zwei Wege:

| | **Pooled (einfach)** | **User-centric (fair & transparent) ⭐** |
|---|---|---|
| Idee | Gesamter Premium-Pool wird nach **globalem** Engagement verteilt | **Jedes** Abo einzeln auf die Creator verteilt, die *dieser* Abonnent genutzt hat |
| Beispiel | „Du hattest 2,8 % aller Premium-Cooks → 2,8 % vom Pool" | „Anna hat diesen Monat 3 deiner Rezepte gekocht → ein Anteil von Annas 9,99 € geht an dich" |
| Nachvollziehbar | mittel (hängt von allen ab) | hoch (direkt an konkrete Abonnenten geknüpft) |
| Aufwand | gering | etwas höher |

**Empfehlung: user-centric.** Es ist fairer (kleine Creator mit treuen Fans verhungern nicht im Pool)
und für das Dashboard viel glaubwürdiger belegbar. Beide nutzen dieselben Rohdaten (`cook_log`).

### Tracking-Daten (Quelle der Wahrheit)

- **`cook_log`** (existiert bereits) — jedes „Rezept gekocht"-Event mit `user_id`, `recipe_id`, Zeitstempel.
  Das ist die Engagement-Primitive und **pro Nutzer & Rezept einzeln belegbar**.
- Optional Phase 1.1: `recipe_views` (Öffnungen) für eine reichere Metrik — v1 reicht Cooks (+ evtl. Favoriten).
- **`purchase_events`** — Erlös rein, pro Periode (aus dem Webhook, Abschnitt 5). Nie verändert.
- **`creator_payouts`** — pro Creator & Monat, **inkl. eingebettetem Snapshot** (`breakdown jsonb`):
  Pool-Größe, Formel-Version, dein Engagement, Gesamt-Engagement, dein %, Store-Fee, Plattform-Fee, Netto.
  Dieser Snapshot ist **unveränderlich** und macht jede Auszahlung reproduzierbar/auditierbar.

### Monatliche Abrechnung (Edge Function / Cron)

1. Periode abgrenzen (Kalendermonat).
2. Aus `purchase_events` den Netto-Pool bzw. je Abo die Netto-Beträge holen.
3. Aus `cook_log` das Engagement je Creator (user-centric: je Abonnent × Creator) berechnen.
4. Anteile ausrechnen, **Snapshot** je Creator in `creator_payouts` schreiben (`status='pending'`).
5. Stripe-Transfer auslösen → `stripe_transfer_id`, `status='paid'`.

### In-App-Dashboard für Creator — `app/creator/earnings.tsx`

Damit es **transparent, nachvollziehbar und in der App sichtbar** ist:

- **Diesen Monat (Live-Schätzung):** großes € geschätzt, „läuft noch"-Badge, dein Engagement (Cooks),
  aktuelle Pool-/Netto-Basis, dein Anteil in %. Kommt aus RPC `creator_earnings_estimate()`
  (rechnet live aus laufendem `cook_log` + `purchase_events`).
- **Aufschlüsselung pro Rezept:** welche deiner Rezepte wie oft gekocht wurden → zeigt, *woher* die Zahl kommt.
- **Auszahlungs-Historie:** je Monat Netto-€ + Status (ausstehend/ausgezahlt/fehlgeschlagen), Stripe-Referenz,
  und **„Details"** → voller Snapshot: Pool, deine Cooks / Gesamt-Cooks, %, Store-Fee, Plattform-Fee, Netto.
- **„So wird berechnet":** aufklappbarer Erklärtext mit der genauen Formel und den Eingangswerten.
- **Auszahlungskonto:** Stripe-Connect-Status + „Auszahlung einrichten".

Transparenz-Grundsätze: (a) Events sind **unveränderlich**, (b) jede Auszahlung speichert ihren
**Snapshot** samt Formel-Version, (c) das Dashboard zeigt **Formel + konkrete Eingangswerte**, nie nur ein Ergebnis.

RPCs dafür (SECURITY DEFINER, nur eigene Daten):
`creator_earnings_estimate()` (laufender Monat), `creator_payout_history()` (abgeschlossene Monate mit Snapshot),
`creator_engagement_breakdown(period)` (pro-Rezept-Zahlen).

---

## 7. Was DU einrichten musst (parallel zum Code)

- [ ] Apple: **Paid Applications Agreement** signen + Bank-/Steuerdaten (App Store Connect).
- [ ] Google Play: **Payments-Profil** einrichten.
- [ ] IAP-Produkt anlegen — **Phase 1: 1 Auto-Renewable Subscription** (z.B. `premium_monthly`, Preis-Tier wählen) in ASC **und** Play Console.
- [ ] **RevenueCat**-Account: Apps + Store-Keys verbinden, Produkt `premium_monthly` → Entitlement `premium`, ein „Offering" anlegen.
- [ ] RevenueCat **Webhook-URL** + Shared Secret setzen (auf die Edge Function zeigen).
- [ ] **Stripe Connect** aktivieren (Express), Plattform-Profil ausfüllen.
- [ ] **Rechtlich/Steuer**: EU **DAC7**-Meldepflicht für Creator-Einkünfte, Creator-/Auszahlungs-AGB, einmal Steuerberater. USt bei IAP führen die Stores ab.
- [ ] **EAS Dev-Build** erstellen (IAP testen geht nur im echten Build; iOS Sandbox-Tester, Android Lizenz-Tester).

---

## 8. Umsetzungsreihenfolge (wenn Plan freigegeben)

**Phase 1 — App-weites Premium**
1. DB: `entitlements`, `purchase_events`, `creator_payouts`, `profiles`-Felder, `get_recipe_full` (ein SQL-Skript, idempotent).
2. `lib/purchases.ts` + RevenueCat-Init + `logIn/logOut`.
3. `components/Paywall.tsx` + Gate in `app/recipe/[id].tsx`; `lib/auth.isPremium` aus Entitlements.
4. Edge Function `revenuecat-webhook` → `entitlements`/`purchase_events`.
5. `fetchDbRecipeById` → `get_recipe_full` (serverseitiger Schutz).
6. Stripe-Connect-Onboarding (Creator-Studio) + monatliche Abrechnung (Abschnitt 6b).
7. **Creator-Dashboard `app/creator/earnings.tsx`** + RPCs (`creator_earnings_estimate`, `creator_payout_history`, `creator_engagement_breakdown`).

**Phase 2 — Abo pro Creator** (später, ohne Umbau)
7. `profiles.subscription_price_cents` + Preis-UI im Creator-Studio.
8. Pro-Creator IAP-Produkte via App Store Connect API + Google Play Developer API (programmatisch) + RC-Entitlements.
9. Creator-`scope`-Entitlements über denselben Webhook; Zugriffsprüfung unverändert.
10. Rev-Share direkt statt Pool.

---

## 9. Offene Entscheidungen

- **Preis Phase 1**: Höhe des app-weiten Premium-Abos? (z.B. 4,99 € oder 9,99 €/Monat)
- **Plattform-Fee**: ✅ 25 % vom Netto (Creator 75 %) — festgelegt.
- **Attribution**: ✅ nach gekochten Rezepten (`cook_log`) — festgelegt. (user-centric als spätere Verfeinerung möglich)
- **Rev-Share-Metrik Phase 1**: aktuell Cooks (`cook_log`); optional später Views/Favoriten gewichten.
- **Kostenlose-Rezepte-Regel**: „mind. N kostenlose je Creator" erzwingen (z.B. 10) oder Creator frei entscheiden lassen?
- **Free-Trial / Intro-Preis** anbieten? (RevenueCat/Store unterstützen das.)
```
