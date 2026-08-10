import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recipe, Ingredient } from '../data/recipes';
import { supabase } from './supabase';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

export const FRIDGE_SCAN_LIMIT = 3; // per rolling 7 days, enforced in the DB

export type FridgeQuota = {
  limit: number;
  used: number;
  remaining: number;
  resets_at: string | null;
};

// Scans left in the current window. Falls back to a permissive value on error
// so a hiccup in the quota lookup never locks a paying user out of the feature
// — the authoritative check happens in `recordFridgeScan` anyway.
export async function getFridgeQuota(): Promise<FridgeQuota> {
  const { data, error } = await supabase.rpc('fridge_scan_quota');
  if (error || !data) {
    return { limit: FRIDGE_SCAN_LIMIT, used: 0, remaining: FRIDGE_SCAN_LIMIT, resets_at: null };
  }
  return data as FridgeQuota;
}

// Books a completed scan against the quota. The DB re-checks the limit, so this
// is what actually enforces it; the client-side check is only there to avoid
// spending an AI call we already know will be rejected.
export async function recordFridgeScan(itemCount: number): Promise<FridgeQuota & { ok: boolean }> {
  const { data, error } = await supabase.rpc('record_fridge_scan', { p_item_count: itemCount });
  if (error || !data) {
    return { ok: true, limit: FRIDGE_SCAN_LIMIT, used: 0, remaining: FRIDGE_SCAN_LIMIT, resets_at: null };
  }
  return data as FridgeQuota & { ok: boolean };
}

// ── Keeping the last scan around ───────────────────────────────────────────
// A scan costs one of three weekly slots, so losing it just because you walked
// over to the shopping list would be the worst kind of waste. Only the detected
// items are stored, not the photos: the base64 runs to hundreds of KB and
// AsyncStorage is the wrong place for it, and the matches are recomputed on
// load anyway so they follow the current recipe catalogue.
const SCAN_KEY = 'fridge_scan_v1';

export type SavedScan = { items: string[]; at: number };

export async function saveScan(items: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SCAN_KEY, JSON.stringify({ items, at: Date.now() }));
  } catch {
    // best-effort: a scan that fails to persist is still usable right now
  }
}

export async function loadScan(): Promise<SavedScan | null> {
  try {
    const raw = await AsyncStorage.getItem(SCAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed as SavedScan : null;
  } catch {
    return null;
  }
}

export async function clearScan(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SCAN_KEY);
  } catch {
    // ignore
  }
}

export type FridgeScanResult =
  | { success: true; items: string[] }
  | { success: false; error: string };

export type RecipeMatch = {
  recipe: Recipe;
  have: Ingredient[];     // covered by what the camera saw (or a pantry staple)
  missing: Ingredient[];  // what you'd still have to buy
  coverage: number;       // 0–1, share of the ingredient list already covered
};

// Things nobody photographs their fridge for and everybody has anyway. Counting
// these as "missing" would drag every recipe down and bury the useful signal —
// a pasta dish shouldn't rank badly because the AI didn't spot the salt.
const STAPLES = new Set([
  'salt', 'pepper', 'water', 'oil', 'sugar', 'flour',
]);

// Words that describe an ingredient without identifying it. Dropping them lets
// "2 boneless skinless chicken breasts" meet a detected "chicken breast", and —
// more importantly — it means whatever survives actually names the ingredient,
// which is what makes the strict comparison in `namesMatch` safe.
const DESCRIPTORS = new Set([
  'fresh', 'frozen', 'canned', 'dried', 'chopped', 'diced', 'sliced', 'minced',
  'grated', 'shredded', 'crushed', 'ground', 'whole', 'large', 'small', 'medium',
  'boneless', 'skinless', 'organic', 'ripe', 'raw', 'cooked', 'extra', 'virgin',
  'unsalted', 'salted', 'low', 'fat', 'free', 'lean', 'plain', 'of', 'and', 'or',
  'a', 'the', 'to', 'taste', 'optional', 'finely', 'roughly', 'thinly',
  'baby', 'leaf', 'leave', 'sharp', 'mild', 'aged', 'heavy', 'light', 'semi',
  'skimmed', 'all', 'purpose', 'quality', 'best', 'good', 'store', 'bought',
]);

// Measurement noise that can ride along in a free-text ingredient name. The DB
// keeps amount and unit in their own fields, but imported recipes often don't.
const UNITS = new Set([
  'cup', 'tbsp', 'tsp', 'tablespoon', 'teaspoon', 'oz', 'ounce', 'lb', 'pound',
  'g', 'gram', 'kg', 'ml', 'l', 'liter', 'litre', 'clove', 'can', 'jar', 'pinch',
  'dash', 'slice', 'piece', 'bunch', 'handful', 'package', 'pkg', 'stick', 'tin',
]);

function singular(word: string): string {
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('oes') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('ss')) return word;
  if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
  return word;
}

// An ingredient name reduced to its identifying words.
export function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')   // "(optional)", "(about 200g)"
    .replace(/[^a-z\s]/g, ' ')    // digits, units, punctuation
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .filter(t => t.length > 1 && !DESCRIPTORS.has(t) && !UNITS.has(t));
}

