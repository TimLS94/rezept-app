import { supabase } from './supabase';
import { RECIPES, Recipe, Ingredient, DietaryTag } from '../data/recipes';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200';

// Map a Supabase `recipes` row into the app's Recipe shape.
export function mapDbRecipe(row: any): Recipe {
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
    categories: [],
    dietary: (row.tags || []) as DietaryTag[],
    kidApproved: row.kid_approved || false,
    influencer: {
      name: row.influencer_name || 'Creator',
      handle: row.influencer_handle || '@creator',
      avatar: row.influencer_avatar || DEFAULT_AVATAR,
    },
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    steps: Array.isArray(row.instructions) ? row.instructions : [],
  };
}

// Uploaded recipes from Supabase. Returns [] on error so callers degrade to the
// local seed catalogue rather than breaking.
export async function fetchDbRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  // Only surface uploads that actually carry ingredients (skips bare seed rows).
  return data.map(mapDbRecipe).filter(r => r.ingredients.length > 0);
}

// Uploaded recipes first (newest, so they can trend), then the local seed set.
export async function fetchAllRecipes(): Promise<Recipe[]> {
  const db = await fetchDbRecipes();
  return [...db, ...RECIPES];
}

// Look up a single uploaded recipe by its uuid (used when it's not in the
// local catalogue).
export async function fetchDbRecipeById(id: string): Promise<Recipe | undefined> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return undefined;
  return mapDbRecipe(data);
}

export async function fetchRecipesByCreator(creatorId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('influencer_id', creatorId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapDbRecipe);
}

export type NewRecipeInput = {
  title: string;
  description: string;
  image: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  calories: number;
  cost: number;
  difficulty: Recipe['difficulty'];
  dietary: DietaryTag[];
  ingredients: Ingredient[];
  steps: string[];
};

type CreateResult = { id: string } | { error: string };

// Insert a new recipe authored by the signed-in user.
export async function createRecipe(input: NewRecipeInput): Promise<CreateResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not-authenticated' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, username, avatar_url')
    .eq('id', user.id)
    .single();

  const handleBase =
    profile?.username || user.email?.split('@')[0] || 'creator';

  const { data, error } = await supabase
    .from('recipes')
    .insert({
      title: input.title,
      description: input.description,
      image_url: input.image,
      prep_time: input.prepTime,
      cook_time: input.cookTime,
      servings: input.servings,
      calories: input.calories,
      cost: input.cost,
      difficulty: input.difficulty,
      kid_approved: false,
      tags: input.dietary,
      ingredients: input.ingredients,
      instructions: input.steps,
      influencer_id: user.id,
      influencer_name: profile?.full_name || 'Creator',
      influencer_handle: `@${handleBase}`,
      influencer_avatar: profile?.avatar_url || DEFAULT_AVATAR,
    })
    .select()
    .single();

  if (error || !data) return { error: error?.message || 'insert-failed' };

  // Promote a plain user to the creator role (don't demote admins).
  await supabase
    .from('profiles')
    .update({ role: 'creator', is_creator: true })
    .eq('id', user.id)
    .eq('role', 'user');

  return { id: data.id };
}
