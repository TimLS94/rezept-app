// AI integration for recipe extraction from social media
// Supports: Google Gemini (free), Groq (free), OpenAI (paid)
// Priority: Gemini → Groq → OpenAI

import * as FileSystem from 'expo-file-system/legacy';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY || '';
const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';

export type ExtractedRecipe = {
  title: string;
  description: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  calories: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  dietary: string[];
  ingredients: {
    name: string;
    amount: number;
    unit: string;
    category: 'produce' | 'meat' | 'dairy' | 'pantry' | 'bakery' | 'frozen' | 'other';
  }[];
  steps: string[];
};

export type ExtractionResult =
  | { success: true; recipe: ExtractedRecipe }
  | { success: false; error: string };

const RECIPE_EXTRACTION_PROMPT = `You are a recipe extraction assistant. Extract a structured recipe from the provided content.

Return a JSON object with this exact structure:
{
  "title": "Recipe name",
  "description": "Brief appetizing description (1-2 sentences)",
  "prepTime": <number in minutes>,
  "cookTime": <number in minutes>,
  "servings": <number>,
  "calories": <estimated calories per serving>,
  "difficulty": "Easy" | "Medium" | "Hard",
  "dietary": ["healthy", "high-protein", "gluten-free", "vegetarian", "vegan", "dairy-free"],
  "ingredients": [
    {
      "name": "Ingredient name",
      "amount": <number>,
      "unit": "cup/tbsp/tsp/lb/oz/g/ml/piece/etc",
      "category": "produce" | "meat" | "dairy" | "pantry" | "bakery" | "frozen" | "other"
    }
  ],
  "steps": ["Step 1 instruction", "Step 2 instruction", ...]
}

Rules:
- Extract ALL ingredients mentioned, even if amounts are vague (estimate reasonable amounts)
- Convert spoken measurements to standard units
- Categorize ingredients correctly (meat includes fish/seafood)
- Break down instructions into clear, numbered steps
- Estimate prep/cook times if not explicitly stated
- Only include dietary tags that actually apply
- Return ONLY valid JSON, no markdown or extra text`;

// Parse JSON from AI response (handles markdown code blocks)
function parseRecipeJson(text: string): ExtractedRecipe {
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }
  return JSON.parse(jsonStr.trim()) as ExtractedRecipe;
}

// When the model gets no usable content it politely returns an empty template
// (e.g. title "No Recipe Provided", 0 ingredients, 0 steps). That must count as
// a FAILURE, not a successful extraction — otherwise we save blank recipes.
function isEmptyRecipe(recipe: ExtractedRecipe | undefined | null): boolean {
  if (!recipe) return true;
  const noIngredients = !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0;
  const noSteps = !Array.isArray(recipe.steps) || recipe.steps.length === 0;
  return noIngredients && noSteps;
}

const NO_RECIPE_ERROR =
  'No recipe found in this post. The caption was empty and the video had nothing readable — try importing a screenshot of the recipe instead.';

