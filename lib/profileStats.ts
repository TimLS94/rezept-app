// The four numbers across the top of Profile.
//
// Each one is counted, not estimated. A stat that is nearly right is worse
// than no stat: people check these against what they can see, and one wrong
// number makes the other three suspect.
import { supabase, getCurrentUser } from './supabase';

export type ProfileStats = {
  liked: number;       // swiped right in Discover
  cooked: number;      // finished in cook mode
  collections: number; // recipes in your own cookbook
  following: number;   // creators you subscribe to
};

export async function fetchProfileStats(): Promise<ProfileStats> {
  const user = await getCurrentUser();
  if (!user) return { liked: 0, cooked: 0, collections: 0, following: 0 };

  const count = async (table: string, column: string) => {
    const { count: n } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, user.id);
    return n ?? 0;
  };

  // All four at once: this sits at the top of the screen, so it should not be
  // four sequential round trips before anything renders.
  const [liked, cooked, collections, following] = await Promise.all([
    count('favorite_recipes', 'user_id'),
    count('cook_log', 'user_id'),
    count('my_recipes', 'user_id'),
    count('creator_subscribers', 'subscriber_id'),
  ]);

  return { liked, cooked, collections, following };
}

export type CookedEntry = {
  id: string;
  recipe_id: string;
  recipe_title: string | null;
  rating: number | null;
  created_at: string;
};

/** Everything you have cooked, newest first. */
export async function fetchCookingHistory(limit = 100): Promise<CookedEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data } = await supabase
    .from('cook_log')
    .select('id, recipe_id, recipe_title, rating, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as CookedEntry[];
}

/**
 * Consecutive days with at least one cook, counting back from today.
 *
 * Yesterday still counts as alive: a streak that breaks at midnight punishes
 * people for cooking at 11pm one day and 1am the next.
 */
export function currentStreak(entries: CookedEntry[]): number {
  const days = new Set(entries.map(e => new Date(e.created_at).toDateString()));
  const day = new Date();
  if (!days.has(day.toDateString())) day.setDate(day.getDate() - 1);

  let streak = 0;
  while (days.has(day.toDateString())) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}
