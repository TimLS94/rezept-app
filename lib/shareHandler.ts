// URL extractors for incoming shared content from Instagram/TikTok.
//
// Routing lives elsewhere on purpose: `app/+native-intent.ts` handles deep
// links (it runs before route matching) and `app/shareintent.tsx` handles the
// share sheet. An earlier version also navigated from here via a Linking
// listener, which raced Expo Router's own linking and double-navigated — hence
// only the pure helpers remain.

// Extract Instagram URL from shared text
export function extractInstagramUrl(text: string): string | null {
  // Match Instagram URLs in text
  const patterns = [
    /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[\w-]+\/?/gi,
    /https?:\/\/(?:www\.)?instagr\.am\/(?:p|reel)\/[\w-]+\/?/gi,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

// Extract TikTok URL from shared text
export function extractTikTokUrl(text: string): string | null {
  const patterns = [
    /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.]+\/video\/\d+/gi,
    /https?:\/\/(?:vm|vt)\.tiktok\.com\/[\w]+\/?/gi,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}