// Google Gemini (FREE - 15 RPM)
async function extractWithGemini(content: string): Promise<ExtractionResult> {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'no-key' };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${RECIPE_EXTRACTION_PROMPT}\n\nExtract a recipe from this content:\n\n${content}`
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.warn('Gemini error:', error);
      return { success: false, error: 'gemini-failed' };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const recipe = parseRecipeJson(text);
    return { success: true, recipe };
  } catch (error: any) {
    console.warn('Gemini extraction error:', error);
    return { success: false, error: 'gemini-failed' };
  }
}

// Groq with Llama 3 (FREE - 30 RPM)
async function extractWithGroq(content: string): Promise<ExtractionResult> {
  if (!GROQ_API_KEY) {
    return { success: false, error: 'no-key' };
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: RECIPE_EXTRACTION_PROMPT },
          { role: 'user', content: `Extract a recipe from this content:\n\n${content}` },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.warn('Groq error:', error);
      return { success: false, error: 'groq-failed' };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const recipe = parseRecipeJson(text);
    return { success: true, recipe };
  } catch (error: any) {
    console.warn('Groq extraction error:', error);
    return { success: false, error: 'groq-failed' };
  }
}

// OpenAI GPT-4o (PAID - best quality)
async function extractWithOpenAI(content: string): Promise<ExtractionResult> {
  if (!OPENAI_API_KEY) {
    return { success: false, error: 'no-key' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: RECIPE_EXTRACTION_PROMPT },
          { role: 'user', content: `Extract a recipe from this content:\n\n${content}` },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error?.message || 'OpenAI API error' };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const recipe = parseRecipeJson(text);
    return { success: true, recipe };
  } catch (error: any) {
    console.error('OpenAI extraction error:', error);
    return { success: false, error: error.message || 'Failed to extract recipe' };
  }
}

// Main extraction function with fallback chain: Gemini → Groq → OpenAI
export async function extractRecipeWithAI(content: string): Promise<ExtractionResult> {
  let sawEmpty = false;

  // Try Gemini first (free)
  console.log('Trying Gemini...');
  let result = await extractWithGemini(content);
  if (result.success && !isEmptyRecipe(result.recipe)) {
    console.log('✓ Gemini succeeded');
    return result;
  }
  if (result.success) sawEmpty = true;

  // Fallback to Groq (free)
  console.log('Trying Groq...');
  result = await extractWithGroq(content);
  if (result.success && !isEmptyRecipe(result.recipe)) {
    console.log('✓ Groq succeeded');
    return result;
  }
  if (result.success) sawEmpty = true;

  // Fallback to OpenAI (paid)
  console.log('Trying OpenAI...');
  result = await extractWithOpenAI(content);
  if (result.success && !isEmptyRecipe(result.recipe)) {
    console.log('✓ OpenAI succeeded');
    return result;
  }
  if (result.success) sawEmpty = true;

  // A provider replied but found no recipe in the content.
  if (sawEmpty) {
    return { success: false, error: NO_RECIPE_ERROR };
  }

  // No provider succeeded at all (bad/missing keys, quota, network).
  if (!GEMINI_API_KEY && !GROQ_API_KEY && !OPENAI_API_KEY) {
    return { success: false, error: 'No AI API key configured. Add EXPO_PUBLIC_GEMINI_API_KEY or EXPO_PUBLIC_GROQ_API_KEY to your .env file.' };
  }

  return { success: false, error: 'All AI providers failed (rate limit or network). Please try again later.' };
}

// Transcribe audio using Whisper API
export async function transcribeAudio(audioBase64: string, mimeType: string = 'audio/mp4'): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  try {
    // Convert base64 to blob
    const byteCharacters = atob(audioBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    const formData = new FormData();
    formData.append('file', blob, 'audio.mp4');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.text || null;
  } catch (error) {
    console.error('Transcription error:', error);
    return null;
  }
}

// Vision AI: Extract recipe from screenshot image(s)
// Uses Gemini Vision (free) with fallback to OpenAI GPT-4o Vision
const VISION_PROMPT = `Analyze this image of a recipe (screenshot from Instagram, TikTok, or similar).

Extract ALL recipe information you can see:
- Recipe title/name
- Ingredients with amounts
- Cooking steps/instructions
- Any timing information (prep time, cook time)
- Serving size if visible

Return a JSON object with this exact structure:
{
  "title": "Recipe name",
  "description": "Brief appetizing description (1-2 sentences)",
  "prepTime": <number in minutes, estimate if not shown>,
  "cookTime": <number in minutes, estimate if not shown>,
  "servings": <number, default 4 if not shown>,
  "calories": <estimated calories per serving>,
  "difficulty": "Easy" | "Medium" | "Hard",
  "dietary": ["healthy", "high-protein", "gluten-free", "vegetarian", "vegan", "dairy-free"],
  "ingredients": [
    {
      "name": "Ingredient name",
      "amount": <number>,
      "unit": "cup/tbsp/tsp/lb/oz/g/ml/piece/etc",
      "category": "produce" | "meat" | "dairy" | "pantry" | "bakery" | "frozen" | "other"
    }
  ],
  "steps": ["Step 1 instruction", "Step 2 instruction", ...]
}

