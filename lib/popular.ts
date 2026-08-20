// What the rest of SpoonDrop cooked this week.
//
// Counts come from a SECURITY DEFINER function over cook_log, which is
// per-user RLS — the function returns how many people cooked each recipe and
// nothing about who they were.
//
// Popularity is counted in people, not in entries: one person cooking the
// same thing five times is one person who likes it. Counting entries would
// let a single enthusiastic user decide what everyone else sees on their home
// screen.
import { supabase } from './supabase';

export type Popularity = { people: number; cooks: number };

/**
 * How many people cooked something in the last seven days.
 *
 * The badge threshold lives here rather than in the screen, because "popular"
 * has to mean something: with one person behind it, it is your own cook log
 * reflected back at you, which is a claim the home screen should not make.
 */
export const POPULAR_MIN_PEOPLE = 2;

export async function fetchPopularThisWeek(): Promise<Record<string, Popularity>> {
  const { data, error } = await supabase.rpc('popular_recipes_this_week', { p_limit: 12 });
  if (error || !Array.isArray(data)) return {};

  const out: Record<string, Popularity> = {};
  for (const row of data as any[]) {
    if (!row?.recipe_id) continue;
    out[String(row.recipe_id)] = {
      people: Number(row.people) || 0,
      cooks: Number(row.cooks) || 0,
    };
  }
  return out;
}

/** True when enough different people cooked it to be worth saying so. */
export function isPopular(p?: Popularity): boolean {
  return !!p && p.people >= POPULAR_MIN_PEOPLE;
}
