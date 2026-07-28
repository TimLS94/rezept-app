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
