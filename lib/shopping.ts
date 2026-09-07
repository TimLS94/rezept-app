import { supabase, getCurrentUser } from './supabase';
import { Recipe, Ingredient } from '../data/recipes';

export type PlannedMeal = {
  recipe: Recipe;
  servings?: number;
  // Add only these instead of the whole recipe. The fridge scan uses it to put
  // just the missing items on the list — everything else is already at home.
  // Still tagged with the recipe, so the list shows what they're for.
  ingredients?: Ingredient[];
};

type AddResult =
  | { added: number; merged: number; skipped: number; failure?: string }
  | { error: string };

/**
 * Adds the ingredients of one or more recipes to the signed-in user's shopping
 * list. Each inserted item is tagged with `recipe_id` and `recipe_name` so the
 * shopping list can group and display them as meals. Ingredients that already
 * exist (same name + unit) are merged by summing their amounts, matching the
 * behaviour of the recipe detail screen.
 */
export async function addRecipesToShoppingList(
  meals: PlannedMeal[]
): Promise<AddResult> {
  const user = await getCurrentUser();
  if (!user) return { error: 'not-authenticated' };

  const { data: existingItems } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('user_id', user.id);

  // Local working copy so ingredients shared across the planned meals merge too.
  const working = [...(existingItems || [])];
  let skipped = 0;
  let failure: string | undefined;

  // Everything is worked out in memory first, then written in two calls.
  //
  // This used to await a round trip PER INGREDIENT, inside a nested loop. A
  // twenty-ingredient recipe was twenty sequential requests to a database in
  // us-west-1 — three to six seconds from Europe, for a button that gave no
  // sign it was doing anything. The work was never the problem; the waiting in
  // single file was.
  const toInsert: any[] = [];
  const toUpdate: { id: string; amount: number }[] = [];

  for (const { recipe, servings, ingredients } of meals) {
    // A recipe with servings 0 would make every amount Infinity.
    const base = recipe.servings || 1;
    const scale = servings ? servings / base : 1;

    for (const ing of ingredients ?? recipe.ingredients) {
      // `name` is NOT NULL in the table. An imported recipe can carry a
      // nameless ingredient, and inserting one used to fail while still being
      // counted as added — the list stayed empty and the app said it worked.
      const name = String(ing?.name ?? '').trim();
      if (!name) { skipped++; continue; }

      const parsed = Number(ing.amount);
      const amount = Number.isFinite(parsed) ? parsed * scale : 0;
      const unit = ing.unit ?? '';
      const existing = working.find(e =>
        e.name.toLowerCase() === name.toLowerCase() && (e.unit ?? '') === unit
      );

      if (existing) {
        // The running total is kept on the working copy so a second mention of
        // the same ingredient in a later meal adds to it rather than queuing a
        // second update that would overwrite the first.
        existing.amount = Number(existing.amount) + amount;
        const queued = toUpdate.find(u => u.id === existing.id);
        if (queued) queued.amount = existing.amount;
        else toUpdate.push({ id: existing.id, amount: existing.amount });
      } else {
        const newItem = {
          user_id: user.id,
          recipe_id: recipe.id,
          recipe_name: recipe.title,
          name,
          amount,
          unit,
          category: ing.category ?? 'other',
          checked: false,
        };
        toInsert.push(newItem);
        // Pushed to the working copy immediately, so the same ingredient in the
        // next meal merges into this one instead of becoming a second row.
        working.push({ ...newItem, id: `pending-${toInsert.length}` });
      }
    }
  }

  // One insert for every new row, and the updates in parallel rather than in
  // sequence. Two waits instead of twenty.
  const [insertRes, updateResults] = await Promise.all([
    toInsert.length
      ? supabase.from('shopping_items').insert(toInsert).select()
      : Promise.resolve({ data: [], error: null } as any),
    Promise.all(
      toUpdate.map(u =>
        supabase.from('shopping_items').update({ amount: u.amount }).eq('id', u.id),
      ),
    ),
  ]);

  // Count what actually landed, not what was attempted. Reporting the intent
  // is how a rejected write used to look like a success.
  if (insertRes.error) failure ??= insertRes.error.message;
  const added = insertRes.data?.length ?? 0;

  let merged = 0;
  for (const r of updateResults) {
    if (r.error) failure ??= r.error.message;
    else merged++;
  }

  return { added, merged, skipped, failure };
}

/**
 * What actually happened, in words the user can act on.
 *
 * "12 items added" is wrong whenever the ingredients merged into lines that
 * were already on the list: nothing was added, the amounts grew. Adding the
 * same recipe twice is allowed and useful — you might be cooking a double
 * batch — but it looks like a no-op unless the message says the quantities
 * went up.
 */
export function describeAdd(
  added: number,
  merged: number,
  title?: string,
  extra?: { skipped?: number; failure?: string },
): string {
  const from = title ? ` from ${title}` : '';
  // A failure has to win over the counts: "3 items added" next to an empty
  // list is how this bug stayed invisible.
  if (extra?.failure) return `Could not save the list: ${extra.failure}`;
  if (!added && !merged && extra?.skipped) {
    return `Nothing usable${from} — ${extra.skipped} ingredient${extra.skipped === 1 ? ' has' : 's have'} no name. Edit the recipe to fix it.`;
  }
  if (added && merged) return `${added} new${from}, ${merged} topped up`;
  if (added) return `${added} item${added === 1 ? '' : 's'}${from}`;
  if (merged) return `Already on your list${from} — amounts increased`;
  return `Nothing to add${from}`;
}
