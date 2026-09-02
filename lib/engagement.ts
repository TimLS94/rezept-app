// How often a recipe was cooked, favourited and saved.
//
// All three tables have per-user RLS, so the counting happens in a SECURITY
// DEFINER function: it may count, the caller may not read the rows. Only sums
// come back, never who.
//
// Counted in people, not entries. Someone who cooks the same dish five times is
// one person who likes it — counting entries would let a single enthusiastic
// user set the number everyone else sees. Same rule as popular.ts.
import { supabase } from './supabase';

export type Engagement = { cooked: number; favorited: number; saved: number };

export const EMPTY_ENGAGEMENT: Engagement = { cooked: 0, favorited: 0, saved: 0 };

export type CreatorEngagement = {
  totals: Engagement;
  perRecipe: Record<string, Engagement>;
};

/** One recipe. */
export async function fetchRecipeEngagement(recipeId: string): Promise<Engagement> {
  const { data, error } = await supabase.rpc('recipe_engagement', { p_recipe_id: recipeId });
  if (error || !data) return EMPTY_ENGAGEMENT;
  return data as Engagement;
}

/**
 * Every recipe of one creator, plus the totals, in a single call.
 *
 * The studio shows a number on each card; asking per card would be one round
 * trip per tile, and the catalogue is meant to reach two hundred of them.
 */
export async function fetchCreatorEngagement(creatorId: string): Promise<CreatorEngagement> {
  const { data, error } = await supabase.rpc('creator_engagement', { p_creator_id: creatorId });
  if (error || !data) return { totals: EMPTY_ENGAGEMENT, perRecipe: {} };
  return data as CreatorEngagement;
}

/**
 * A count worth showing, or nothing.
 *
 * Zero is left off rather than printed. "0 cooked" under a recipe somebody
 * spent an evening writing reads as a verdict, when it only means the app is
 * new and nobody has arrived yet — and it is the one number a creator will
 * look at first.
 */
export function countLabel(n: number, one: string, many: string): string | null {
  if (!n) return null;
  return `${n} ${n === 1 ? one : many}`;
}
