// Supabase Edge Function: Extract recipe from Instagram video
// Downloads video, sends to Gemini for analysis (FREE!)

// SECURITY: this function had no access check of any kind. The anon key is
// enough to reach an edge function, and that key ships inside the app bundle,
// so anyone who unzipped the IPA could call this — and every call spends a
// paid RapidAPI request plus a Gemini video analysis, billed to us.
//
// It is also superseded: the app now goes through supabase/functions/ai-gateway,
// which checks the user and spends a quota. Nothing in the app calls this any
// more. It is guarded rather than deleted because the deployed copy stays
// reachable until it is explicitly removed — see the deploy notes.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { encode as encodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RECIPE_PROMPT = `You are watching a cooking video. Extract the complete recipe.

Return JSON:
{
  "title": "Recipe name",
  "description": "Brief description",
  "prepTime": <minutes>,
  "cookTime": <minutes>,
  "servings": <number>,
  "calories": <estimated>,
  "difficulty": "Easy" | "Medium" | "Hard",
  "dietary": ["tags if applicable"],
  "ingredients": [{"name": "ingredient", "amount": 1, "unit": "cup", "category": "produce|meat|dairy|pantry|other"}],
  "steps": ["Step 1", "Step 2", ...],
  "stepTimers": [<seconds or null per step, same order and length as steps>],
  "cuisine": "<one word, e.g. Italian, Thai — null if the video does not say>",
  "equipment": ["<special equipment required, e.g. air fryer, blender>"]
}

Watch carefully for:
- All ingredients shown or mentioned
- Cooking techniques and times
- Temperatures and measurements

stepTimers: one entry per step, same order. A number only for a definite,
unattended wait ("simmer 10 minutes", "bake 25 minutes"); null for everything
else, including "until golden, about 5 minutes" — the cook is watching the pan
there, and a timer rings at the wrong moment. When unsure, null.

cuisine only when the video actually indicates one — do not infer it from a single
ingredient. equipment only for what the recipe cannot be made without and a kitchen
does not simply have (air fryer, blender, stand mixer); never pans, pots or an oven.

Be thorough - extract ALL ingredients, estimate amounts if not stated.
Return ONLY valid JSON, no markdown.`;

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Who is calling. The anon key is not an identity — it is public.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') || '';
  const asUser = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Spend a unit before doing the paid work, so a retry loop cannot run up a
  // bill. Counted per user per day, server-side.
  const admin = createClient(supabaseUrl, service);
  const { data: quota } = await admin.rpc('consume_ai_quota', { p_user: user.id, p_op: 'transcribe-video' });
  if (!quota?.ok) {
    return new Response(JSON.stringify({ error: quota?.error ?? 'quota_exceeded' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { instagramUrl } = await req.json();

    if (!instagramUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing instagramUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Get video URL from RapidAPI
    console.log('Fetching Instagram data...');
    const shortcode = instagramUrl.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1];
    
    if (!shortcode) {
      return new Response(
        JSON.stringify({ error: 'Invalid Instagram URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const igResponse = await fetch(
      `https://instagram-scraper-stable-api.p.rapidapi.com/get_media_data_v2.php?media_code=${shortcode}`,
      {
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'instagram-scraper-stable-api.p.rapidapi.com',
        },
      }
    );

    if (!igResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Instagram data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const igData = await igResponse.json();
    const mediaData = igData.data || igData;
    const videoUrl = mediaData.video_url || mediaData.video_versions?.[0]?.url;
    const caption = mediaData.caption?.text || mediaData.caption || '';
    const thumbnailUrl = mediaData.display_url || mediaData.thumbnail_url || '';

    // If we have a good caption, use Gemini to extract from text
    if (caption && caption.length > 50) {
      console.log('Using caption for extraction with Gemini...');
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `${RECIPE_PROMPT}\n\nExtract recipe from this caption:\n\n${caption}` }]
            }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
          }),
        }
      );

      const geminiData = await geminiResponse.json();
      const recipeText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const recipe = JSON.parse(recipeText.replace(/```json\n?|\n?```/g, '').trim());

      return new Response(
        JSON.stringify({ success: true, recipe, thumbnailUrl, source: 'caption' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No caption - need to analyze video with Gemini Vision
    if (!videoUrl) {
      return new Response(
        JSON.stringify({ error: 'No video URL found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Download video
    console.log('Downloading video for Gemini analysis...');
    const videoResponse = await fetch(videoUrl);

    // Supabase Edge Functions have a tight memory limit. Downloading a large
    // video AND base64-encoding it (+33%) AND copying it into a JSON body blows
    // past that limit (WORKER_RESOURCE_LIMIT). Refuse big videos UP FRONT via
    // Content-Length — before we ever load the bytes into memory.
    const MAX_VIDEO_BYTES = 8 * 1024 * 1024; // ~8 MB
    const contentLength = Number(videoResponse.headers.get('content-length') || '0');
    if (contentLength > MAX_VIDEO_BYTES) {
      console.warn(`Video too large: ${(contentLength / 1024 / 1024).toFixed(1)} MB`);
      return new Response(
        JSON.stringify({
          error: 'video-too-large',
          message: 'This reel is too long for on-server analysis. Import a screenshot of the recipe instead.',
        }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    // NOTE: never do btoa(String.fromCharCode(...bytes)) here — spreading a
    // multi-MB video as function args overflows the call stack.
    const videoBase64 = encodeBase64(videoBuffer);

    // Step 3: Send video to Gemini for analysis (audio + visual)
    console.log('Analyzing video with Gemini...');
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: RECIPE_PROMPT },
              {
                inline_data: {
                  mime_type: 'video/mp4',
                  data: videoBase64,
                },
              },
            ],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const error = await geminiResponse.json();
      console.error('Gemini error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to analyze video', details: error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiData = await geminiResponse.json();
    const recipeText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse JSON from response
    let recipe;
    try {
      recipe = JSON.parse(recipeText.replace(/```json\n?|\n?```/g, '').trim());
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Failed to parse recipe', raw: recipeText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✓ Recipe extracted successfully');
    return new Response(
      JSON.stringify({ success: true, recipe, thumbnailUrl, source: 'video' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
