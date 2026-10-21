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

Review notes:

    SpoonDrop is a recipe app with three types of in-app purchases:
    1. Premium subscription (monthly/yearly) - unlocks unlimited recipe imports
       and the AI meal planner. Paywall: Profile > Upgrade to Premium.
    2. Individual recipe purchases (non-consumable) - some creator recipes are
       paid. Tap any recipe marked with a price in Discover.
    3. Creator subscriptions - subscribe to a creator for access to all their
       recipes. Open a creator profile and tap Subscribe.

    All purchases are digital content consumed inside the app and are handled
    through Apple In-App Purchase via RevenueCat.

## Screenshots

    iPhone, Dynamic Island, medium (6.3")   1206 x 2622   >= 3   REQUIRED
    iPad 13"                                2064 x 2752   >= 3   REQUIRED
                                                          while ios.supportsTablet is true

    Header / search-results art (5244 x 2950 or 3840 x 1646) is optional.

Planned order: Discover swipe, recipe detail, import, weekly planner,
shopping list.

## In-app purchases (12)

    premium_monthly        $2.99/mo   auto-renewable, group "Premium"
    premium_yearly        $29.99/yr   auto-renewable, group "Premium"
    recipe_unlock_099       $0.99     non-consumable
    recipe_unlock_199       $1.99     non-consumable
    recipe_unlock_299       $2.99     non-consumable
    recipe_unlock_499       $4.99     non-consumable
    recipe_unlock_999       $9.99     non-consumable
    creator_sub_299         $2.99/mo  auto-renewable, group "Creator Memberships"
    creator_sub_499         $4.99/mo  auto-renewable, group "Creator Memberships"
    creator_sub_699         $6.99/mo  auto-renewable, group "Creator Memberships"
    creator_sub_999         $9.99/mo  auto-renewable, group "Creator Memberships"
    creator_sub_1499       $14.99/mo  auto-renewable, group "Creator Memberships"

Entitlement served to the client: "Cook_App Pro" (lib/purchases.ts and
supabase/functions/verify-purchase/index.ts must agree — they diverged once).

## NOTE — moving to Lion LLC

Apple binds a bundle ID to the team that registered it, and a build has
already been uploaded under the personal team, so com.spoondrop.app cannot
simply be re-registered elsewhere. Apple's app transfer is the supported route
and it requires at least one released version. Practical consequence: ship 1.0
under the personal account, then transfer.

Open question to put to Apple Developer Support before launch: whether an app
offering auto-renewable subscriptions is transferable. Sources conflict; the
answer decides whether the transfer plan holds.
