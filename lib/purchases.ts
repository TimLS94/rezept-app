import { Platform } from 'react-native';

// ── RevenueCat integration ──────────────────────────────────────────────────
// PLACEHOLDERS — fill these from the RevenueCat dashboard, then create an EAS
// dev build. Until real keys are set (and the native module is present), every
// function here is an inert no-op so the app keeps running in Expo Go.
//
//   RC_IOS_KEY / RC_ANDROID_KEY : Project → API keys (public app-specific keys)
//   ENTITLEMENT_ID              : the entitlement you map the sub to (e.g. "premium")
const RC_IOS_KEY = 'appl_PLACEHOLDER';
const RC_ANDROID_KEY = 'goog_PLACEHOLDER';
export const ENTITLEMENT_ID = 'premium';

let Purchases: any = null;
let configured = false;

// Lazy require: in Expo Go the native module doesn't exist, so importing it
// statically would crash. We only touch it once a dev build includes it.
function loadSDK(): any {
  if (Purchases) return Purchases;
  try {
    Purchases = require('react-native-purchases').default;
  } catch {
    Purchases = null;
  }
  return Purchases;
}

function apiKey(): string {
  return Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY;
}

// True once real keys are set AND the native SDK is available (dev build).
export function purchasesAvailable(): boolean {
  return !!loadSDK() && !apiKey().includes('PLACEHOLDER');
}

export async function initPurchases(userId?: string): Promise<void> {
  const P = loadSDK();
  if (!P || !purchasesAvailable()) return;
  try {
    if (!configured) {
      P.configure({ apiKey: apiKey(), appUserID: userId });
      configured = true;
    } else if (userId) {
      await P.logIn(userId);
    }
  } catch {
    // never let purchase setup break app startup
  }
}

export async function logInPurchases(userId: string): Promise<void> {
  const P = loadSDK();
  if (!P || !configured) return;
  await P.logIn(userId).catch(() => {});
}

export async function logOutPurchases(): Promise<void> {
  const P = loadSDK();
  if (!P || !configured) return;
  await P.logOut().catch(() => {});
}

// The current offering's first package (Phase 1: one app-wide premium sub).
export async function getPremiumPackage(): Promise<any | null> {
  const P = loadSDK();
  if (!P || !configured) return null;
  try {
    const offerings = await P.getOfferings();
    return offerings?.current?.availablePackages?.[0] ?? null;
  } catch {
    return null;
  }
}

// Human-readable price string for the paywall (e.g. "€9,99"), or null.
export async function getPremiumPriceString(): Promise<string | null> {
  const pkg = await getPremiumPackage();
  return pkg?.product?.priceString ?? null;
}

export type PurchaseResult = 'success' | 'cancelled' | 'unavailable' | 'error';

export async function purchasePremium(): Promise<PurchaseResult> {
  const P = loadSDK();
  if (!P || !configured) return 'unavailable';
  try {
    const pkg = await getPremiumPackage();
    if (!pkg) return 'unavailable';
    const { customerInfo } = await P.purchasePackage(pkg);
    return customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] ? 'success' : 'error';
  } catch (e: any) {
    if (e?.userCancelled) return 'cancelled';
    return 'error';
  }
}

// Apple requires a visible "Restore Purchases" action.
export async function restorePurchases(): Promise<PurchaseResult> {
  const P = loadSDK();
  if (!P || !configured) return 'unavailable';
  try {
    const info = await P.restorePurchases();
    return info?.entitlements?.active?.[ENTITLEMENT_ID] ? 'success' : 'error';
  } catch {
    return 'error';
  }
}
