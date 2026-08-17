import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { PREMIUM_MONTHLY_CENTS } from './pricing';

// Expo Go has no native RevenueCat module — the SDK falls back to a "browser
// mode" whose network calls fail. Skip RevenueCat entirely there; it only runs
// in a real dev/store build. (Entitlement checks still work via Supabase.)
const isExpoGo = Constants.executionEnvironment === 'storeClient';

// ── RevenueCat integration ──────────────────────────────────────────────────
// PLACEHOLDERS — fill these from the RevenueCat dashboard, then create an EAS
// dev build. Until real keys are set (and the native module is present), every
// function here is an inert no-op so the app keeps running in Expo Go.
//
//   RC_IOS_KEY / RC_ANDROID_KEY : Project → API keys (public app-specific keys)
//   ENTITLEMENT_ID              : the entitlement you map the sub to (e.g. "premium")
// Replace with the real appl_… / goog_… keys from the RevenueCat dashboard once
// the App Store / Play Store apps are configured there. Until then these stay
// inert — see apiKeyIsProduction below for why a test key must never reach
// Purchases.configure() in a release build.
// These are the PUBLIC SDK keys (appl_… / goog_…). EXPO_PUBLIC_ is right for
// them: they identify the app to RevenueCat and are meant to ship in it. They
// are NOT the secret REST key — that one lives only in Supabase secrets as
// REVENUECAT_SECRET_KEY and must never appear here.
//
// Read from the environment so switching test → production is a config change
// rather than a code change; the literal stays as the fallback so a checkout
// without a .env still runs (inert, see apiKeyIsProduction).
const RC_FALLBACK_KEY = 'test_jEJSpmuLjQmQaisPFkcFZsROsrK';
const RC_IOS_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_KEY ||
  RC_FALLBACK_KEY;
const RC_ANDROID_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_KEY ||
  RC_FALLBACK_KEY;
// Must match the RevenueCat entitlement identifier exactly (incl. spaces/case).
export const ENTITLEMENT_ID = 'Cook_App Pro';

let Purchases: any = null;
let configured = false;

// Lazy require: in Expo Go the native module doesn't exist, so importing it
// statically would crash. We only touch it once a dev build includes it.
function loadSDK(): any {
  if (isExpoGo) return null; // never load the SDK in Expo Go
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

// A real, production RevenueCat key. Anything else means "don't configure".
//
// This guard is not cosmetic: RevenueCat's SDK detects its own test key in a
// release build and DELIBERATELY TERMINATES THE APP ("Wrong API Key … the app
// will close now to protect the security of test purchases"). SpoonDrop crashed
// on every launch in TestFlight for exactly that reason. Checking only for
// "PLACEHOLDER" wasn't enough — the test key contains no such marker.
//
// Skipping configure() costs nothing today: no IAP products are registered, so
// every purchase path already reports 'unavailable' and the UI says so plainly.
function apiKeyIsProduction(key: string): boolean {
  return /^(appl|goog)_/.test(key);
}

// True once real keys are set AND the native SDK is available (dev build).
export function purchasesAvailable(): boolean {
  if (isExpoGo) return false;
  return !!loadSDK() && apiKeyIsProduction(apiKey());
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

// Human-readable price string for the paywall (e.g. "$9.99"), or null.
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

// Write the platform entitlement via the SQL RPC (works with only payments.sql
// applied — no edge function needed). Call after RevenueCat confirms a purchase.
export async function grantPlatformEntitlement(product?: string): Promise<{ ok: boolean; error?: string }> {
  // Pass the subscription price so the revenue pool reflects the purchase.
  let priceCents: number | null = null;
  try {
    const pkg = await getPremiumPackage();
    const p = pkg?.product?.price;
    if (typeof p === 'number' && p > 0) priceCents = Math.round(p * 100);
  } catch {}
  // Fallback for debug/no-offering paths. Reads the list price rather than a
  // literal, so it can't drift from what the paywall advertises.
  if (priceCents == null) priceCents = PREMIUM_MONTHLY_CENTS;

  try {
    return verifyPurchase({ kind: 'platform' });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'exception' };
  }
}


/**
 * Ask the server to confirm a purchase and open the gate.
 *
 * The app never grants anything itself any more. It reports what it just
 * bought; verify-purchase checks that claim against RevenueCat's record of the
 * account before writing. A client that lies gets a 402.
 */
async function verifyPurchase(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-purchase', { body: payload });
    if (error) {
      const detail = await error?.context?.json?.().catch(() => null);
      return { ok: false, error: detail?.error ?? error.message };
    }
    return { ok: !!data?.ok, error: data?.error };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'verify-unreachable' };
  }
}

