# SpoonDrop Launch Checklist

## Version 1.0.0 — Initial Release

Status verified against the live project on 2026-08-06.

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
