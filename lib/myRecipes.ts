// Personal recipe book - users can save their own recipes
import { supabase, getCurrentUser } from './supabase';
import { Recipe, Ingredient, DietaryTag } from '../data/recipes';

export type MyRecipe = {
  id: string;
  title: string;
  description: string;
  image: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  calories: number;
  cost: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  dietary: DietaryTag[];
  ingredients: Ingredient[];
  steps: string[];
  nutrition?: Recipe['nutrition'];
  cuisines?: string[];
  equipment?: string[];
  // Index-aligned with `steps`. Null means "no timer on this step". Stored
  // inside the step object in the database, the same way creator recipes do it.
  stepTimers?: (number | null)[];
  stepImages?: (string | null)[];
  sourceUrl?: string;
  createdAt: string;
};

export type MyRecipeInput = {
  title: string;
  description: string;
  image: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  calories: number;
  cost: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  dietary: DietaryTag[];
  ingredients: Ingredient[];
  steps: string[];
  stepTimers?: (number | null)[];
  stepImages?: (string | null)[];
  nutrition?: Recipe['nutrition'];
  cuisines?: string[];
  equipment?: string[];
  sourceUrl?: string;
};

type SaveResult = { id: string } | { error: string };

// A step is stored either as a bare string (everything written before steps
// could carry a timer) or as {text, image, timer}. Both shapes stay readable
// forever — there is no migration that rewrites user content.
function stepText(s: any): string {
  return typeof s === 'string' ? s : (s?.text ?? '');
}

// Steps go to the database as objects only when there is something to put in
// them. A recipe with no timers and no photos stays an array of plain strings,
// which keeps the rows small and readable.
function packSteps(
  steps: string[],
  timers?: (number | null)[],
  images?: (string | null)[],
): any[] {
  const rich = (timers?.some(t => t != null) ?? false) || (images?.some(i => i != null) ?? false);
  if (!rich) return steps;
  return steps.map((text, i) => ({
    text,
    timer: timers?.[i] ?? null,
    image: images?.[i] ?? null,
  }));
}

// Map DB row to MyRecipe
function mapDbRow(row: any): MyRecipe {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    image: row.image_url || '',
    prepTime: row.prep_time || 0,
    cookTime: row.cook_time || 0,
    servings: row.servings || 4,
    calories: row.calories || 0,
    cost: row.cost != null ? Number(row.cost) : 0,
    difficulty: row.difficulty || 'Easy',
    dietary: (row.tags || []) as DietaryTag[],
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    steps: (Array.isArray(row.instructions) ? row.instructions : []).map(stepText),
    stepTimers: (Array.isArray(row.instructions) ? row.instructions : []).map((s: any) =>
      typeof s === 'string' ? null : (s?.timer ?? null)
    ),
    stepImages: (Array.isArray(row.instructions) ? row.instructions : []).map((s: any) =>
      typeof s === 'string' ? null : (s?.image ?? null)
    ),
    nutrition: row.nutrition ?? undefined,
    cuisines: Array.isArray(row.cuisines) ? row.cuisines
      : row.cuisine ? [row.cuisine] : [],
    equipment: Array.isArray(row.equipment) ? row.equipment : [],
    sourceUrl: row.source_url,
    createdAt: row.created_at,
  };
}

/**
 * A shared snapshot — a `my_recipes` row with its identity stripped off —
 * read back as a recipe. Someone sent you their copy; it is not yours until
 * you import it, so it carries no id of its own until then.
 */
export function snapshotToMyRecipe(row: any): MyRecipe {
  return mapDbRow({ ...row, id: 'shared', created_at: row?.created_at ?? new Date().toISOString() });
}

/** The same snapshot as something saveMyRecipe can take. */
export function snapshotToInput(row: any): MyRecipeInput {
  const r = snapshotToMyRecipe(row);
  return {
    title: r.title,
    description: r.description,
    image: r.image,
    prepTime: r.prepTime,
    cookTime: r.cookTime,
    servings: r.servings,
    calories: r.calories,
    cost: r.cost,
    difficulty: r.difficulty,
    dietary: r.dietary,
    ingredients: r.ingredients,
    steps: r.steps,
    stepTimers: r.stepTimers,
    stepImages: r.stepImages,
    nutrition: r.nutrition,
    cuisines: r.cuisines,
    equipment: r.equipment,
    sourceUrl: r.sourceUrl,
  };
}