// ── Phase 2: creator-set prices ────────────────────────────────────────────
// Both flows are "charge through the store, then record it server-side", the
// same shape as grantPlatformEntitlement. The store is the source of truth for
// payment; the RPC is what actually opens the content gate.
//
// `productId` must be a registered IAP product — see lib/pricing.ts. Until the
// products exist in RevenueCat these return 'unavailable' rather than pretending
// to have charged anyone.

async function purchaseByProductId(productId: string): Promise<PurchaseResult> {
  const P = loadSDK();
  if (!P || !configured) return 'unavailable';
  try {
    const offerings = await P.getOfferings();
    const packages: any[] = Object.values(offerings?.all ?? {})
      .flatMap((o: any) => o?.availablePackages ?? []);
    const pkg = packages.find(p => p?.product?.identifier === productId);
    if (!pkg) return 'unavailable';
    await P.purchasePackage(pkg);
    return 'success';
  } catch (e: any) {
    if (e?.userCancelled) return 'cancelled';
    return 'error';
  }
}

// Buy a single recipe outright (permanent unlock).
export async function purchaseRecipe(
  recipeId: string,
  priceCents: number,
  productId: string,
): Promise<{ result: PurchaseResult; error?: string }> {
  const result = await purchaseByProductId(productId);
  if (result !== 'success') return { result };

  const v = await verifyPurchase({ kind: 'recipe', recipeId, productId });
  return v.ok ? { result: 'success' } : { result: 'error', error: v.error };
}

// Subscribe to one creator — unlocks everything they publish.
export async function purchaseCreatorSubscription(
  creatorId: string,
  priceCents: number,
  productId: string,
): Promise<{ result: PurchaseResult; error?: string }> {
  const result = await purchaseByProductId(productId);
  if (result !== 'success') return { result };

  const v = await verifyPurchase({ kind: 'creator', creatorId, productId });
  return v.ok ? { result: 'success' } : { result: 'error', error: v.error };
}

// Testing only. Clears the platform entitlement and the legacy is_premium flag
// so the paywall can be exercised again from a signed-in account.
//
// It does NOT cancel a real subscription — Apple and Google own that, and this
// app has no way to do it. If a live subscription exists, `syncEntitlements()`
// or the RevenueCat webhook will simply grant it back.
export async function revokePlatformEntitlement(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('revoke_platform_entitlement');
    if (error) return { ok: false, error: error.message };
    const d = data as any;
    return { ok: !!d?.ok, error: d?.error };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'exception' };
  }
}

export type SyncResult = { active: boolean; error?: string; details?: any };

// Reconcile RevenueCat → Supabase so the server-side content gate unlocks.
// Safe to call even if the edge function isn't deployed. Returns diagnostics.
export async function syncEntitlements(): Promise<SyncResult> {
  try {
    const { data, error } = await supabase.functions.invoke('sync-entitlements');
    if (error) return { active: false, error: error.message || 'invoke_failed' };
    const d = data as any;
    return { active: !!d?.active, error: d?.error, details: d };
  } catch (e: any) {
    return { active: false, error: e?.message || 'exception' };
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
