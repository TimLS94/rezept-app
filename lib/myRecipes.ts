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
  sourceUrl?: string;
};

type SaveResult = { id: string } | { error: string };

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
    steps: Array.isArray(row.instructions) ? row.instructions : [],
    sourceUrl: row.source_url,
    createdAt: row.created_at,
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
    ingredients: myRecipe.ingredients,
    steps: myRecipe.steps,
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
      instructions: input.steps,
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
  if (input.steps !== undefined) updates.instructions = input.steps;

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
