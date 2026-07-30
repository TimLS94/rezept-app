import { supabase } from './supabase';
import { RECIPES, Recipe, Ingredient, DietaryTag } from '../data/recipes';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200';

// Map a Supabase `recipes` row into the app's Recipe shape.
export function mapDbRecipe(row: any): Recipe {
  // Handle joined profile data if available
  const profile = row.profiles || {};
  
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
      id: row.influencer_id || profile.id || '',
      name: profile.full_name || row.influencer_name || 'Creator',
      handle: profile.username ? `@${profile.username}` : (row.influencer_handle || '@creator'),
      avatar: profile.avatar_url || row.influencer_avatar || DEFAULT_AVATAR,
    },
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    // Instructions may be plain strings (legacy) or { text, image } objects.
    steps: (Array.isArray(row.instructions) ? row.instructions : []).map((s: any) =>
      typeof s === 'string' ? s : (s?.text ?? '')
    ),
    stepImages: (Array.isArray(row.instructions) ? row.instructions : []).map((s: any) =>
      typeof s === 'string' ? null : (s?.image ?? null)
    ),
    isPaid: row.is_paid ?? false,
  };
}

// Shared in-memory cache so Discover/Search/Home don't re-hit the network on
// every mount. Short TTL; invalidated when a recipe is created/changed.
let recipeCache: { data: Recipe[]; at: number } | null = null;
const RECIPE_CACHE_TTL = 60_000; // 1 minute

export function invalidateRecipeCache() {
  recipeCache = null;
}

// Uploaded recipes from Supabase. Returns [] on error so callers degrade to the
// local seed catalogue rather than breaking. Pass force to bypass the cache.
export async function fetchDbRecipes(force = false): Promise<Recipe[]> {
  if (!force && recipeCache && Date.now() - recipeCache.at < RECIPE_CACHE_TTL) {
    return recipeCache.data;
  }
  const { data, error } = await supabase
    .from('recipes')
    .select('*, profiles:influencer_id(id, full_name, username, avatar_url)')
    .order('created_at', { ascending: false });
  if (error || !data) return recipeCache?.data ?? [];
  // Only surface uploads that actually carry ingredients (skips bare seed rows).
  const mapped = data.map(mapDbRecipe).filter(r => r.ingredients.length > 0);
  recipeCache = { data: mapped, at: Date.now() };
  return mapped;
}

// "Recipe of the week": the recipe favorited most often across ALL users in the
// last 7 days. Uses a SECURITY DEFINER RPC so it can aggregate everyone's
// favorites without exposing individual rows (favorite_recipes is per-user RLS).
// Returns null if nobody favorited anything this week (caller falls back).
export async function fetchRecipeOfTheWeek(): Promise<Recipe | null> {
  const { data, error } = await supabase.rpc('recipe_of_the_week');
  if (error || !data) return null;
  return data as Recipe;
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
    .select('*, profiles:influencer_id(id, full_name, username, avatar_url)')
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
  stepImages?: (string | null)[]; // index-aligned with steps
  isPaid?: boolean;
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
      // Store steps as { text, image } when a step has a photo, else a plain
      // string (keeps legacy recipes and the seed catalogue compatible).
      instructions: input.steps.map((text, i) =>
        input.stepImages?.[i] ? { text, image: input.stepImages[i] } : text
      ),
      is_paid: input.isPaid ?? false,
      influencer_id: user.id,
      influencer_name: profile?.full_name || 'Creator',
      influencer_handle: `@${handleBase}`,
      influencer_avatar: profile?.avatar_url || DEFAULT_AVATAR,
    })
    .select()
    .single();

  if (error || !data) return { error: error?.message || 'insert-failed' };

  invalidateRecipeCache(); // new recipe should appear immediately in Discover/Search
  // Note: uploading no longer promotes a user to 'creator'. The creator role is
  // assigned deliberately (by an admin), so uploads stay gated to real creators.
  return { id: data.id };
}

// Toggle a recipe's paywall flag. RLS ("Creators can update their own recipes")
// restricts this to the recipe's author.
export async function setRecipePaid(
  id: string,
  isPaid: boolean
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.from('recipes').update({ is_paid: isPaid }).eq('id', id);
  if (error) return { error: error.message };
  invalidateRecipeCache();
  return { ok: true };
}
