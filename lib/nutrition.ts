// Nutrition on a recipe, and whether anyone actually worked it out.
//
// The `estimated` flag is not decoration. A guess shown as a fact is the kind
// of claim the FTC treats as deceptive, and it is dishonest to someone
// deciding what to eat. Anything the model produced carries the flag; anything
// a person typed does not.
import { callGateway, isQuotaError, type GeminiReply } from './aiGateway';
import { Ingredient } from '../data/recipes';

export type Nutrition = {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  /** True when these came from the model rather than from a person. */
  estimated?: boolean;
  estimated_at?: string;
};

export type EstimateResult =
  | { ok: true; nutrition: Nutrition }
  | { ok: false; error: string };

/** Ask the gateway for per-serving figures from the ingredient list. */
export async function estimateNutrition(
  ingredients: Ingredient[],
  servings: number,
): Promise<EstimateResult> {
  const usable = ingredients.filter(i => i?.name?.trim());
  if (!usable.length) return { ok: false, error: 'no-ingredients' };

  const res = await callGateway<GeminiReply>('estimate-nutrition', {
    ingredients: usable,
    servings: Math.max(1, servings || 1),
  });

  if (!res.ok) {
    return { ok: false, error: isQuotaError(res.error) ? 'quota' : res.error };
  }

  const raw = (res.data.text ?? '').trim();
  if (!raw) {
    return { ok: false, error: res.data.finishReason === 'MAX_TOKENS' ? 'truncated' : 'empty' };
  }

  try {
    // Take the first {...} in the reply rather than requiring the whole thing
    // to be JSON: the model sometimes prefixes a sentence, and failing on that
    // throws away a perfectly good answer.
    const match = raw.replace(/```json\n?|\n?```/g, '').match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: 'no-json' };
    const parsed = JSON.parse(match[0]);
    const int = (v: unknown) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const nutrition: Nutrition = {
      calories: int(parsed.calories),
      protein: int(parsed.protein),
      carbs: int(parsed.carbs),
      fat: int(parsed.fat),
      estimated: true,
      estimated_at: new Date().toISOString(),
    };
    // A reply with no usable number is a failure, not an empty estimate.
    if (nutrition.calories == null && nutrition.protein == null) {
      return { ok: false, error: 'unreadable' };
    }
    return { ok: true, nutrition };
  } catch {
    return { ok: false, error: 'unreadable' };
  }
}

/**
 * A calorie figure with its provenance attached, short enough for a card.
 *
 * The detail screens label estimates properly — a badge and a sentence. The
 * cards did not: "520 cal" on a swipe card or a cookbook tile reads as a
 * measurement, and for an imported recipe it is a model's guess. US law does
 * not require nutrition labelling here (the FDA rules cover packaged food and
 * chains of twenty or more), but presenting a guess as a fact is exactly the
 * kind of representation the FTC treats as deceptive — and it is dishonest to
 * someone deciding what to eat.
 *
 * A tilde is the whole fix. It costs one character and it is understood.
 */
export function caloriesLabel(
  recipe: { calories?: number; nutrition?: { calories?: number; estimated?: boolean } },
): string | null {
  const value = recipe.nutrition?.calories ?? (recipe.calories || undefined);
  if (!value) return null;
  return `${recipe.nutrition?.estimated ? '~' : ''}${Math.round(value)} cal`;
}

/** Shown wherever estimated figures are displayed. */
export const ESTIMATE_NOTE =
  'Estimated from the ingredients — treat it as a guide, not a measurement.';
