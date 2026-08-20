import { callGateway, isQuotaError, QUOTA_MESSAGE } from './aiGateway';
// Instagram content extraction service
// Uses RapidAPI Instagram Scraper for reliable extraction
// Fallback to oEmbed API (often blocked)

const RAPIDAPI_HOST = 'instagram-scraper-stable-api.p.rapidapi.com';

export type InstagramContent = {
  caption: string;
  mediaType: 'image' | 'video' | 'carousel';
  thumbnailUrl?: string;
  videoUrl?: string;
  username?: string;
};

export type InstagramResult =
  | { success: true; content: InstagramContent }
  | { success: false; error: string };

// Validate Instagram URL format
export function isValidInstagramUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?instagram\.com\/p\/[\w-]+/,
    /^https?:\/\/(www\.)?instagram\.com\/reel\/[\w-]+/,
    /^https?:\/\/(www\.)?instagram\.com\/reels\/[\w-]+/,
    /^https?:\/\/(www\.)?instagram\.com\/tv\/[\w-]+/,
  ];
  return patterns.some(p => p.test(url));
}

// Extract shortcode from Instagram URL
export function extractShortcode(url: string): string | null {
  const match = url.match(/\/(p|reel|reels|tv)\/([\w-]+)/);
  return match ? match[2] : null;
}

// Fetch Instagram content using the oEmbed API (no auth required)
// This gives us basic metadata including the caption
export async function fetchInstagramContent(url: string): Promise<InstagramResult> {
  if (!isValidInstagramUrl(url)) {
    return { success: false, error: 'Invalid Instagram URL. Use a post, reel, or IGTV link.' };
  }

  try {
    // Use Instagram's oEmbed endpoint (public, no auth needed)
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(oembedUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; SpoonDrop/1.0)',
      },
    });
    
    // Check if we got HTML instead of JSON (Instagram blocking)
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      console.warn('Instagram returned HTML instead of JSON - API may be blocked');
      return { 
        success: false, 
        error: 'Instagram API blocked. Please paste the recipe text manually instead.' 
      };
    }

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Post not found. Make sure the post is public.' };
      }
      return { success: false, error: 'Could not fetch Instagram post. It may be private.' };
    }

    const text = await response.text();
    
    // Try to parse JSON, handle HTML responses gracefully
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.warn('Instagram response not JSON:', text.substring(0, 100));
      return { 
        success: false, 
        error: 'Instagram API unavailable. Please paste the recipe caption manually.' 
      };
    }
    
    // oEmbed returns: title (caption), author_name, thumbnail_url, html
    const caption = data.title || '';
    const username = data.author_name || '';
    const thumbnailUrl = data.thumbnail_url || '';
    
    // Determine media type from URL
    let mediaType: 'image' | 'video' | 'carousel' = 'image';
    if (url.includes('/reel/') || url.includes('/reels/') || url.includes('/tv/')) {
      mediaType = 'video';
    }

    if (!caption && !thumbnailUrl) {
      return { success: false, error: 'Could not extract content. The post may be private or restricted.' };
    }

    return {
      success: true,
      content: {
        caption,
        mediaType,
        thumbnailUrl,
        username,
      },
    };
  } catch (error: any) {
    console.error('Instagram fetch error:', error);
    return { success: false, error: 'Network error. Please check your connection.' };
  }
}