// Once descriptors are stripped, every remaining token identifies the
// ingredient — so the comparison is exact rather than "is one contained in the
// other". Containment looks tempting but silently equates a qualifier with the
// thing it qualifies: a fridge holding "milk" would count "coconut milk" as
// covered, and "oil" would cover "olive oil". Being told you can cook something
// and finding out mid-recipe that you can't is worse than ranking it lower, so
// "chicken" not covering "chicken breast" is the trade we accept.
function namesMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length || !a.length) return false;
  return a.every(t => b.includes(t));
}

function isCovered(ingredient: Ingredient, detected: string[][]): boolean {
  const tokens = tokenize(ingredient.name);
  if (!tokens.length) return true;                       // nothing identifying left
  if (tokens.every(t => STAPLES.has(t))) return true;    // salt, pepper, water…
  return detected.some(d => namesMatch(tokens, d));
}

// Rank recipes by how little you'd have to buy. Primary sort is the raw number
// of missing items ("wenig kaufen"), with coverage as the tiebreaker so a short
// recipe missing one item beats a long one missing the same single item.
export function matchRecipes(recipes: Recipe[], detectedItems: string[]): RecipeMatch[] {
  const detected = detectedItems.map(tokenize).filter(t => t.length > 0);

  return recipes
    .filter(r => r.ingredients.length > 0)
    .map(recipe => {
      const have: Ingredient[] = [];
      const missing: Ingredient[] = [];
      for (const ing of recipe.ingredients) {
        (isCovered(ing, detected) ? have : missing).push(ing);
      }
      return {
        recipe,
        have,
        missing,
        coverage: have.length / recipe.ingredients.length,
      };
    })
    .sort((a, b) => a.missing.length - b.missing.length || b.coverage - a.coverage);
}

const FRIDGE_PROMPT = `You are looking at photos of the inside of someone's fridge, freezer or pantry.

List every distinct food ingredient you can identify with reasonable confidence.

Rules:
- Use short, generic English names ("milk", not "semi-skimmed organic milk 1L").
- Singular form ("egg", "carrot", "tomato").
- One entry per ingredient, no duplicates across the photos.
- Only actual food. Skip containers, brands, packaging text and anything you cannot identify.
- If you can see nothing edible, return an empty array.

Return ONLY a JSON array of strings, no markdown fences and no extra text.
Example: ["egg", "milk", "cheddar", "spinach", "chicken breast"]`;

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map(v => v.trim().toLowerCase())
    .filter(v => v.length > 1 && !seen.has(v) && seen.add(v));
}

function parseItems(text: string): string[] {
  // Models sometimes wrap JSON in ```json fences despite being told not to.
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  if (start === -1) return [];

  const end = cleaned.lastIndexOf(']');
  if (end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        return dedupe(parsed.filter((v): v is string => typeof v === 'string'));
      }
    } catch {
      // fall through to the salvage path
    }
  }

  // No closing bracket, or unparseable: the response was cut off. Rather than
  // discard a list that is mostly fine, take every complete "quoted" item and
  // drop the partial one at the end.
  const quoted = cleaned.slice(start).match(/"([^"\\]*)"/g);
  if (!quoted) return [];
  return dedupe(quoted.map(q => q.slice(1, -1)));
}

// Identify the ingredients visible across 1–3 fridge photos.
export async function detectFridgeItems(imagesBase64: string[]): Promise<FridgeScanResult> {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'no-key' };
  }
  if (!imagesBase64.length) {
    return { success: false, error: 'no-images' };
  }

  try {
    // All photos go into a single request so the model can de-duplicate across
    // them — the same milk carton shot twice should not become two ingredients.
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: FRIDGE_PROMPT },
              ...imagesBase64.map(data => ({
                inline_data: { mime_type: 'image/jpeg', data },
              })),
            ],
          }],
          // maxOutputTokens has to cover the model's reasoning as well as its
          // answer on 2.5 models. At 1000 a well-stocked fridge burned ~960 on
          // thinking alone and the JSON came back truncated mid-word, which
          // looked exactly like "nothing recognised". Generous is cheap here:
          // unused budget costs nothing, and a scan is ~0.3 cents either way.
          generationConfig: { temperature: 0.1, maxOutputTokens: 8000 },
        }),
      }
    );

    if (!response.ok) {
      console.warn('Gemini fridge scan error:', await response.text());
      return { success: false, error: 'gemini-failed' };
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text ?? '';
    const items = parseItems(text);

    if (!items.length) {
      // Distinguish "the model saw no food" from "the model ran out of room",
      // otherwise a truncated answer sends the user off to retake a photo that
      // was never the problem.
      return {
        success: false,
        error: candidate?.finishReason === 'MAX_TOKENS' ? 'response-truncated' : 'nothing-found',
      };
    }
    return { success: true, items };
  } catch (error) {
    console.warn('Gemini fridge scan error:', error);
    return { success: false, error: 'gemini-failed' };
  }
}
