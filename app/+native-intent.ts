// Expo Router calls this for every URL that opens the app (cold start AND while
// running), BEFORE it tries to match a route. We use it to translate external
// links (Instagram App Links, shared text URLs, our own scheme) into a real
// in-app route, so they never fall through to the "Unmatched Route" screen.
//
// NOTE: this only fires in a dev/production build. In Expo Go the app runs under
// Expo's `exp://` scheme and these intents never reach us — test with
// `npx expo run:android` / `run:ios` or an EAS dev build.
import { getShareExtensionKey } from 'expo-share-intent';
import { extractInstagramUrl, extractTikTokUrl } from '../lib/shareHandler';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // Share sheet: the native extension reopens us with our own scheme and a
    // key, not a readable URL — the payload lives in the native module. Send it
    // to /shareintent, which reads it via the ShareIntentProvider. Without this
    // branch the link falls through to the "Unmatched Route" screen.
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      return '/shareintent';
    }

    // Supabase auth callbacks (email confirmation, password reset). They come
    // back on our own scheme carrying the result in the fragment, which arrives
    // double-encoded — %2523 instead of #. Without this branch they fell
    // through to the "Unmatched Route" screen, which looks like a broken app
    // even when the confirmation itself succeeded.
    if (/access_token=|refresh_token=|error_code=|type=(signup|recovery|magiclink)/.test(path)
        || /%2523|%23/.test(path)) {
      return `/auth-callback?payload=${encodeURIComponent(path)}`;
    }

    // `path` can be a full URL (https://www.instagram.com/reel/…) for App Links,
    // or just the path portion (/reel/…) depending on how the OS delivered it.
    let candidate = path;

    // Reconstruct a full Instagram URL when only the path prefix came through
    // (our intent filter only registers /reel and /p, both Instagram-only).
    if (!/instagram\.com/i.test(candidate) && /^\/(reel|reels|p|tv)\//i.test(candidate)) {
      candidate = `https://www.instagram.com${candidate}`;
    }

    const igUrl = extractInstagramUrl(candidate);
    if (igUrl) {
      return `/cookbook/import?sharedUrl=${encodeURIComponent(igUrl)}`;
    }

    const ttUrl = extractTikTokUrl(candidate);
    if (ttUrl) {
      return `/cookbook/import?sharedUrl=${encodeURIComponent(ttUrl)}`;
    }

    // Not something we recognise — let Expo Router handle it normally.
    return path;
  } catch {
    return '/';
  }
}
