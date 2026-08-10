import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

// 'not_configured' is the state before the Stripe key exists — the feature is
// built, just not switched on. It is reported separately from 'error' so the UI
// can say "coming soon" instead of "something went wrong".
export type PayoutStatus =
  | { status: 'not_configured' }
  | { status: 'none' }                                   // never started
  | { status: 'pending'; requirements: string[] }        // Stripe still verifying
  | { status: 'ready' }                                  // payouts possible
  | { status: 'error'; detail?: string };

export async function getPayoutStatus(): Promise<PayoutStatus> {
  const { data, error } = await supabase.functions.invoke('stripe-connect', {
    body: { action: 'status' },
  });
  if (error) return { status: 'error', detail: error.message };
  return (data ?? { status: 'error' }) as PayoutStatus;
}

/**
 * Opens Stripe's hosted onboarding. Everything sensitive — bank details, ID
 * documents — is entered on Stripe's own pages, so none of it touches this app
 * or its database. All we ever store is the account id.
 *
 * Returns the status to show afterwards; the caller should re-check with
 * getPayoutStatus() once the browser closes, because Stripe verifies
 * asynchronously and "finished the form" is not the same as "can be paid".
 */
export async function startPayoutOnboarding(): Promise<PayoutStatus> {
  const { data, error } = await supabase.functions.invoke('stripe-connect', {
    body: { action: 'onboard' },
  });
  if (error) return { status: 'error', detail: error.message };
  if (data?.status === 'onboarding' && data.url) {
    await WebBrowser.openBrowserAsync(data.url);
    return { status: 'pending', requirements: [] };
  }
  return (data ?? { status: 'error' }) as PayoutStatus;
}
