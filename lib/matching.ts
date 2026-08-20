// How well a recipe fits the person looking at it.
//
// Deliberately a small, legible calculation rather than anything clever. It
// only ever uses answers the user actually gave, and it refuses to produce a
// number when they have given none — a "92% match" for someone who skipped
// onboarding is a decoration, and the app has been burned by exactly that
// before ("POPULAR THIS WEEK" over the catalogue in catalogue order).
//
// Every component can be absent. The weights of the ones we can judge are
// renormalised, so a user who only set a time budget gets a score that means
// "fits your time budget" and not "fits 25% of a profile we invented".
//
// Allergens warn, they do not hide. Someone cooking for a household where one
// person cannot eat dairy still wants to see the lasagne — they may be
// cooking for themselves tonight, or swapping an ingredient. Silently
// removing recipes would leave them wondering why their cookbook looks empty,
// which is worse than a line of text that says what the problem is.
import type { Recipe } from '../data/recipes';
import type { Preferences } from './preferences';

export type Match = {
  /** 0–100. */
  score: number;
  /** Short, plain, at most a handful. "under 30 min", "high-protein". */
  reasons: string[];
  /** Allergen conflicts, named so they can be acted on. */
  warnings: string[];
};

export type MatchContext = {
  prefs: Preferences;
  /** Allergen ids from family members, merged with the user's own list. */
  familyAvoid?: string[];
};

// Ingredient words per allergen id, English and German. Matched on whole
// words, so "butter" flags dairy but "peanut butter" flags peanuts first
// through its own entry — both fire, and both are worth saying.
const ALLERGEN_WORDS: Record<string, string[]> = {
  peanuts: ['peanut', 'peanuts', 'erdnuss', 'erdnüsse', 'erdnussbutter'],
  'tree-nuts': [
    'almond', 'almonds', 'mandel', 'mandeln', 'walnut', 'walnuts', 'walnuss',
    'cashew', 'cashews', 'pecan', 'pistachio', 'pistazie', 'hazelnut', 'haselnuss',
    'nuts', 'nüsse',
  ],
  dairy: [
    'milk', 'milch', 'cheese', 'käse', 'butter', 'cream', 'sahne', 'yogurt',
    'yoghurt', 'joghurt', 'quark', 'parmesan', 'mozzarella', 'feta', 'cheddar',
    'ricotta', 'mascarpone', 'crème', 'buttermilk',
  ],
  eggs: ['egg', 'eggs', 'ei', 'eier', 'eigelb', 'eiweiß', 'mayonnaise', 'mayo'],
  shellfish: [
    'shrimp', 'shrimps', 'prawn', 'prawns', 'garnele', 'garnelen', 'crab', 'krabbe',
    'lobster', 'hummer', 'mussel', 'mussels', 'muscheln', 'oyster', 'oysters',
    'auster', 'austern', 'scallop', 'jakobsmuschel',
  ],
  fish: [
    'fish', 'fisch', 'salmon', 'lachs', 'tuna', 'thunfisch', 'cod', 'kabeljau',
    'anchovy', 'anchovies', 'sardine', 'trout', 'forelle', 'fish sauce',
  ],
  soy: ['soy', 'soya', 'soja', 'sojasauce', 'soy sauce', 'tofu', 'edamame', 'miso'],
  gluten: [
    'flour', 'mehl', 'bread', 'brot', 'pasta', 'spaghetti', 'nudeln', 'noodles',
    'wheat', 'weizen', 'barley', 'gerste', 'rye', 'roggen', 'couscous', 'breadcrumbs',
    'paniermehl', 'tortilla', 'baguette', 'cracker', 'crackers',
  ],
};

const ALLERGEN_LABELS: Record<string, string> = {
  peanuts: 'peanuts', 'tree-nuts': 'tree nuts', dairy: 'dairy', eggs: 'eggs',
  shellfish: 'shellfish', fish: 'fish', soy: 'soy', gluten: 'gluten',
};

