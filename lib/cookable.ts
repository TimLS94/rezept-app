// One way in for cook mode, whatever the recipe is.
//
// A recipe can reach the user through four different doors: the bundled seed
// catalogue, their own cookbook (`my_recipes`), a creator's recipe (`recipes`,
// behind the paywall gate), or a purchase whose original has since been deleted
// and only survives as a snapshot. Cook mode used to know about two of them, so
// tapping "cook" on a cookbook recipe silently loaded nothing.
//
// Callers pass an id and, where they know it, a hint. The hint is an
// optimisation, never a requirement: a wrong or missing hint costs one extra
// round trip, not a failure.
import { RECIPES, Recipe } from '../data/recipes';
import { fetchDbRecipeById, fetchPurchasedRecipes } from './recipes';
import { fetchMyRecipeById, myRecipeToRecipe } from './myRecipes';

export type CookableSource = 'seed' | 'mine' | 'creator' | 'purchase';

export type Cookable = {
  recipe: Recipe;
  source: CookableSource;
  /** False when the creator has deleted the original and this is the snapshot
   *  the buyer keeps. The recipe is fully usable; it just no longer exists
   *  upstream, and the UI should say so rather than pretend otherwise. */
  available: boolean;
};

/** A recipe with no steps is a note: readable, but nothing to step through. */
export function isNote(recipe: Recipe): boolean {
  return !recipe.steps?.length;
}

function fromSeed(id: string): Cookable | undefined {
  const r = RECIPES.find(x => x.id === id);
  return r ? { recipe: r, source: 'seed', available: true } : undefined;
}

async function fromCookbook(id: string): Promise<Cookable | undefined> {
  const mine = await fetchMyRecipeById(id);
  return mine ? { recipe: myRecipeToRecipe(mine), source: 'mine', available: true } : undefined;
}

async function fromCreator(id: string): Promise<Cookable | undefined> {
  const r = await fetchDbRecipeById(id);
  return r ? { recipe: r, source: 'creator', available: true } : undefined;
}

// Last resort: a recipe the user paid for whose original is gone. Reads the
// frozen copy kept on the purchase. The RPC may not exist yet on a database
// that hasn't run purchases_survive_deletion.sql — that degrades to "not
// found", which is what the old behaviour was anyway.
async function fromPurchaseSnapshot(id: string): Promise<Cookable | undefined> {
  const owned = await fetchPurchasedRecipes();
  const hit = owned.find(r => r.id === id);
  return hit ? { recipe: hit, source: 'purchase', available: hit.available } : undefined;
}

/**
 * Resolve `id` to something cook mode can run, from any source the user has
 * legitimate access to. Returns undefined only when the recipe genuinely isn't
 * reachable — deleted, never existed, or not theirs.
 */
export async function loadCookable(id: string, hint?: CookableSource): Promise<Cookable | undefined> {
  if (!id) return undefined;

  // The seed catalogue is in memory, so checking it is free and instant.
  const seeded = fromSeed(id);
  if (seeded) return seeded;

  // Where the caller knows the source, one query usually settles it.
  if (hint === 'mine') {
    const hit = await fromCookbook(id);
    if (hit) return hit;
  } else if (hint === 'creator' || hint === 'purchase') {
    const hit = await fromCreator(id);
    if (hit) return hit;
  }

  // No hint, or the hint missed: ask both tables at once. They're different
  // tables with different ids, so at most one answers — and running them in
  // parallel costs one round trip rather than two.
  const [mine, creator] = await Promise.all([
    hint === 'mine' ? Promise.resolve(undefined) : fromCookbook(id),
    hint === 'creator' || hint === 'purchase' ? Promise.resolve(undefined) : fromCreator(id),
  ]);
  if (mine) return mine;
  if (creator) return creator;

  return fromPurchaseSnapshot(id);
}