// Convert MyRecipe to Recipe format (for shopping list compatibility)
export function myRecipeToRecipe(myRecipe: MyRecipe): Recipe {
  return {
    id: myRecipe.id,
    title: myRecipe.title,
    description: myRecipe.description,
    image: myRecipe.image,
    prepTime: myRecipe.prepTime,
    cookTime: myRecipe.cookTime,
    servings: myRecipe.servings,
    calories: myRecipe.calories,
    cost: myRecipe.cost,
    difficulty: myRecipe.difficulty,
    categories: [],
    dietary: myRecipe.dietary,
    kidApproved: false,
    influencer: {
      name: 'My Recipe',
      handle: '@me',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
    },
    source: 'mine',
    nutrition: myRecipe.nutrition,
    cuisines: myRecipe.cuisines,
    equipment: myRecipe.equipment,
    ingredients: myRecipe.ingredients,
    steps: myRecipe.steps,
    stepTimers: myRecipe.stepTimers,
    stepImages: myRecipe.stepImages,
  };
}

/**
 * Take a copy of someone else's recipe into the user's own cookbook.
 *
 * A copy, not a link: creator recipes belong to their author and can be edited
 * or deleted by them, so "edit this favourite" has to mean "edit my version of
 * it". The original favourite is left exactly as it was — the two are separate
 * from the moment the copy is made, which is also why no id of the original is
 * kept beyond the source URL.
 */
export async function copyRecipeToCookbook(recipe: Recipe): Promise<SaveResult> {
  return saveMyRecipe({
    title: recipe.title,
    description: recipe.description,
    image: recipe.image,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    servings: recipe.servings,
    calories: recipe.calories,
    cost: recipe.cost,
    difficulty: recipe.difficulty,
    dietary: recipe.dietary,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    stepTimers: recipe.stepTimers,
    stepImages: recipe.stepImages,
  });
}

// Fetch all user's personal recipes
export async function fetchMyRecipes(): Promise<MyRecipe[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('my_recipes')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map(mapDbRow);
}

// Fetch single recipe by ID
export async function fetchMyRecipeById(id: string): Promise<MyRecipe | null> {
  const { data, error } = await supabase
    .from('my_recipes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return mapDbRow(data);
}

// Save a new personal recipe
// How many recipes the user already keeps. Used for the free import allowance
// — counting rows rather than tracking a separate counter means it survives a
// reinstall and a second device, and there's no extra table to keep in sync.
export async function countMyRecipes(): Promise<number> {
  const user = await getCurrentUser();
  if (!user) return 0;
  const { count } = await supabase
    .from('my_recipes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  return count ?? 0;
}

export async function saveMyRecipe(input: MyRecipeInput): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) return { error: 'not-authenticated' };

  const { data, error } = await supabase
    .from('my_recipes')
    .insert({
      user_id: user.id,
      title: input.title,
      description: input.description,
      image_url: input.image,
      prep_time: input.prepTime,
      cook_time: input.cookTime,
      servings: input.servings,
      calories: input.calories,
      cost: input.cost,
      difficulty: input.difficulty,
      tags: input.dietary,
      ingredients: input.ingredients,
      nutrition: input.nutrition ?? null,
      cuisines: input.cuisines ?? null,
      equipment: input.equipment ?? null,
      instructions: packSteps(input.steps, input.stepTimers, input.stepImages),
      source_url: input.sourceUrl,
    })
    .select()
    .single();

  if (error || !data) return { error: error?.message || 'save-failed' };
  return { id: data.id };
}

// Update an existing personal recipe
export async function updateMyRecipe(id: string, input: Partial<MyRecipeInput>): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) return { error: 'not-authenticated' };

  const updates: any = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.image !== undefined) updates.image_url = input.image;
  if (input.prepTime !== undefined) updates.prep_time = input.prepTime;
  if (input.cookTime !== undefined) updates.cook_time = input.cookTime;
  if (input.servings !== undefined) updates.servings = input.servings;
  if (input.calories !== undefined) updates.calories = input.calories;
  if (input.cost !== undefined) updates.cost = input.cost;
  if (input.difficulty !== undefined) updates.difficulty = input.difficulty;
  if (input.dietary !== undefined) updates.tags = input.dietary;
  if (input.ingredients !== undefined) updates.ingredients = input.ingredients;
  if (input.nutrition !== undefined) updates.nutrition = input.nutrition;
  if (input.cuisines !== undefined) updates.cuisines = input.cuisines;
  if (input.equipment !== undefined) updates.equipment = input.equipment;
  if (input.steps !== undefined)
    updates.instructions = packSteps(input.steps, input.stepTimers, input.stepImages);

  const { error } = await supabase
    .from('my_recipes')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  return { id };
}

// Delete a personal recipe
export async function deleteMyRecipe(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'not-authenticated' };

  const { error } = await supabase
    .from('my_recipes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
