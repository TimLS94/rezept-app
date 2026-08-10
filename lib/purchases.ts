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
// Test-Store key for early testing (works on both platforms, needs a dev build).
// Replace with the real appl_… / goog_… keys once the App Store / Play Store
// apps are configured in RevenueCat.
const RC_IOS_KEY = 'test_jEJSpmuLjQmQaisPFkcFZsROsrK';
const RC_ANDROID_KEY = 'test_jEJSpmuLjQmQaisPFkcFZsROsrK';
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

// True once real keys are set AND the native SDK is available (dev build).
export function purchasesAvailable(): boolean {
  if (isExpoGo) return false;
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
    const { data, error } = await supabase.rpc('grant_platform_entitlement', {
      p_product: product ?? null,
      p_price_cents: priceCents,
    });
    if (error) return { ok: false, error: error.message };
    const d = data as any;
    return { ok: !!d?.ok, error: d?.error };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'exception' };
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

  const { data, error } = await supabase.rpc('grant_recipe_purchase', {
    p_recipe_id: recipeId,
    p_price_cents: priceCents,
  });
  if (error) return { result: 'error', error: error.message };
  const d = data as any;
  return d?.ok ? { result: 'success' } : { result: 'error', error: d?.error };
}

// Subscribe to one creator — unlocks everything they publish.
export async function purchaseCreatorSubscription(
  creatorId: string,
  priceCents: number,
  productId: string,
): Promise<{ result: PurchaseResult; error?: string }> {
  const result = await purchaseByProductId(productId);
  if (result !== 'success') return { result };

  const { data, error } = await supabase.rpc('grant_creator_entitlement', {
    p_creator_id: creatorId,
    p_price_cents: priceCents,
  });
  if (error) return { result: 'error', error: error.message };
  const d = data as any;
  return d?.ok ? { result: 'success' } : { result: 'error', error: d?.error };
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
