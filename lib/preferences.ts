// What the user told us during onboarding.
//
// Stored as one jsonb blob on their profile rather than as columns: this is a
// description of taste, and the set of questions worth asking will keep
// moving. Everything is optional — every step can be skipped, and a skipped
// question must read as "not answered", never as "answered no".
import { supabase } from './supabase';
import { fetchMyProfile } from './profile';
import { DIETARY_TAGS } from '../data/recipes';

export type Preferences = {
  household?: '1-2' | '3-4' | '5-6' | '6+';
  hasKids?: boolean;
  diets?: string[];
  avoid?: string[];
  timeBudget?: '15' | '20-30' | '30-45' | '45+';
  cuisines?: string[];
  /** Daily targets. Kept here rather than in their own table because they are
   *  the same kind of thing as the rest: a statement of what you want, not a
   *  record of what happened. */
  nutrition?: {
    goal?: 'lose' | 'maintain' | 'gain' | 'muscle' | 'custom';
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
};

export const NUTRITION_GOALS = [
  { id: 'lose', label: 'Lose weight', icon: '📉' },
  { id: 'maintain', label: 'Maintain', icon: '⚖️' },
  { id: 'gain', label: 'Gain weight', icon: '📈' },
  { id: 'muscle', label: 'Build muscle', icon: '💪' },
  // Picking this deliberately does not touch the numbers: someone who has
  // their own targets already knows them, and overwriting them with a
  // suggestion would be the opposite of what the choice means.
  { id: 'custom', label: 'My own numbers', icon: '✏️' },
] as const;

/**
 * A starting point for the daily targets, so nobody faces four empty number
 * fields. Deliberately rough — this is a suggestion to adjust, not a
 * calculation anyone should act on medically, and the screen says so.
 */
export function suggestedTargets(goal: string | undefined): { calories: number; protein: number; carbs: number; fat: number } {
  const base = { lose: 1800, maintain: 2200, gain: 2600, muscle: 2500 }[goal ?? 'maintain'] ?? 2200;
  return {
    calories: base,
    protein: Math.round((base * 0.3) / 4),
    carbs: Math.round((base * 0.4) / 4),
    fat: Math.round((base * 0.3) / 9),
  };
}

export const HOUSEHOLD = [
  { id: '1-2', label: '1–2 people' },
  { id: '3-4', label: '3–4 people' },
  { id: '5-6', label: '5–6 people' },
  { id: '6+', label: '6+ people' },
] as const;

// Derived from the recipe tags, never listed separately.
//
// The two lists had drifted: onboarding offered Pescatarian, Low Carb and
// Nut-Free — which no recipe can carry, so choosing them filtered nothing —
// while Healthy and High Protein, which recipes do carry, were missing. A
// preference nothing can satisfy is a dead filter, and the only way that stops
// happening again is to have one list.
export const DIETS = DIETARY_TAGS;

export const AVOID = [
  { id: 'peanuts', label: 'Peanuts', icon: '🥜' },
  { id: 'tree-nuts', label: 'Tree nuts', icon: '🌰' },
  { id: 'dairy', label: 'Dairy', icon: '🧀' },
  { id: 'eggs', label: 'Eggs', icon: '🥚' },
  { id: 'shellfish', label: 'Shellfish', icon: '🦐' },
  { id: 'fish', label: 'Fish', icon: '🐠' },
  { id: 'soy', label: 'Soy', icon: '🫘' },
  { id: 'gluten', label: 'Gluten', icon: '🍞' },
] as const;

export const TIME_BUDGET = [
  { id: '15', label: '15 minutes or less' },
  { id: '20-30', label: '20–30 minutes' },
  { id: '30-45', label: '30–45 minutes' },
  { id: '45+', label: '45+ minutes' },
] as const;

export const CUISINES = [
  { id: 'italian', label: 'Italian', icon: '🍝' },
  { id: 'mexican', label: 'Mexican', icon: '🌮' },
  { id: 'american', label: 'American', icon: '🍔' },
  { id: 'asian', label: 'Asian', icon: '🍜' },
  { id: 'mediterranean', label: 'Mediterranean', icon: '🥙' },
  { id: 'indian', label: 'Indian', icon: '🍛' },
  { id: 'japanese', label: 'Japanese', icon: '🍱' },
  { id: 'french', label: 'French', icon: '🥐' },
  { id: 'middle-eastern', label: 'Middle Eastern', icon: '🧆' },
] as const;

/** Household band → a number of servings, for the portion scaling we already do. */
export function householdToServings(band?: Preferences['household']): number | null {
  const map: Record<string, number> = { '1-2': 2, '3-4': 4, '5-6': 6, '6+': 8 };
  return band ? map[band] ?? null : null;
}

export async function loadPreferences(): Promise<{ prefs: Preferences; onboarded: boolean }> {
  const profile = await fetchMyProfile();
  return {
    prefs: ((profile as any)?.preferences ?? {}) as Preferences,
    onboarded: !!(profile as any)?.onboarded_at,
  };
}

/**
 * Save the answers and mark onboarding done.
 *
 * `onboarded_at` is written even when every question was skipped: someone who
 * chose to skip has been asked, and asking again on the next launch would be
 * ignoring the answer they gave.
 */
export async function savePreferences(prefs: Preferences): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not-authenticated' };

  const servings = householdToServings(prefs.household);
  const patch: Record<string, unknown> = {
    preferences: prefs,
    onboarded_at: new Date().toISOString(),
  };
  // Household is the one answer the app already had a home for.
  if (servings) patch.family_size = servings;

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  return error ? { error: error.message } : {};
}
