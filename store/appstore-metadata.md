# App Store Connect — metadata for SpoonDrop 1.0

Everything typed into App Store Connect, kept here so it survives a move to
another developer account. Text and images transfer by copy-paste; only the
account-bound things (bundle ID, certificates, API keys) do not.

Locale: English (U.S.)

## App Information (account-wide, not per version)

Name          SpoonDrop
              (26/30 alternative for ASO: "SpoonDrop: Recipes & Meals")
Subtitle      Cook what you already have
Bundle ID     com.spoondrop.app        <- locked to the personal team, see NOTE
Primary cat.  Food & Drink
Content rights  Yes — contains third-party content, rights confirmed.
                Users import recipes from Instagram and links; creators upload
                their own recipes.

## Version 1.0 — product page

Promotional text (170 max, editable without a new version):

    Scan your fridge and see what you can cook tonight. Import any recipe from
    a photo or a link, plan the week, and let the shopping list write itself.

Keywords (97/100):

    recipe,meal plan,grocery,cooking,dinner,fridge,family,shopping list,food,import,kitchen,weekly

Support URL      https://spoondrop.app/support
Marketing URL    https://spoondrop.app
Privacy URL      https://spoondrop.app/privacy
Copyright        2026 Tim Schäfer
Release          Manually release this version

## App Review Information

Sign-in required: YES. The reviewer cannot register — SMTP is not configured,
so no confirmation mail is delivered. The demo account must already exist and
be confirmed.

    Demo account (consumer):
      email: <fill in>
      password: <fill in>

Review notes (paste into the version page, replacing whatever is there):

    Demo account (consumer):
      email: apple.review@spoondrop.app
      password: SpoonDrop-Review-2025

    You may also sign in with Apple; both work.

    SpoonDrop has three kinds of in-app purchase. Here is exactly where to
    find each one.

    1. PREMIUM SUBSCRIPTION (auto-renewable, monthly / yearly)
       Profile tab > "Upgrade to Premium".
       Unlocks recipe import (3 Instagram imports a week, plus 10 from
       screenshots, photos or text), the fridge scan (3 a week) and the
       meal planner. Premium does NOT unlock creators' paid recipes —
       those are bought separately, below.

    2. SINGLE RECIPE UNLOCK (consumable, five price tiers)
       Discover tab: paid recipes appear in the swipe deck with a lock
       badge. Open one and tap "Buy this recipe - $X.XX".
       Or: Home tab > tap the "Search recipes and creators" bar > switch
       to Creators > "dadsfoodtoday" > open the profile, where paid
       recipes are marked "Paid". (There is no Search tab; search lives
       on Home.)
       After buying, the recipe is permanently unlocked and appears under
       Cookbook > Creators, marked "Purchased".

       These are consumables because one price serves many recipes: a
       customer buying a second $1.99 recipe must be able to pay again. The
       recipe they bought is recorded on our server, so the unlock is
       permanent even though the product is consumable.

    3. CREATOR MEMBERSHIP (auto-renewable, five price tiers)
       On a creator profile, tap "Become a member - $X.XX/mo".
       Unlocks every paid recipe by that creator for as long as it runs.

    Creators choose their own price from five fixed tiers, which is why
    there are five products of each kind. Customers are charged the App
    Store price for their country, so the figure shown in the app may differ
    from the USD tier the creator picked.

    All purchases are digital content used inside the app, handled by Apple
    In-App Purchase via RevenueCat.

NOTE: the text submitted on 8 November said "Search tab", and there is no
Search tab — search is a bar on Home. The reviewer's primary path (Discover)
was correct, so it was left standing rather than pulled from the queue, but
it is the same class of error as the rejection below: a note describing a
screen nobody checked against the app.

NOTE on the previous rejection (2.1(b)): the earlier notes sent the reviewer
to the Discover deck, which at the time filtered paid recipes out. Discover
now includes them with a lock badge, so the path in the notes above is real.
If a submission is ever rejected for an unreachable purchase again, check the
path in these notes against the running app before anything else.

