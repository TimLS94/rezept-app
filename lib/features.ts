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

  // Import a recipe by pasting an Instagram link.
  //
  // Off for the 1.0 submission, for two reasons that happen to point the same
  // way. App Review guideline 5.2.2 wants an app that reads a third-party
  // service to be "specifically permitted to do so under the service's terms
  // of use", and authorisation produced on request — reading instagram.com
  // through a scraper is not permitted and there is no authorisation to show.
  // And the scraper has been answering "Media data not found. Try again
  // later." to every shortcode, so the feature is not working anyway.
  //
  // Nothing is deleted: the screens, lib/instagram.ts and the gateway route
  // all stay. This hides the tab, which is enough to keep it out of review,
  // and flipping it back is an over-the-air update rather than a build.
  //
  // The screenshot, camera and text routes are unaffected and raise none of
  // this: the person supplies the content, and Instagram is never contacted.
  instagramLinkImport: false,

  // Open recipe uploads to every signed-in user. Off for now — only accounts
  // with the 'creator' (or 'admin') role can upload. Marketplace opens in V1.5.
  publicRecipeUploads: false,
} as const;
