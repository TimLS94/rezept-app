import { router } from 'expo-router';

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
