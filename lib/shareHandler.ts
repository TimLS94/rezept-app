// Handle incoming shared URLs from Instagram/TikTok
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { isValidInstagramUrl } from './instagram';

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

// Handle incoming URL (from deep link or share)
export function handleIncomingUrl(url: string): void {
  console.log('Incoming URL:', url);

  // Check if it's an Instagram URL
  const igUrl = extractInstagramUrl(url);
  if (igUrl) {
    // Navigate to import screen with the URL pre-filled
    router.push({
      pathname: '/cookbook/import',
      params: { sharedUrl: igUrl },
    });
    return;
  }

  // Check if it's a TikTok URL
  const ttUrl = extractTikTokUrl(url);
  if (ttUrl) {
    router.push({
      pathname: '/cookbook/import',
      params: { sharedUrl: ttUrl },
    });
    return;
  }

  // Check if it's our own deep link
  if (url.startsWith('feedfamily://')) {
    const parsed = Linking.parse(url);
    if (parsed.path) {
      router.push(parsed.path as any);
    }
  }
}

// Handle shared text (from Android SEND intent)
export function handleSharedText(text: string): void {
  console.log('Shared text:', text);

  // Try to extract a URL from the text
  const igUrl = extractInstagramUrl(text);
  const ttUrl = extractTikTokUrl(text);
  const url = igUrl || ttUrl;

  if (url) {
    router.push({
      pathname: '/cookbook/import',
      params: { sharedUrl: url },
    });
  } else {
    // No URL found, maybe it's recipe text directly
    router.push({
      pathname: '/cookbook/import',
      params: { sharedText: text },
    });
  }
}

// Setup URL listener
export function setupUrlListener(): () => void {
  // Handle URL that opened the app
  Linking.getInitialURL().then((url) => {
    if (url) {
      // Small delay to ensure app is ready
      setTimeout(() => handleIncomingUrl(url), 500);
    }
  });

  // Listen for URLs while app is open
  const subscription = Linking.addEventListener('url', (event) => {
    handleIncomingUrl(event.url);
  });

  return () => {
    subscription.remove();
  };
}
