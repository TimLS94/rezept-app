import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// Centralized version management
// Update these values before each release

export const APP_VERSION = {
  // Semantic version (shown to users)
  version: '1.0.0',
  
  // Build number (incremented for each build)
  // iOS: CFBundleVersion
  // Android: versionCode
  buildNumber: 1,
  
  // Release date
  releaseDate: '2026-07-27',
  
  // Minimum supported API version (for backend compatibility)
  minApiVersion: 1,
} as const;

// Version string for display
export const VERSION_STRING = `v${APP_VERSION.version} (${APP_VERSION.buildNumber})`;

// What is ACTUALLY running, which the constants above cannot tell you: they are
// hand-maintained and go stale, and they say nothing about over-the-air updates.
// Since a published update keeps the same TestFlight build number, "still build
// 3" is not evidence that an update failed — this line is how you tell.
//
//   v1.0.0 · built-in            → the bundle shipped inside the build
//   v1.0.0 · update 13 Aug 12:40 → an OTA update is active, with its timestamp
export function runtimeLabel(): string {
  const version = Constants.expoConfig?.version ?? APP_VERSION.version;
  if (!Updates.isEnabled) return `v${version} · dev`;
  if (Updates.isEmbeddedLaunch) return `v${version} · built-in`;
  const at = Updates.createdAt;
  const when = at
    ? at.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'unknown date';
  return `v${version} · update ${when}`;
}

// Changelog for this version
export const CHANGELOG = {
  '1.0.0': {
    date: '2026-07-27',
    changes: [
      'Initial release',
      'Recipe discovery with swipe interface',
      'AI-powered recipe import (photo, video, text)',
      'Shopping list with smart grouping',
      'Meal planning',
      'Family portion calculator',
      'Creator profiles and subscriptions',
      'Google Sign-In',
      'Guest mode with limited access',
    ],
  },
} as const;
