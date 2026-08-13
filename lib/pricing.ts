// Creator-set prices, as a fixed tier list.
//
// This is not a product decision we're free to revisit cheaply: Apple and
// Google only bill through IAP products registered ahead of time in App Store
// Connect / Play Console. A creator typing "$3.47" into a box cannot be
// charged, because no such product exists. So every price on offer is a tier,
// each tier is a registered product, and the creator picks one.
//
// Three places have to agree, or a purchase will fail at the till:
//   1. this file
//   2. the check constraints in supabase/creator_pricing.sql
//   3. the products/offerings configured in RevenueCat
// Adding a tier means adding it in all three.

// ── App Premium ────────────────────────────────────────────────────────────
// Premium buys the app's TOOLS. It does not unlock any creator's paid recipes —
// that money goes to the creator instead. Keeping the two apart is the whole
// reason a creator can set a price at all: if a $4.99 app subscription handed
// out their work, nobody would ever buy from them directly.
//
// The single source of truth for what Premium includes. The paywall, the
// settings screen and the explainer all render from this list, so the promise
// can't drift between screens.
export const PREMIUM_MONTHLY_CENTS = 499;
export const PREMIUM_YEARLY_CENTS = 3999;

export const PREMIUM_INCLUDES = [
  { icon: '🧊', title: 'Fridge Scan', text: 'Photograph your fridge and get recipes you can cook now — 3 scans a week.' },
  { icon: '📥', title: 'Recipe import', text: 'Turn an Instagram or TikTok link, a screenshot or pasted text into a proper recipe.' },
  { icon: '📅', title: 'Meal planning', text: 'Plan your week and build the shopping list from it in one tap.' },
  { icon: '👨‍👩‍👧', title: 'Family portions', text: 'Per-person portion sizes so quantities scale to who is actually eating.' },
] as const;

// Stated as plainly as the benefits, and shown right next to them. A paywall
// that only lists what you get is how people end up feeling misled.
export const PREMIUM_EXCLUDES =
  "Creator recipes aren't included. Those are sold by the creators themselves — 75% of what you pay goes straight to them.";

export type PriceTier = {
  cents: number;
  label: string;
  productId: string;   // must match the store product identifier exactly
};

// One-off purchase of a single recipe (non-consumable — owned forever).
export const RECIPE_PRICE_TIERS: PriceTier[] = [
  { cents: 99, label: '$0.99', productId: 'recipe_unlock_099' },
  { cents: 199, label: '$1.99', productId: 'recipe_unlock_199' },
  { cents: 299, label: '$2.99', productId: 'recipe_unlock_299' },
  { cents: 499, label: '$4.99', productId: 'recipe_unlock_499' },
  { cents: 999, label: '$9.99', productId: 'recipe_unlock_999' },
];

// Monthly subscription to one creator — all of their paid recipes.
export const CREATOR_SUB_TIERS: PriceTier[] = [
  { cents: 299, label: '$2.99', productId: 'creator_sub_299' },
  { cents: 499, label: '$4.99', productId: 'creator_sub_499' },
  { cents: 699, label: '$6.99', productId: 'creator_sub_699' },
  { cents: 999, label: '$9.99', productId: 'creator_sub_999' },
  { cents: 1499, label: '$14.99', productId: 'creator_sub_1499' },
];

export const usd = (cents: number | null | undefined) =>
  cents == null ? '—' : `$${(cents / 100).toFixed(2)}`;

export const findRecipeTier = (cents: number | null | undefined) =>
  RECIPE_PRICE_TIERS.find(t => t.cents === cents) ?? null;

export const findCreatorSubTier = (cents: number | null | undefined) =>
  CREATOR_SUB_TIERS.find(t => t.cents === cents) ?? null;

// What the creator keeps, after the store fee and the platform's 25%. Shown in
// the pricing UI so a creator picking a tier sees the actual take-home rather
// than the sticker price — the store cut is the bigger deduction and is easy to
// forget. Mirrors the math in supabase/creator_pricing.sql.
// Apple and Google take their cut before we ever see the money.
//
//   Apple, standard                          30%
//   Apple, Small Business Program (<$1M/yr)  15%  ← must be enrolled
//   Google Play, first $1M per year          15%  (automatic)
//
// 1500 assumes enrolment in Apple's Small Business Program. If that is not
// done before the first sale it is 3000, and every "you keep $X" figure below
// is 15 percentage points too optimistic — we'd be promising creators money
// that never arrives. Keep in step with store_fee_bps() in
// supabase/store_fee.sql, which does the same maths when recording a purchase.
export const STORE_FEE_BPS = 1500;
export const PLATFORM_FEE_BPS = 2500;

const pct = (bps: number) => `${bps / 100}%`;

export function creatorTakeHomeCents(priceCents: number): number {
  const afterStore = priceCents * (10000 - STORE_FEE_BPS) / 10000;
  return Math.floor(afterStore * (10000 - PLATFORM_FEE_BPS) / 10000);
}

/**
 * The full journey of one payment, for showing a creator where their money
 * goes. A single "you keep $3.17" invites the question "why not $4.99?", and
 * the honest answer is that most of the gap is Apple's, not ours.
 */
export function feeBreakdown(priceCents: number) {
  const storeFee = Math.round(priceCents * STORE_FEE_BPS / 10000);
  const afterStore = priceCents - storeFee;
  const platformFee = Math.round(afterStore * PLATFORM_FEE_BPS / 10000);
  return {
    price: priceCents,
    storeFee,
    storeFeeLabel: `App Store / Play (${pct(STORE_FEE_BPS)})`,
    platformFee,
    platformFeeLabel: `SpoonDrop (${pct(PLATFORM_FEE_BPS)})`,
    takeHome: afterStore - platformFee,
  };
}
