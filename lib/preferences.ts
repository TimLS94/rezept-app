// What the user told us during onboarding.
//
// Stored as one jsonb blob on their profile rather than as columns: this is a
// description of taste, and the set of questions worth asking will keep
// moving. Everything is optional — every step can be skipped, and a skipped
// question must read as "not answered", never as "answered no".
import { supabase } from './supabase';
import { fetchMyProfile } from './profile';

export type Preferences = {
  household?: '1-2' | '3-4' | '5-6' | '6+';
  hasKids?: boolean;
  diets?: string[];
  avoid?: string[];
  timeBudget?: '15' | '20-30' | '30-45' | '45+';
  cuisines?: string[];
};

export const HOUSEHOLD = [
  { id: '1-2', label: '1–2 people' },
  { id: '3-4', label: '3–4 people' },
  { id: '5-6', label: '5–6 people' },
  { id: '6+', label: '6+ people' },
] as const;

export const DIETS = [
  { id: 'vegetarian', label: 'Vegetarian', icon: '🌿' },
  { id: 'vegan', label: 'Vegan', icon: '🌱' },
  { id: 'pescatarian', label: 'Pescatarian', icon: '🐟' },
  { id: 'gluten-free', label: 'Gluten-Free', icon: '🌾' },
  { id: 'dairy-free', label: 'Dairy-Free', icon: '🥛' },
  { id: 'low-carb', label: 'Low Carb', icon: '🥑' },
  { id: 'nut-free', label: 'Nut-Free', icon: '🥜' },
] as const;

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
