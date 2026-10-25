// Central feature flags. Flip a value to re-enable a feature everywhere.
//
// Roadmap staging:
//  - V1  = core loop (browse, scale, shopping list, weekly plan, swipe, search)
//  - V2  = commerce (budget planning, partner shops) — needs real price data
export const FEATURES = {
  // Budget planning: weekly budget, per-meal cost, spend tracking.
  // Roadmap V2. Off for now — the meal planner stays a pure weekly plan.
  budget: false,

  // Paid subscription / Premium gating (Apple/Google IAP).
  // Off until in-app purchases are wired up.
  payments: false,

  // Hand the shopping list to a retailer (Instacart, Walmart).
  //
  // Off until Instacart approves the integration: their Developer Platform is
  // invite-only and quotes 30–40 days from application to a production key
  // (supabase/functions/instacart-list is already built and deployed, it just
  // has no key). Without it the only thing these buttons could do is drop the
  // whole list into a search box as one string, which finds nothing — worse
  // than saying "coming soon". Flip this to true once the key is set.
  partnerCheckout: false,

  // Import a recipe by pasting an Instagram link — creators only.
  //
  // Reading instagram.com through a scraper is not something Instagram's
  // terms permit, which App Review guideline 5.2.2 asks about directly: an
  // app that displays a third-party service's content has to be specifically
  // permitted, and produce the authorisation on request. There is none to
  // produce.
  //
  // So it is bound to the creator role, which is granted by an admin and is
  // the account type that imports its own posts in bulk. That is a rule the
  // product already has rather than a curtain drawn for the reviewer — the
  // distinction guideline 2.3.1 cares about, and the reason this is a role
  // gate in both directions rather than something switched off at submission
  // and back on afterwards.
  //
  // Consumers never see the tab. For them the screenshot route does the same
  // job, raises none of this, and needs no explaining.
  creatorInstagramImport: true,

  // Open recipe uploads to every signed-in user. Off for now — only accounts
  // with the 'creator' (or 'admin') role can upload. Marketplace opens in V1.5.
  publicRecipeUploads: false,
} as const;
