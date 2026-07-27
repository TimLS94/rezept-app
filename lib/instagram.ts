// Instagram content extraction service
// Uses RapidAPI Instagram Scraper for reliable extraction
// Fallback to oEmbed API (often blocked)

const RAPIDAPI_KEY = process.env.EXPO_PUBLIC_RAPIDAPI_KEY || '';
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
        'User-Agent': 'Mozilla/5.0 (compatible; FeedFamily/1.0)',
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
  if (!RAPIDAPI_KEY) {
    return { success: false, error: 'no-rapidapi-key' };
  }

  const shortcode = extractShortcode(url);
  if (!shortcode) {
    return { success: false, error: 'Could not extract post ID from URL' };
  }

  try {
    // Use Instagram Scraper Stable API - get_media_data_v2 endpoint
    const response = await fetch(
      `https://${RAPIDAPI_HOST}/get_media_data_v2.php?media_code=${shortcode}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return { success: false, error: 'Rate limit reached. Please try again later.' };
      }
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: 'API key invalid or expired.' };
      }
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    
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
  } catch (error: any) {
    console.error('RapidAPI Instagram error:', error);
    return { success: false, error: 'Network error fetching Instagram data.' };
  }
}

// Main fetch function - tries RapidAPI first, falls back to oEmbed
export async function fetchInstagramWithFallback(url: string): Promise<InstagramResult> {
  if (!isValidInstagramUrl(url)) {
    return { success: false, error: 'Invalid Instagram URL. Use a post, reel, or IGTV link.' };
  }

  // Try RapidAPI first (more reliable)
  if (RAPIDAPI_KEY) {
    console.log('Trying RapidAPI...');
    const rapidResult = await fetchInstagramViaRapidAPI(url);
    if (rapidResult.success) {
      console.log('✓ RapidAPI succeeded');
      return rapidResult;
    }
    console.warn('RapidAPI failed:', rapidResult.error);
  }

  // Fallback to oEmbed
  console.log('Trying oEmbed fallback...');
  const oembedResult = await fetchInstagramContent(url);
  if (oembedResult.success) {
    console.log('✓ oEmbed succeeded');
    return oembedResult;
  }

  // Both failed
  return { 
    success: false, 
    error: 'Could not fetch Instagram post. Try uploading a screenshot instead.' 
  };
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