// RapidAPI Instagram Scraper Stable API - reliable extraction
export async function fetchInstagramViaRapidAPI(url: string): Promise<InstagramResult> {
  const shortcode = extractShortcode(url);
  if (!shortcode) {
    return { success: false, error: 'Could not extract post ID from URL' };
  }

  // The RapidAPI key lives in the gateway now. It is a paid subscription with a
  // shared quota, and it used to sit in the app bundle where anyone could spend
  // it.
  const res = await callGateway<{ data: any }>('instagram-post', { shortcode });
  if (!res.ok) {
    if (isQuotaError(res.error)) return { success: false, error: QUOTA_MESSAGE };
    if (res.error === 'rapidapi-429') {
      return {
        success: false,
        error:
          'Instagram lookups have hit their cap for now — that is our subscription to the ' +
          'service that reads posts, not your allowance. A screenshot of the post works and ' +
          'comes out of a different allowance.',
      };
    }
    if (res.error === 'no-key') {
      return { success: false, error: 'Instagram lookups are not configured. Use a screenshot instead.' };
    }
    return { success: false, error: `API error: ${res.error}` };
  }

  const data = res.data.data;

  
  // Check for API error response
  if (data.error || data.status === 'error') {
    return { success: false, error: data.message || 'API returned an error' };
  }
  
  // Extract data from Instagram Scraper Stable API response
  const mediaData = data.data || data;
  const caption = mediaData.caption?.text || mediaData.caption || mediaData.title || '';
  const username = mediaData.user?.username || mediaData.owner?.username || '';
  const thumbnailUrl = mediaData.display_url || 
                       mediaData.thumbnail_url || 
                       mediaData.image_versions2?.candidates?.[0]?.url || '';
  
  // Get video URL if it's a reel/video
  let videoUrl: string | undefined;
  let mediaType: 'image' | 'video' | 'carousel' = 'image';
  
  if (mediaData.is_video || mediaData.video_url || mediaData.video_versions) {
    mediaType = 'video';
    videoUrl = mediaData.video_url || mediaData.video_versions?.[0]?.url;
  } else if (mediaData.carousel_media || mediaData.edge_sidecar_to_children) {
    mediaType = 'carousel';
  }

  if (!caption && !thumbnailUrl) {
    return { success: false, error: 'Could not extract content from post.' };
  }

  console.log('✓ RapidAPI extracted:', { 
    caption: caption.substring(0, 50), 
    username, 
    mediaType,
    hasVideoUrl: !!videoUrl,
  });

  return {
    success: true,
    content: {
      caption,
      mediaType,
      thumbnailUrl,
      videoUrl,
      username,
    },
  };
}

// Main fetch function - tries RapidAPI first, falls back to oEmbed
export async function fetchInstagramWithFallback(url: string): Promise<InstagramResult> {
  if (!isValidInstagramUrl(url)) {
    return { success: false, error: 'Invalid Instagram URL. Use a post, reel, or IGTV link.' };
  }

  // Try RapidAPI first (more reliable). The client can no longer check whether
  // a key is configured — it doesn't have one — so it simply asks and falls
  // through to oEmbed if the gateway says no key, no quota, or no result.
  console.log('Trying RapidAPI...');
  const rapidResult = await fetchInstagramViaRapidAPI(url);
  if (rapidResult.success) {
    console.log('✓ RapidAPI succeeded');
    return rapidResult;
  }
  console.warn('RapidAPI failed:', rapidResult.error);

  // Fallback to oEmbed. Instagram blocks it more often than not — it answers
  // with an HTML page — so it is a long shot rather than a safety net.
  console.log('Trying oEmbed fallback...');
  const oembedResult = await fetchInstagramContent(url);
  if (oembedResult.success) {
    console.log('✓ oEmbed succeeded');
    return oembedResult;
  }

  // Both failed. Report what the first leg said rather than replacing it with
  // a general apology: "the lookup service is at its cap" and "this post is
  // private" are different problems, and only one of them is worth retrying.
  // Swallowing that detail is what made this look like a broken feature
  // instead of an exhausted subscription.
  return rapidResult;
}

// Build content string for AI extraction
export function buildExtractionContent(instagram: InstagramContent): string {
  let content = '';
  
  if (instagram.username) {
    content += `Creator: @${instagram.username}\n\n`;
  }
  
  if (instagram.caption) {
    content += `Caption:\n${instagram.caption}\n`;
  }
  
  return content;
}
