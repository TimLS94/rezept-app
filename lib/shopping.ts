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
  | { added: number; merged: number }
  | { error: 'not-authenticated' };

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
  let added = 0;
  let merged = 0;

  for (const { recipe, servings, ingredients } of meals) {
    const scale = servings ? servings / recipe.servings : 1;

    for (const ing of ingredients ?? recipe.ingredients) {
      const amount = ing.amount * scale;
      const existing = working.find(e =>
        e.name.toLowerCase() === ing.name.toLowerCase() && e.unit === ing.unit
      );

      if (existing) {
        existing.amount += amount;
        await supabase
          .from('shopping_items')
          .update({ amount: existing.amount })
          .eq('id', existing.id);
        merged++;
      } else {
        const newItem = {
          user_id: user.id,
          recipe_id: recipe.id,
          recipe_name: recipe.title,
          name: ing.name,
          amount,
          unit: ing.unit,
          category: ing.category,
          checked: false,
        };
        const { data } = await supabase
          .from('shopping_items')
          .insert(newItem)
          .select()
          .single();
        if (data) working.push(data);
        added++;
      }
    }
  }

  return { added, merged };
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
export function describeAdd(added: number, merged: number, title?: string): string {
  const from = title ? ` from ${title}` : '';
  if (added && merged) return `${added} new${from}, ${merged} topped up`;
  if (added) return `${added} item${added === 1 ? '' : 's'}${from}`;
  if (merged) return `Already on your list${from} — amounts increased`;
  return `Nothing to add${from}`;
}
