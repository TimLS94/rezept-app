// What the user agreed to be sent, and when.
//
// Two separate questions, because they are two separate things under US law
// and answering one must never imply the other:
//
//   Push — Apple's rules, not a statute. Guideline 4.5.4: push cannot be
//   required to use the app, and cannot carry advertising or promotion without
//   explicit opt-in. Asking here also protects the one shot iOS gives us at
//   the system prompt: someone who says no in our own words never has the real
//   dialog burned on them, and can still change their mind in Profile.
//
//   Marketing email — CAN-SPAM. Opt-in is not legally required; an honoured
//   opt-out is. We ask anyway, default it to off, and keep it out of the way
//   of transactional mail, which is exempt and must keep working: unsubscribing
//   from "new recipes this week" cannot stop a password reset arriving.
//
// The timestamps are written by the database, not here. A consent record
// dated by the device it is meant to prove something about proves nothing.
import { supabase } from './supabase';
import { fetchMyProfile } from './profile';

export type Consent = {
  push: boolean;
  marketingEmail: boolean;
};

export async function loadConsent(): Promise<Consent> {
  const profile: any = await fetchMyProfile();
  return {
    push: profile?.push_opt_in === true,
    marketingEmail: profile?.marketing_email_opt_in === true,
  };
}

/**
 * Record an answer. Pass only what changed — null leaves the other alone, so
 * a settings toggle cannot silently re-affirm a consent nobody touched.
 */
export async function saveConsent(
  push: boolean | null,
  marketingEmail: boolean | null,
): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('set_consent', {
    p_push: push,
    p_email: marketingEmail,
  });
  if (error) return { error: error.message };
  if (!data?.ok) return { error: data?.error ?? 'could-not-save' };
  return {};
}

/** The line that has to appear wherever marketing email is agreed to. */
export const MARKETING_EMAIL_NOTE =
  'Occasional email about new features and recipes. You can unsubscribe from any ' +
  'of them, or here in Profile, and we stop. This never affects email about your ' +
  'account — receipts, password resets and purchases always come through.';

export const PUSH_NOTE =
  'Reminders for meals you planned, and a note when a creator you follow posts ' +
  'something new. Nothing promotional unless you ask for it, and you can turn it ' +
  'off in Profile or in iOS Settings at any time.';