## Screenshots

    iPhone, Dynamic Island, medium (6.3")   1206 x 2622   >= 3   REQUIRED
    iPad 13"                                2064 x 2752   >= 3   REQUIRED
                                                          while ios.supportsTablet is true

    Header / search-results art (5244 x 2950 or 3840 x 1646) is optional.

Planned order: Discover swipe, recipe detail, import, weekly planner,
shopping list.

## In-app purchases (12)

These ids are the ones App Store Connect holds, and nothing in this repo
checks them: the app buys through RevenueCat offerings and never names a
product. So this list is a note, not a source of truth, and it has been wrong.
It said `premium_monthly` while the store sells `spoondrop_premium_monthly`,
and code written against the note would have denied Premium to people who had
paid for it. Before using an id from here, confirm it against a real row:

    select distinct product_id, store from public.entitlements
    where store in ('app_store', 'play_store');

    spoondrop_premium_monthly  $2.99/mo   auto-renewable, group "Premium"
      — confirmed against a live entitlement row, 2026-11-08
    spoondrop_premium_yearly  $29.99/yr   auto-renewable, group "Premium"
      — confirmed against a live entitlement row, 2026-11-08
    recipe_credit_099       $0.99     consumable
    recipe_credit_199       $1.99     consumable
    recipe_credit_299       $2.99     consumable
    recipe_credit_499       $4.99     consumable
    recipe_credit_999       $9.99     consumable
      — the recipe_unlock_* ids listed here before were non-consumables, which
        allowed one purchase per Apple ID for all time. See lib/pricing.ts.
    creator_sub_299         $2.99/mo  auto-renewable, group "Creator Memberships"
    creator_sub_499         $4.99/mo  auto-renewable, group "Creator Memberships"
    creator_sub_699         $6.99/mo  auto-renewable, group "Creator Memberships"
    creator_sub_999         $9.99/mo  auto-renewable, group "Creator Memberships"
    creator_sub_1499       $14.99/mo  auto-renewable, group "Creator Memberships"

Entitlement served to the client: "Cook_App Pro" (lib/purchases.ts and
supabase/functions/verify-purchase/index.ts must agree — they diverged once).

## App Privacy — the answers, and why

Answered 2026-10-24. Kept because a move to another developer account means
answering all of it again, and because the label has to keep matching the
privacy policy as the app changes.

Tracking is No for every type: there is no advertising or analytics SDK in
package.json, nothing is shared with a data broker, and so no ATT prompt is
needed. Linked to identity is Yes for every type — every table carries a
user_id, including app_errors and service_events.

    Name                      App Functionality
    Email Address             App Functionality, Developer's Marketing
    Health                    App Functionality, Product Personalization
    Photos or Videos          App Functionality
    Other User Content        App Functionality, Product Personalization
    User ID                   App Functionality, Analytics
    Purchases                 App Functionality, Analytics
    Product Interaction       App Functionality, Analytics
    Crash Data                App Functionality
    Performance Data          App Functionality
    Other Diagnostic Data     App Functionality

Health is the one judgment call. It is declared because profiles.preferences
and profiles.dietary_restrictions hold a person's allergies, the onboarding
stores a lose/maintain/gain weight goal, and family_members holds an age,
gender and weight per person — including children. Apple's definition reaches
"any other user provided health or medical data", which does not require
HealthKit. The nutrition log is NOT a reason: lib/nutritionLog.ts stores
nothing of its own, it adds up cook_log.

Analytics is on User ID, Purchases and Product Interaction because the
dashboard measures audience size and usage from them (total_users, signups,
active_premium, imports, fridge scans). It is deliberately NOT on the three
diagnostic types: Apple's own example text for App Functionality names
"minimize app crashes" and "improve scalability and performance", and a stack
trace says nothing about anyone's behaviour.

NOT declared:

  - Payment Info. Apple's own wording settles it: payment details entered
    outside the app, with no developer access, are not collected. Card details
    go to Apple, creator bank details go to Stripe's hosted onboarding, and
    neither reaches this database.
  - Environment Scanning. The fridge photo is image recognition of a user's
    surroundings, but lib/fridge.ts keeps only the detected ingredients, and
    data that merely passes through is not collected.
  - Search History. Searches are never stored.
  - Sensitive Info. No religious diets are offered, so nothing implies belief.
  - Precise or Coarse Location. The app has no location code at all.

## NOTE — moving to Lion LLC

Apple binds a bundle ID to the team that registered it, and a build has
already been uploaded under the personal team, so com.spoondrop.app cannot
simply be re-registered elsewhere. Apple's app transfer is the supported route
and it requires at least one released version. Practical consequence: ship 1.0
under the personal account, then transfer.

Open question to put to Apple Developer Support before launch: whether an app
offering auto-renewable subscriptions is transferable. Sources conflict; the
answer decides whether the transfer plan holds.
