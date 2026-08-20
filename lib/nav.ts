import { router } from 'expo-router';
import { canUploadRecipes, type Role } from './auth';
import { loadPreferences } from './preferences';

/**
 * Where someone goes the moment they are signed in.
 *
 * One decision in one place, because there are four ways to arrive here —
 * password login, the six-digit code, the creator login, and the email
 * confirmation link — and three of them used to route straight to /home.
 * Onboarding was only ever checked on the index route, which none of those
 * three pass through, so the questions never came up for anyone who signed up
 * and carried straight on into the app.
 */
export async function landAfterAuth(role: Role | null): Promise<void> {
  // A failed lookup must not trap anyone in onboarding: assume it is done and
  // let them into the app. The questions are a convenience, not a gate.
  const onboarded = await loadPreferences()
    .then(r => r.onboarded)
    .catch(() => true);

  if (!onboarded) {
    router.replace('/onboarding');
    return;
  }
  router.replace(canUploadRecipes(role) ? '/creator' : '/home');
}

/**
 * Go back, or to `fallback` when there is nowhere to go back to.
 *
 * Plain `router.back()` is a silent no-op on the first screen of the stack, and
 * several screens can be the first screen: the share sheet opens straight into
 * the importer, a shared link opens straight into a recipe, and a notification
 * can open cook mode. In those cases the back button did nothing at all, which
 * reads as a frozen app rather than as "there is no back".
 */
export function goBackOr(fallback: string) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback as never);
}
