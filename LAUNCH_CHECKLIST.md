# SpoonDrop Launch Checklist

## Version 1.0.0 — Initial Release

Status verified against the live project on 2026-08-06.

---

## 🔜 Open before submitting — as of 2026-10-24

The list below is current. Everything further down was written on 2026-08-06
and parts of it have since been done; trust this section over that one.

### Must be done, or the submission fails

- [ ] **No mailbox exists for the domain.** `dig +short MX spoondrop.app`
      returns nothing, so mail to `support@`, `privacy@` and `legal@` bounces.
      Three documents now name those addresses: the terms promise `legal@`
      answers **within 48 hours**, the privacy policy names `privacy@` for
      data requests, and the App Store support URL names `support@`. A rights
      complaint nobody receives is the exact thing the new terms section was
      written to prevent.
      → ImprovMX (free): two MX records and one TXT at Netlify, forwarding to
        Gmail. Cloudflare Email Routing also works but means moving the DNS.

- [ ] **Run `supabase/content_reports.sql`** in the SQL editor. Until it runs,
      the report button says so and offers the email address instead.

- [ ] **SMTP (Resend) is not configured.** Nobody can register and nobody can
      reset a password — which also means the App Review demo account has to
      exist and be confirmed before submitting, because the reviewer cannot
      create one.

- [ ] **Demo account for App Review**, confirmed, with its credentials in the
      review notes (`store/appstore-metadata.md` holds the draft).

- [x] ~~Screenshots.~~ Five are generated at 1206 x 2622 in
      store/screenshots/iphone-6.3, converted to sRGB because an embedded
      Display P3 profile made App Store Connect refuse the upload. iPad is no
      longer required. Still to upload, and worth retaking without the iOS
      picture-in-picture tab that sits at the right edge of all of them.

- [x] ~~Decide on iPad.~~ Done 2026-10-24: `supportsTablet` is false and
      build 8 carries it, so the iPad screenshot slot is gone along with the
      layout risk. iPad comes back in a later version with a layout of its own.

### Should be done, and is cheap

- [ ] **Data export is promised but not built.** `app/privacy.tsx` lists
      "Export your data" as a right. Apple does not require the feature and
      answering a request by hand is lawful, but the promise is already in
      writing. `expo-file-system` and `expo-sharing` are installed, so an
      `export_account()` RPC plus a button in Settings ships over OTA.

- [ ] **The privacy policy is missing three third parties.** It lists
      Supabase, Google and Groq/OpenAI, but not RevenueCat (user id, purchase
      history), not Stripe (creator payout data), and not the error log
      (`app_errors` stores a stack trace next to a user id). Apple compares
      the privacy label against the linked policy, and a gap between them is
      its own rejection reason.

- [ ] **A takedown clause for rights holders in the terms.** Section 5 now
      describes reporting; what it does not describe is what happens to a
      creator who keeps infringing, beyond losing the account.

### Before the switch to Lion LLC

Checked against Apple's own criteria on 2026-10-24, so the plan is settled:
1.0 ships from the personal account and moves afterwards. An app is
transferable only once **at least one version has been released** to the App
Store, and the bundle id is bound to the team that uploaded a build. Apps with
auto-renewable subscriptions ARE transferable — the claim to the contrary was
outdated — they just need an app-specific shared secret handed over.

Carried over: bundle id, ratings, reviews, in-app purchases, existing users
and their updates, analytics history. Kept by the sender: historical sales and
payment data, which matters for the books.

Before initiating:

- [ ] **TestFlight has to be switched off** — every build and tester removed
      and the Test Information fields cleared. This is the step that surprises
      people, because it means the beta ends before the handover.
- [ ] Both accounts must have accepted the current paid and free agreements,
      and neither may be mid-change.
- [ ] No in-app purchase product id may collide with one in the LLC's account.
      Nothing else may be called `premium_monthly` over there.
- [ ] The app may not sit in any review state at the time — not Waiting for
      Review, In Review, Accepted or Pending Release.

Redone afterwards by the recipient:

- [ ] **Sign in with Apple**: a transfer identifier has to be generated for
      every existing user, and any app grouping ungrouped first — otherwise
      those accounts do not survive. `ios.usesAppleSignIn` is true, so this
      applies.
