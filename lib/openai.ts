// AI integration for recipe extraction from social media
// Supports: Google Gemini (free), Groq (free), OpenAI (paid)
// Priority: Gemini → Groq → OpenAI

import { callGateway, isQuotaError, QUOTA_MESSAGE, type GeminiReply } from './aiGateway';


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
  if (isEmptyRecipe(recipe)) return { success: false, error: NO_RECIPE_ERROR };
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
  if (isEmptyRecipe(recipe)) {
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
