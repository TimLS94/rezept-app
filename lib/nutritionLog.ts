// What you actually ate, as far as the app can honestly know.
//
// Everything here comes from cook_log — meals you finished in cook mode or
// ticked off in the planner. That is a real record, and it is also an
// incomplete one: the app never sees the sandwich you bought at lunch. The
// screen says so rather than presenting a partial total as the whole day.
//
// Recipes with no nutrition on them are counted separately instead of as
// zero. A day with three cooked meals and no figures would otherwise read as
// a fast, which is worse than admitting we do not know.
import { supabase, getCurrentUser } from './supabase';
import { RECIPES } from '../data/recipes';
import type { Nutrition } from './nutrition';

export type LoggedMeal = {
  id: string;
  recipeId: string;
  title: string;
  at: string;
  nutrition?: Nutrition;
};

export type DayTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Meals we had figures for, and meals we did not. */
  counted: number;
  unknown: number;
};

export function sumMeals(meals: LoggedMeal[]): DayTotals {
  const t: DayTotals = { calories: 0, protein: 0, carbs: 0, fat: 0, counted: 0, unknown: 0 };
  for (const m of meals) {
    const n = m.nutrition;
    const has = n && (n.calories != null || n.protein != null);
    if (!has) { t.unknown++; continue; }
    t.calories += n!.calories ?? 0;
    t.protein += n!.protein ?? 0;
    t.carbs += n!.carbs ?? 0;
    t.fat += n!.fat ?? 0;
    t.counted++;
  }
  return t;
}

/**
 * Cooked meals between two dates, with whatever nutrition their recipes carry.
 *
 * Nutrition is looked up per recipe in two batched queries rather than one per
 * meal — a week of three meals a day is twenty-one rows, and twenty-one round
 * trips would be felt.
 */
export async function fetchLoggedMeals(from: Date, to: Date): Promise<LoggedMeal[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data: log } = await supabase
    .from('cook_log')
    .select('id, recipe_id, recipe_title, created_at')
    .eq('user_id', user.id)
    .gte('created_at', from.toISOString())
    .lt('created_at', to.toISOString())
    .order('created_at', { ascending: true });

  const entries = log ?? [];
  if (!entries.length) return [];

  const ids = [...new Set(entries.map(e => e.recipe_id).filter(Boolean))];

  const [creator, mine] = await Promise.all([
    supabase.from('recipes').select('id, nutrition, calories').in('id', ids),
    supabase.from('my_recipes').select('id, nutrition, calories').in('id', ids),
  ]);

  const table = new Map<string, Nutrition>();
  for (const row of [...(creator.data ?? []), ...(mine.data ?? [])] as any[]) {
    const n: Nutrition = row.nutrition ?? {};
    // `calories` predates the nutrition column, so a recipe can have one
    // without the other. Prefer the structured value, fall back to the column.
    if (n.calories == null && row.calories) n.calories = row.calories;
    if (n.calories != null || n.protein != null) table.set(row.id, n);
  }
  // Seed recipes carry calories in the bundle and nothing else.
  for (const id of ids) {
    if (table.has(id)) continue;
    const seed = RECIPES.find(r => r.id === id);
    if (seed?.calories) table.set(id, { calories: seed.calories });
  }

  return entries.map(e => ({
    id: e.id,
    recipeId: e.recipe_id,
    title: e.recipe_title || 'Recipe',
    at: e.created_at,
    nutrition: table.get(e.recipe_id),
  }));
}

export function startOfDay(d = new Date()): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
/** Monday-based, to match the planner. */
export function startOfWeek(d = new Date()): Date {
  const x = startOfDay(d);
  const shift = (x.getDay() + 6) % 7;
  return addDays(x, -shift);
}