If the image shows a video frame with food being prepared, describe what you see and estimate the recipe.
Return ONLY valid JSON, no markdown or extra text.`;

// Extract recipe from image using Gemini Vision (FREE)
async function extractFromImageWithGemini(imageBase64: string): Promise<ExtractionResult> {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'no-key' };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: VISION_PROMPT },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
            ],
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.warn('Gemini Vision error:', error);
      return { success: false, error: 'gemini-vision-failed' };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const recipe = parseRecipeJson(text);
    return { success: true, recipe };
  } catch (error: any) {
    console.warn('Gemini Vision extraction error:', error);
    return { success: false, error: 'gemini-vision-failed' };
  }
}

// Extract recipe from image using OpenAI GPT-4o Vision (PAID)
async function extractFromImageWithOpenAI(imageBase64: string): Promise<ExtractionResult> {
  if (!OPENAI_API_KEY) {
    return { success: false, error: 'no-key' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.warn('OpenAI Vision error:', error);
      return { success: false, error: 'openai-vision-failed' };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const recipe = parseRecipeJson(text);
    return { success: true, recipe };
  } catch (error: any) {
    console.warn('OpenAI Vision extraction error:', error);
    return { success: false, error: 'openai-vision-failed' };
  }
}

// Main function to extract recipe from screenshot(s)
export async function extractRecipeFromImage(imageBase64: string): Promise<ExtractionResult> {
  let sawEmpty = false;

  // Try Gemini Vision first (free)
  console.log('Trying Gemini Vision...');
  let result = await extractFromImageWithGemini(imageBase64);
  if (result.success && !isEmptyRecipe(result.recipe)) {
    console.log('✓ Gemini Vision succeeded');
    return result;
  }
  if (result.success) sawEmpty = true;

  // Fallback to OpenAI Vision (paid)
  console.log('Trying OpenAI Vision...');
  result = await extractFromImageWithOpenAI(imageBase64);
  if (result.success && !isEmptyRecipe(result.recipe)) {
    console.log('✓ OpenAI Vision succeeded');
    return result;
  }
  if (result.success) sawEmpty = true;

  // Vision replied but couldn't read a recipe in the image.
  if (sawEmpty) {
    return { success: false, error: 'No recipe found in this screenshot. Make sure the ingredients and steps are visible, then try again.' };
  }

  // All failed
  if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
    return { success: false, error: 'No Vision AI key configured. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env file.' };
  }

  return { success: false, error: 'Could not extract recipe from image (rate limit or network). Try again in a moment.' };
}

// Extract recipe from Instagram URL via Supabase Edge Function
// This downloads the video, transcribes audio with Whisper, and extracts recipe
export async function extractRecipeFromInstagramUrl(instagramUrl: string): Promise<ExtractionResult> {
  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!SUPABASE_URL) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    console.log('Calling backend to extract video recipe...');
    
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/extract-video-recipe`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ instagramUrl }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.warn('Backend extraction error:', error);
      return { success: false, error: error.error || 'Backend extraction failed' };
    }

    const data = await response.json();

    if (data.success && data.recipe) {
      if (isEmptyRecipe(data.recipe)) {
        console.warn('Backend returned an empty recipe');
        return { success: false, error: NO_RECIPE_ERROR };
      }
      console.log('✓ Backend video extraction succeeded, source:', data.source);
      return { success: true, recipe: data.recipe };
    }

    return { success: false, error: data.error || 'Unknown error' };
  } catch (error: any) {
    console.warn('Backend extraction error:', error);
    return { success: false, error: 'Network error calling backend' };
  }
}

