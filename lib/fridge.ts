import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Recipe, Ingredient } from '../data/recipes';
import { supabase } from './supabase';
import { callGateway, isQuotaError, type GeminiReply } from './aiGateway';


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
// Roughly what an edge function will accept once JSON-encoded, with room to
// spare. Base64 is already a third larger than the file it encodes.
const MAX_PAYLOAD_BYTES = 4_000_000;

export async function detectFridgeItems(imagesBase64: string[]): Promise<FridgeScanResult> {
  if (!imagesBase64.length) {
    return { success: false, error: 'no-images' };
  }

  const size = imagesBase64.reduce((n, b) => n + b.length, 0);
  if (size > MAX_PAYLOAD_BYTES) {
    return { success: false, error: 'photos-too-large' };
  }

  // All photos go into a single request so the model can de-duplicate across
  // them — the same milk carton shot twice should not become two ingredients.
  // The prompt and the token budget live in the gateway now; the phone holds
  // no Gemini key.
  const res = await callGateway<GeminiReply>('fridge-items', { images: imagesBase64 });

  if (!res.ok) {
    if (isQuotaError(res.error)) return { success: false, error: 'quota-exceeded' };
    // Pass the real reason through. Collapsing every failure into
    // "gemini-failed" meant a payload that was too large, an expired session
    // and an actual model error all produced the same "please try again" —
    // which is useless advice for two of the three.
    return { success: false, error: res.error || 'gemini-failed' };
  }

  const items = parseItems(res.data.text ?? '');
  if (!items.length) {
    // Distinguish "the model saw no food" from "the model ran out of room",
    // otherwise a truncated answer sends the user off to retake a photo that
    // was never the problem.
    return {
      success: false,
      error: res.data.finishReason === 'MAX_TOKENS' ? 'response-truncated' : 'nothing-found',
    };
  }
  return { success: true, items };
}