- [ ] Push certificates, App Groups and keychain groups carry the old Team ID.
- [ ] RevenueCat: new App Store Connect API key and a new shared secret. The
      webhook transfers with the app unless deleted first.
- [ ] EAS credentials, since the signing team changes.
- [ ] Promo codes cannot be generated after a transfer.
- [ ] Governing law in the terms moves from Germany to the LLC's state.
- [ ] Address in `app/imprint.tsx`, `app/terms.tsx`, `app/privacy.tsx` and the
      six website files.
- [ ] `TEAMID` in `website/.well-known/apple-app-site-association`.

### Still true from the older list

- [ ] `npx supabase secrets unset ALLOW_SANDBOX_PURCHASES`, then redeploy
      `verify-purchase`.
- [ ] `STRIPE_SECRET_KEY` is unset; Karley's account has
      `payouts_enabled: false`.
- [ ] 29 imported recipes have dead Instagram image URLs. Unrecoverable — the
      source URL was never stored — so they need re-importing or new photos.
- [ ] The creator application flow (apply → admin approves → role changes) has
      never been run end to end.

---

## ✅ Done (verified)

- [x] Core functionality (browse, save, plan, shop)
- [x] Swipe discovery with category filters
- [x] AI recipe import (photo, video, text)
- [x] Fridge Scan (Premium, 3 per rolling week, enforced server-side)
- [x] Creator pricing: per-recipe and profile memberships
- [x] Account deletion (GDPR/CCPA) — `delete_account()` RPC + web page
- [x] Privacy Policy and Terms pages (`docs/`)
- [x] Sign in with Apple — implemented in `app/login.tsx`
- [x] All SQL applied to production: payments, run_now, creator_pricing,
      harden_profiles, lock_recipe_content
- [x] Recipe content locked at the database — `ingredients`/`instructions` are
      not directly selectable; only `get_recipe_full` (paywalled) and
      `get_recipe_for_edit` (owner) return them
- [x] Privilege columns locked — `profiles.role` and `is_premium` are no longer
      client-writable

---

## 🔴 Blocking

### Security — must not ship as-is

- [ ] **Purchase grants are self-serve.** `grant_platform_entitlement`,
      `grant_recipe_purchase` and `grant_creator_entitlement` are SECURITY
      DEFINER, executable by any authenticated user, and verify no receipt.
      One RPC call with the anon key from the app bundle = free Premium, a free
      paid recipe, or a free membership. This defeats the entire paywall.
      → Move the grants into `supabase/functions/revenuecat-webhook` (service
        role, signed store event), then run the three `revoke execute`
        statements at the bottom of `supabase/harden_profiles.sql`.
      → Removes the debug unlock in Settings and the dev unlock in the paywall.
        Both are already `__DEV__`-only, so they never shipped anyway.

- [ ] **AI keys ship inside the app.** `EXPO_PUBLIC_GEMINI_API_KEY` and
      `EXPO_PUBLIC_GROQ_API_KEY` are in the bundle (5 usages across
      `lib/openai.ts` and `lib/fridge.ts`). Anyone who unpacks the IPA/APK can
      spend them on anything. `supabase/functions/extract-video-recipe` and
      `instacart-list` already show the pattern: move the calls server-side.
      → Interim mitigation: set a hard budget cap in the Google Cloud console.

- [ ] **Creator onboarding is broken.** `app/influencer-login.tsx` promotes
      whoever signs in on that screen to `role = 'creator'`. That write now
      fails (harden_profiles closed it) and only logs a warning — so nobody
      becomes a creator any more. Decide: assign the role by hand in SQL, or
      build a real invite flow. It must not go back to self-promotion.

### Payments

- [ ] **RevenueCat still uses the test key** (`test_jEJSpmuLjQmQ…` in
      `lib/purchases.ts`). Replace with the real `appl_…` / `goog_…` keys.
- [ ] **Register every price point as a store product.** The app advertises
      $4.99/mo and $39.99/yr, and creators pick from fixed tiers. That is
      12 products in App Store Connect *and* Play Console *and* RevenueCat:
      - Premium monthly $4.99, yearly $39.99
      - Recipe unlock: $0.99 / $1.99 / $2.99 / $4.99 / $9.99
      - Creator membership: $2.99 / $4.99 / $6.99 / $9.99 / $14.99
      Product ids must match `RECIPE_PRICE_TIERS` / `CREATOR_SUB_TIERS` in
      `lib/pricing.ts` exactly, and the tier values must match the check
      constraints in `supabase/creator_pricing.sql`.
