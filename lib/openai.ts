// AI integration for recipe extraction from social media
// Supports: Google Gemini (free), Groq (free), OpenAI (paid)
// Priority: Gemini → Groq → OpenAI

import { callGateway, isQuotaError, isCancelled, QUOTA_MESSAGE, type GeminiReply } from './aiGateway';


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
  /** Seconds per step, index-aligned with `steps`; null where a timer would
   *  not help. A separate array rather than turning `steps` into objects:
   *  the gateway answers every build at once, and older bundles in TestFlight
   *  parse `steps` as plain strings. A new sibling field they never read is
   *  harmless; a changed shape would break all of them at once. */
  stepTimers?: (number | null)[];
  /** Where the dish is from, when the source says so. The model is told not
   *  to infer one from a single ingredient: soy sauce does not make a dish
   *  Japanese, and a wrong label is worse than none. */
  cuisines?: string[] | null;
  /** Only what the recipe cannot be made without and a kitchen does not
   *  simply have. Pans and pots would be noise. */
  equipment?: string[];
  /** Not produced by the extraction — the recipe prompt returns calories
   *  only. It exists so the review step can hold macros the person enters
   *  or estimates before publishing, instead of making them republish. */
  nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number;
                estimated?: boolean; estimated_at?: string };
  /** Total ingredient cost, if the person reviewing the import fills one in.
   *  The model is never asked to guess a price — it cannot know what things
   *  cost where you shop, and a made-up figure would end up on the card as a
   *  fact. */
  cost?: number;
};

export type ExtractionResult =
  | { success: true; recipe: ExtractedRecipe }
  | { success: false; error: string };


// Parse JSON from AI response (handles markdown code blocks).
//
// Returns null instead of throwing. A model that answers with an apology, a
// half-finished object or nothing at all is an ordinary outcome, not an
// exception — and this threw straight through three call sites into a screen
// with no try/catch anywhere, which left the import spinning forever. An
// unparseable answer means the same as an empty recipe, and is handled the
// same way.
function parseRecipeJson(text: string): ExtractedRecipe | null {
  let jsonStr = text ?? '';
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }
  // Some answers wrap the object in a sentence. Take the outermost braces.
  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(jsonStr.slice(start, end + 1)) as ExtractedRecipe;
  } catch {
    console.warn('Recipe JSON did not parse:', jsonStr.slice(0, 200));
    return null;
  }
}

// When the model gets no usable content it politely returns an empty template
// (e.g. title "No Recipe Provided", 0 ingredients, 0 steps). That must count as
// a FAILURE, not a successful extraction — otherwise we save blank recipes.
function isEmptyRecipe(recipe: ExtractedRecipe | undefined | null): boolean {
  if (!recipe) return true;   // also covers "the answer would not parse"
  const noIngredients = !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0;
  const noSteps = !Array.isArray(recipe.steps) || recipe.steps.length === 0;
  return noIngredients && noSteps;
}

// Says only what was actually checked. The old wording claimed "the caption
// was empty and the video had nothing readable" from a code path that had
// looked at neither — it saw one model answer come back blank. Telling
// someone their caption is empty while they are looking at a caption full of
// ingredients is how a working feature loses its credibility.
const NO_RECIPE_ERROR =
  "The model could not find a recipe in what it was given. A screenshot of the recipe works well — pick Gallery or Camera above.";

// Google Gemini (FREE - 15 RPM)

// Groq with Llama 3 (FREE - 30 RPM)

// OpenAI GPT-4o (PAID - best quality)

// Text in, structured recipe out. The provider chain (Gemini, then Groq) now
// runs inside the gateway — the phone holds no keys, so it cannot choose a
// provider and does not need to know which one answered.
export async function extractRecipeWithAI(content: string): Promise<ExtractionResult> {
  const res = await callGateway<GeminiReply>('recipe-from-text', { content });

  if (!res.ok) {
    if (isQuotaError(res.error)) return { success: false, error: QUOTA_MESSAGE };
    return {
      success: false,
      error: 'All AI providers failed (rate limit or network). Please try again later.',
    };
  }

  const recipe = parseRecipeJson(res.data.text ?? '');
  // A model answered but found nothing usable in the content. That is a
  // different message from "the service is down", and the user can act on it.
  if (!recipe || isEmptyRecipe(recipe)) return { success: false, error: NO_RECIPE_ERROR };
  return { success: true, recipe };
}

