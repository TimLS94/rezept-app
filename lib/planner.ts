// What the weekly planner is allowed to put on your plate.
//
// "Generate" used to deal from data/recipes.ts — the bundled sample catalogue.
// Those recipes are demo content: nobody wrote them for this user, they aren't
// in anyone's cookbook, and half of them can't be opened from anywhere else in
// the app. A plan built from them looks real and isn't.
//
// The pool here is only recipes that actually exist for this user: their own
// favourites, and free recipes published by creators. Paid recipes are left out
// — the planner must never put something behind a paywall on Tuesday.
import { Recipe, DietaryTag } from '../data/recipes';
import { fetchDbRecipes, fetchDbRecipeById } from './recipes';

export function filterByDietary(list: Recipe[], tags: DietaryTag[]): Recipe[] {
  if (tags.length === 0) return list;
  return list.filter(r => tags.every(tag => r.dietary.includes(tag)));
}

export function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  // Fisher-Yates. `sort(() => Math.random() - 0.5)` is not a shuffle — it
  // leaves the first items far more likely to stay put, which showed up as the
  // same few meals reappearing every time you hit Generate.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Everything the planner may choose from: the user's favourites plus every free
 * creator recipe. Deduplicated by id, favourites first so a favourited recipe
 * keeps its (possibly richer) saved copy.
 */
export async function buildRecipePool(favorites: Recipe[]): Promise<Recipe[]> {
  const published = await fetchDbRecipes();
  const free = published.filter(r => !r.isPaid && !r.locked);

  const byId = new Map<string, Recipe>();
  for (const r of [...favorites, ...free]) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  return Array.from(byId.values());
}

/**
 * Make sure a planned recipe carries its ingredients.
 *
 * Listings don't return ingredients (the database doesn't grant them — see
 * lock_recipe_content.sql), and a favourite saved from a card carries whatever
 * that card had. A planned meal without ingredients contributes nothing to the
 * shopping list, which is most of the point of planning it.
 */
export async function withIngredients(recipes: Recipe[]): Promise<Recipe[]> {
  return Promise.all(
    recipes.map(async r => {
      if (r.ingredients.length > 0) return r;
      const full = await fetchDbRecipeById(r.id);
      // Keep the original when the fetch fails or comes back locked: a meal
      // with no ingredients still beats dropping it out of the plan silently.
      return full && !full.locked && full.ingredients.length > 0 ? full : r;
    })
  );
}