// Transcribe a reel's spoken audio with Groq Whisper (free, we already have the
// key). Runs on the phone, so it sidesteps the Supabase edge-function memory
// limit that breaks on-server video analysis. Whisper reads the audio track
// straight out of the mp4 — no separate audio extraction needed. Limit: 25 MB.
const GROQ_TRANSCRIBE_LIMIT = 25 * 1024 * 1024;

export async function transcribeVideoWithGroq(videoUrl: string): Promise<string | null> {
  if (!GROQ_API_KEY) {
    console.warn('No Groq key — cannot transcribe audio');
    return null;
  }

  // React Native can't build a Blob from an ArrayBuffer, so download the reel to
  // a local temp file and let FormData stream it by uri (also keeps it off the
  // JS heap). Whisper reads the audio track straight out of the mp4.
  const localUri = `${FileSystem.cacheDirectory}reel-${Date.now()}.mp4`;

  try {
    console.log('Downloading reel for transcription...');
    const dl = await FileSystem.downloadAsync(videoUrl, localUri);
    if (dl.status !== 200) {
      console.warn('Could not download reel:', dl.status);
      return null;
    }

    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists && typeof info.size === 'number' && info.size > GROQ_TRANSCRIBE_LIMIT) {
      console.warn(`Reel too large for transcription: ${(info.size / 1024 / 1024).toFixed(1)} MB`);
      return null;
    }

    const form = new FormData();
    // React Native uploads a local file when given { uri, name, type }.
    form.append('file', { uri: localUri, name: 'reel.mp4', type: 'video/mp4' } as any);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'json');
    // No language field → Whisper auto-detects (reels may be German or English).

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, // let RN set the multipart boundary
      body: form,
    });

    if (!res.ok) {
      console.warn('Groq transcription failed:', res.status, (await res.text()).slice(0, 200));
      return null;
    }

    const data = await res.json();
    const text: string = data.text || '';
    console.log('✓ Transcribed', text.length, 'chars');
    return text.trim() || null;
  } catch (error) {
    console.warn('Transcription error:', error);
    return null;
  } finally {
    // Best-effort cleanup of the temp file.
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch {
      // ignore
    }
  }
}

// Full audio path: transcribe the reel, then extract a recipe from the transcript.
export async function extractRecipeFromVideoAudio(
  videoUrl: string,
  caption?: string,
): Promise<ExtractionResult> {
  const transcript = await transcribeVideoWithGroq(videoUrl);

  if (!transcript || transcript.length < 20) {
    return { success: false, error: 'No spoken recipe found in this reel’s audio.' };
  }

  // Combine transcript with any caption text for the best extraction.
  const content = [caption?.trim(), `Spoken narration transcript:\n${transcript}`]
    .filter(Boolean)
    .join('\n\n');

  return extractRecipeWithAI(content);
}

// Extract from multiple images (combine results)
export async function extractRecipeFromImages(imagesBase64: string[]): Promise<ExtractionResult> {
  if (imagesBase64.length === 0) {
    return { success: false, error: 'No images provided' };
  }

  // For single image, use direct extraction
  if (imagesBase64.length === 1) {
    return extractRecipeFromImage(imagesBase64[0]);
  }

  // For multiple images, extract from each and combine
  // (useful when recipe spans multiple screenshots)
  const results: ExtractedRecipe[] = [];
  
  for (const img of imagesBase64) {
    const result = await extractRecipeFromImage(img);
    if (result.success) {
      results.push(result.recipe);
    }
  }

  if (results.length === 0) {
    return { success: false, error: 'Could not extract recipe from any image' };
  }

  // Combine results - use first recipe as base, merge ingredients/steps
  const combined = results[0];
  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    // Add unique ingredients
    for (const ing of r.ingredients) {
      if (!combined.ingredients.some(ci => ci.name.toLowerCase() === ing.name.toLowerCase())) {
        combined.ingredients.push(ing);
      }
    }
    // Add unique steps
    for (const step of r.steps) {
      if (!combined.steps.includes(step)) {
        combined.steps.push(step);
      }
    }
  }

  return { success: true, recipe: combined };
}