// Whisper-via-OpenAI used to live here. No OPENAI key was ever configured, so
// the function always returned null; keeping a dead branch that also wanted an
// API key in the bundle was worse than deleting it. Reel audio goes through
// transcribeVideoWithGroq below, which the gateway now performs.
export async function transcribeAudio(): Promise<string | null> {
  return null;
}

// Vision AI: Extract recipe from screenshot image(s)
// Uses Gemini Vision (free) with fallback to OpenAI GPT-4o Vision

// Extract recipe from image using Gemini Vision (FREE)

// Extract recipe from image using OpenAI GPT-4o Vision (PAID)

// Screenshot in, structured recipe out. Vision runs in the gateway; the old
// OpenAI Vision fallback is gone with the rest of the never-configured OpenAI
// path.
export async function extractRecipeFromImage(imageBase64: string): Promise<ExtractionResult> {
  return extractRecipeFromImages([imageBase64]);
}


// Transcribe a reel's spoken audio. The download and the Whisper call both
// happen in the gateway now — this used to run on the phone specifically
// because the Groq key was already there, which is exactly the problem.
export async function transcribeVideoWithGroq(videoUrl: string): Promise<string | null> {
  const res = await callGateway<{ text: string }>('transcribe-video', { videoUrl });
  if (!res.ok) {
    // Every caller has a fallback (caption text, screenshot import), so a
    // failure here is a null, not an error to show.
    console.warn('Transcription unavailable:', res.error);
    return null;
  }
  return res.data.text?.trim() || null;
}

/**
 * The reel itself: frames and narration together.
 *
 * Transcription only ever heard the audio, which misses what people actually
 * post — the ingredients and steps written on screen while the voice talks
 * around them. This hands the video to a model that reads both.
 *
 * Pulling frames out on the phone would need a native module, and pulling
 * them out on the server would need ffmpeg, which the gateway's runtime does
 * not have. Neither is necessary if the model can watch the video.
 */
export async function extractRecipeFromVideo(
  videoUrl: string,
  caption?: string,
  signal?: AbortSignal,
): Promise<ExtractionResult> {
  const res = await callGateway<GeminiReply>('recipe-from-video', { videoUrl, caption }, signal);

  if (!res.ok) {
    if (isCancelled(res.error)) return { success: false, error: 'cancelled' };
    if (isQuotaError(res.error)) return { success: false, error: QUOTA_MESSAGE };
    if (res.error === 'timeout') {
      return {
        success: false,
        error:
          'Watching that reel took longer than we allow for it. Long videos are the usual ' +
          'reason. A screenshot of the recipe works and is instant.',
      };
    }
    if (res.error === 'too-large') {
      return {
        success: false,
        error: 'That reel is too long for us to watch in one go. A screenshot of the recipe works.',
      };
    }
    console.warn('Video extraction failed:', res.error);
    return { success: false, error: 'Could not read that video. A screenshot of the recipe works.' };
  }

  const recipe = parseRecipeJson(res.data.text ?? '');
  if (!recipe || isEmptyRecipe(recipe)) {
    return {
      success: false,
      error:
        res.data.finishReason === 'MAX_TOKENS'
          ? 'That reel had more in it than we could work through in one go. Try a screenshot of the recipe.'
          : NO_RECIPE_ERROR,
    };
  }
  return { success: true, recipe };
}

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

  // All screenshots go up in one request. The old code called the model once
  // per image and merged the answers by string-matching ingredient names,
  // which split a recipe that ran across two screenshots into two half
  // recipes. One call also spends one unit of quota instead of N.
  const res = await callGateway<GeminiReply>('recipe-from-images', { images: imagesBase64 });

  if (!res.ok) {
    if (isQuotaError(res.error)) return { success: false, error: QUOTA_MESSAGE };
    return {
      success: false,
      error: 'Could not extract recipe from image (rate limit or network). Try again in a moment.',
    };
  }

  const recipe = parseRecipeJson(res.data.text ?? '');
  if (!recipe || isEmptyRecipe(recipe)) {
    return {
      success: false,
      error:
        res.data.finishReason === 'MAX_TOKENS'
          ? 'That screenshot had more than we could read in one go. Try cropping to just the recipe.'
          : 'No recipe found in this screenshot. Make sure the ingredients and steps are visible, then try again.',
    };
  }
  return { success: true, recipe };
}