- [ ] Confirm the store price matches the in-app price. The app now says
      $4.99; a product still priced at $9.99 would charge the wrong amount.

### Build

- [ ] `npx expo prebuild --clean` — the iOS Share Extension target only exists
      after this. Sharing from Instagram has never been tested on a device.
- [ ] EAS production builds for both platforms.
- [ ] Bump `version` / `buildNumber` / `versionCode` in `app.json` (still 1.0.0 / 1 / 1).

### Store setup

- [ ] App Store Connect: create app, privacy questionnaire, privacy policy URL,
      age rating, export compliance.
- [ ] Play Console: create app, Data Safety form, privacy policy URL, content
      rating, signing key.
- [ ] Screenshots — iPhone 6.7"/6.5", iPad 12.9", Android phone.
- [ ] Feature graphic (1024 x 500, Android).
- [ ] App icon 1024x1024.
- [ ] Google OAuth configured for the production Supabase project.

---

## 🟢 Deliberately deferred (not blocking)

- [ ] **Instacart / Walmart hand-off** — shows "coming soon". The Instacart
      Developer Platform is invite-only and quotes 30–40 days from application
      to a production key. `supabase/functions/instacart-list` is built and
      deployed; set `INSTACART_API_KEY` and flip `FEATURES.partnerCheckout`.
      Apply early, the clock runs in parallel with everything else.
- [ ] **Premium is thin.** Only Fridge Scan and recipe import are gated. At
      $4.99/mo consider also gating family portions and multi-week planning.
- [ ] `FEATURES.payments` is declared but read nowhere — wire it up or delete
      it before someone relies on it.

---

## 🟡 Recommended (Before or Shortly After Launch)

### Security

- [ ] Add Sentry for error tracking
- [ ] Implement rate limiting on AI calls
- [ ] Add input sanitization for AI prompts
- [ ] Consider certificate pinning

### Analytics (Optional)

- [ ] Add analytics with user consent
- [ ] Track key events (sign up, recipe save, etc.)

### Performance

- [ ] Test on low-end devices
- [ ] Optimize image loading
- [ ] Add offline mode handling

### Testing

- [ ] Manual QA on iOS device
- [ ] Manual QA on Android device
- [ ] Test all auth flows
- [ ] Test guest mode restrictions
- [ ] Test AI import with various images

---

## 📝 App Store Metadata

### App Name
SpoonDrop

### Subtitle (iOS, 30 chars)
Family Meal Planning Made Easy

### Short Description (Android, 80 chars)
Discover recipes, plan meals, and shop smarter for your family.

### Full Description
```
SpoonDrop makes family meal planning effortless. Discover delicious recipes from top creators, plan your weekly meals, and generate smart shopping lists automatically.

FEATURES:
• Swipe to discover recipes tailored to your dietary preferences
• Import recipes from photos, videos, or text using AI
• Smart shopping lists grouped by store aisle
• Weekly meal planning with drag-and-drop
• Family portion calculator based on age and dietary needs
• Follow your favorite recipe creators
• Save favorites and build your recipe collection

Whether you're cooking for picky eaters, managing dietary restrictions, or just looking for dinner inspiration, SpoonDrop has you covered.

Download now and transform the way your family eats!
```

### Keywords (iOS, 100 chars)
recipes,meal planning,family meals,cooking,shopping list,dinner ideas,healthy eating,food

### Category
- Primary: Food & Drink
- Secondary: Health & Fitness

---

## 🚀 Release Commands

```bash
# 1. Update version in lib/version.ts
# 2. Update version in app.json
# 3. Build for production

# iOS
npx eas build --platform ios --profile production

# Android
npx eas build --platform android --profile production

# Submit to stores
npx eas submit --platform ios
npx eas submit --platform android
```

---

## 📅 Post-Launch

- [ ] Monitor crash reports
- [ ] Respond to user reviews
- [ ] Track key metrics
- [ ] Plan v1.1 features