function words(text: string): string {
  return ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()} `;
}

/** Which of these allergens the recipe's ingredients mention. */
export function allergensIn(recipe: Recipe, avoid: string[]): string[] {
  if (!avoid.length || !recipe.ingredients?.length) return [];
  const haystack = words(recipe.ingredients.map(i => i.name).join(' '));

  return avoid.filter(id =>
    (ALLERGEN_WORDS[id] ?? []).some(w => haystack.includes(` ${w} `)),
  );
}

/** Minutes the user is willing to spend, from the band they picked. */
function timeBudgetMinutes(band?: Preferences['timeBudget']): number | null {
  const map: Record<string, number> = { '15': 15, '20-30': 30, '30-45': 45, '45+': 90 };
  return band ? map[band] ?? null : null;
}

type Component = { weight: number; value: number; reason?: string };

/**
 * Score a recipe against the user's stated preferences.
 *
 * Returns null when there is nothing to judge it by, so the caller can show
 * no badge rather than a made-up one.
 */
export function matchRecipe(recipe: Recipe, ctx: MatchContext): Match | null {
  const { prefs } = ctx;
  const parts: Component[] = [];

  // ── Diets ────────────────────────────────────────────────────────────
  const diets = prefs.diets ?? [];
  if (diets.length) {
    const has = diets.filter(d => recipe.dietary?.includes(d as any));
    parts.push({
      weight: 35,
      value: has.length / diets.length,
      reason: has.length ? has.join(', ') : undefined,
    });
  }

  // ── Time ─────────────────────────────────────────────────────────────
  const budget = timeBudgetMinutes(prefs.timeBudget);
  const total = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);
  if (budget && total > 0) {
    const value = total <= budget ? 1 : total <= budget + 10 ? 0.6 : 0.2;
    parts.push({
      weight: 25,
      value,
      reason: total <= budget ? `${total} min, inside your time` : undefined,
    });
  }

  // ── Nutrition goals ──────────────────────────────────────────────────
  // Judged per meal, taken as a third of the daily target. Rough on purpose:
  // this ranks suggestions, it is not a nutrition plan.
  const goal = prefs.nutrition;
  const perServingProtein = recipe.nutrition?.protein;
  const perServingCalories = recipe.nutrition?.calories ?? (recipe.calories || undefined);

  if (goal?.protein && perServingProtein != null) {
    const share = perServingProtein / (goal.protein / 3);
    parts.push({
      weight: 25,
      value: Math.min(1, share),
      reason: share >= 0.9 ? `${Math.round(perServingProtein)}g protein` : undefined,
    });
  } else if (goal?.calories && perServingCalories != null) {
    const budgetPerMeal = goal.calories / 3;
    const value = perServingCalories <= budgetPerMeal ? 1
      : perServingCalories <= budgetPerMeal * 1.25 ? 0.6 : 0.25;
    parts.push({
      weight: 25,
      value,
      reason: value === 1 ? `${Math.round(perServingCalories)} cal, inside your target` : undefined,
    });
  }

  // ── Kids ─────────────────────────────────────────────────────────────
  if (prefs.hasKids) {
    parts.push({
      weight: 15,
      value: recipe.kidApproved ? 1 : 0.4,
      reason: recipe.kidApproved ? 'kid-approved' : undefined,
    });
  }

  if (!parts.length) return null;

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const score = Math.round(
    parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight * 100,
  );

  const avoid = [...new Set([...(prefs.avoid ?? []), ...(ctx.familyAvoid ?? [])])];
  const warnings = allergensIn(recipe, avoid).map(id => ALLERGEN_LABELS[id] ?? id);

  return {
    score,
    reasons: parts.map(p => p.reason).filter((r): r is string => !!r).slice(0, 2),
    warnings,
  };
}

/** "Contains dairy" / "Contains dairy and gluten". */
export function warningText(warnings: string[]): string | null {
  if (!warnings.length) return null;
  const list =
    warnings.length === 1
      ? warnings[0]
      : `${warnings.slice(0, -1).join(', ')} and ${warnings[warnings.length - 1]}`;
  return `Contains ${list}`;
}
