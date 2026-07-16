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
} as const;
