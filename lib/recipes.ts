import { supabase, getCurrentUser } from './supabase';
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
    stepTimers: (Array.isArray(row.instructions) ? row.instructions : []).map((s: any) =>
      typeof s === 'string' ? null : (s?.timer ?? null)
    ),
    isPaid: row.is_paid ?? false,
    // Real counts (survive premium stripping) + server lock flag for the teaser.
    ingredientsCount: row.ingredients_count ?? (Array.isArray(row.ingredients) ? row.ingredients.length : 0),
    stepsCount: row.steps_count ?? (Array.isArray(row.instructions) ? row.instructions.length : 0),
    locked: row.locked ?? false,
    unlockPriceCents: row.unlock_price_cents ?? null,
    creatorSubPriceCents: row.creator_subscription_price_cents ?? null,
  };
}

// Everything a listing may read. `ingredients` and `instructions` are absent on
// purpose — the database no longer grants them (supabase/lock_recipe_content.sql),
// because a plain select on them bypassed the paywall entirely. Full content
// comes from get_recipe_full (paywalled) or get_recipe_for_edit (owner only).
export const RECIPE_LIST_COLUMNS =
  'id, title, description, image_url, prep_time, cook_time, servings, calories, cost, ' +
  'difficulty, tags, kid_approved, is_paid, price_cents, influencer_id, influencer_name, ' +
  'influencer_handle, influencer_avatar, created_at, ingredients_count, steps_count';

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
    .select(`${RECIPE_LIST_COLUMNS}, profiles:influencer_id(id, full_name, username, avatar_url)`)
    .order('created_at', { ascending: false });
  if (error || !data) return recipeCache?.data ?? [];
  // Only surface uploads that actually carry ingredients (skips bare seed rows).
  // Uses the server-side count now that the array itself isn't readable here.
  const mapped = data.map(mapDbRecipe).filter(r => (r.ingredientsCount ?? 0) > 0);
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

  // Current function resolves the live row server-side and returns
  // { live, snapshot } — one round trip, already premium-gated.
  if ('live' in data || 'snapshot' in data) {
    if (data.live) return mapDbRecipe(data.live);
    return (data.snapshot as Recipe) ?? null;
  }

  // Older deployed function returns the bare favorite snapshot, whose image can
  // be stale/mismatched — costs a second round trip to refresh. Drops away once
  // run_now.sql has been applied.
  const stored = data as Recipe;
  if (stored?.id) {
    const fresh = await fetchDbRecipeById(stored.id).catch(() => undefined);
    if (fresh) return fresh;
  }
  return stored;
}

// Uploaded recipes first (newest, so they can trend), then the local seed set.
export async function fetchAllRecipes(): Promise<Recipe[]> {
  const db = await fetchDbRecipes();
  return [...db, ...RECIPES];
}

// Recipes with their full ingredient lists — needed by anything that reasons
// about ingredients rather than just displaying a card (the fridge scan).
// fetchDbRecipes can't be used for that any more: it reads listing columns, so
// every DB recipe would arrive with an empty ingredient list and silently drop
// out of the matching. The RPC returns only what the caller may actually see.
export async function fetchCookableRecipes(): Promise<Recipe[]> {
  const { data, error } = await supabase.rpc('cookable_recipes');
  const db = (!error && Array.isArray(data)) ? (data as any[]).map(mapDbRecipe) : [];
  return [...db, ...RECIPES];
}

// Look up a single uploaded recipe by its uuid (used when it's not in the
// local catalogue).
export async function fetchDbRecipeById(id: string): Promise<Recipe | undefined> {
  // Server-side gate: premium ingredients/steps are stripped for unentitled
  // users (returns a teaser instead).
  const { data, error } = await supabase.rpc('get_recipe_full', { p_recipe_id: id });
  if (!error && data) return mapDbRecipe(data);

  // Fallback for when the RPC is unavailable. It used to select('*'), which
  // meant any error on the gate handed back the FULL paid recipe — the gate
  // failed open. Listing columns only, and anything paid is treated as locked,
  // so a failure can never be more permissive than success.
  const { data: row } = await supabase
    .from('recipes')
    .select(`${RECIPE_LIST_COLUMNS}, profiles:influencer_id(id, full_name, username, avatar_url)`)
    .eq('id', id)
    .single();
  if (!row) return undefined;
  return mapDbRecipe({ ...row, locked: !!(row as any).is_paid });
}

// A creator recipe the signed-in user owns. `available: false` means the
// creator has deleted the original and this is the snapshot taken at purchase —
// still fully readable and cookable, which is the whole point of keeping it.
export type PurchasedRecipe = Recipe & { available: boolean; purchasedAt?: string };

// Everything the user has bought, for the "From creators" tab of the cookbook.
// Returns [] rather than throwing when my_purchased_recipes() isn't there yet
// (supabase/purchases_survive_deletion.sql not run): an empty tab is a far
// better failure than a screen that errors out.
export async function fetchPurchasedRecipes(): Promise<PurchasedRecipe[]> {
  const { data, error } = await supabase.rpc('my_purchased_recipes');
  if (error || !Array.isArray(data)) return [];
  return data.map((row: any) => ({
    ...mapDbRecipe(row),
    // Owned by definition — the paywall gate must never re-lock a purchase.
    locked: false,
    available: row.available !== false,
    purchasedAt: row.purchased_at,
  }));
}

// A creator recipe sitting in the user's cookbook, however it got there.
// `purchased` separates the two claims: bought (permanent, not removable) from
// saved for free (a pointer, removable, and gone if the creator unpublishes).
export type CookbookCreatorRecipe = PurchasedRecipe & { purchased: boolean };

// The whole "From creators" tab: purchases and free saves in one list.
// Degrades to purchases alone when my_cookbook_creator_recipes() isn't there
// yet (supabase/cookbook_saves.sql not run), so the tab keeps working on a
// database that only has the older function.
export async function fetchCookbookCreatorRecipes(): Promise<CookbookCreatorRecipe[]> {
  const { data, error } = await supabase.rpc('my_cookbook_creator_recipes');
  if (error || !Array.isArray(data)) {
    return (await fetchPurchasedRecipes()).map(r => ({ ...r, purchased: true }));
  }
  return data.map((row: any) => ({
    ...mapDbRecipe(row),
    locked: false,
    available: row.available !== false,
    purchased: row.purchased === true,
    purchasedAt: row.saved_at,
  }));
}

// Keep a free creator recipe in the cookbook. The server re-checks entitlement,
// so this can't be used to shelve a paid recipe.
export async function saveRecipeToCookbook(recipeId: string): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await supabase.rpc('save_recipe_to_cookbook', { p_recipe_id: recipeId });
  if (error) return { error: error.message };
  if (!data?.ok) return { error: data?.error || 'save-failed' };
  return { ok: true };
}

// Only ever removes a free save — purchases live in a different table and are
// untouched by this, which is what makes "what you bought stays yours" true.
export async function removeRecipeFromCookbook(recipeId: string): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'not-authenticated' };
  const { error } = await supabase
    .from('cookbook_saves')
    .delete()
    .eq('user_id', user.id)
    .eq('recipe_id', recipeId);
  if (error) return { error: error.message };
  return { ok: true };
}

// ── Cookbook Edits ─────────────────────────────────────────────────────────
// Save local edits to a creator recipe in the cookbook
export type CookbookEdits = {
  title?: string;
  description?: string;
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  calories?: number;
  difficulty?: Recipe['difficulty'];
  dietary?: DietaryTag[];
  ingredients?: Ingredient[];
  steps?: string[];
};

export async function saveCookbookEdits(
  recipeId: string,
  edits: CookbookEdits
): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await supabase.rpc('save_cookbook_edits', {
    p_recipe_id: recipeId,
    p_edits: edits,
  });
  if (error) return { error: error.message };
  if (!data?.ok) return { error: data?.error || 'save-failed' };
  return { ok: true };
}

export async function getCookbookEdits(recipeId: string): Promise<CookbookEdits> {
  const { data } = await supabase.rpc('get_cookbook_edits', { p_recipe_id: recipeId });
  return (data as CookbookEdits) || {};
}

// Apply edits to a recipe, returning a merged version
export function applyEdits(recipe: Recipe, edits: CookbookEdits): Recipe {
  return {
    ...recipe,
    title: edits.title ?? recipe.title,
    description: edits.description ?? recipe.description,
    prepTime: edits.prepTime ?? recipe.prepTime,
    cookTime: edits.cookTime ?? recipe.cookTime,
    servings: edits.servings ?? recipe.servings,
    calories: edits.calories ?? recipe.calories,
    difficulty: edits.difficulty ?? recipe.difficulty,
    dietary: edits.dietary ?? recipe.dietary,
    ingredients: edits.ingredients ?? recipe.ingredients,
    steps: edits.steps ?? recipe.steps,
  };
}

export async function fetchRecipesByCreator(creatorId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select(RECIPE_LIST_COLUMNS)
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
  stepTimers?: (number | null)[]; // seconds, index-aligned
  isPaid?: boolean;
};

type CreateResult = { id: string } | { error: string };

// Insert a new recipe authored by the signed-in user.
export async function createRecipe(input: NewRecipeInput): Promise<CreateResult> {
  const user = await getCurrentUser();
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
      // Store steps as { text, image?, timer? } when a step has media/timer,
      // else a plain string (keeps legacy recipes + seed catalogue compatible).
      instructions: input.steps.map((text, i) => {
        const image = input.stepImages?.[i] ?? null;
        const timer = input.stepTimers?.[i] ?? null;
        return image || timer ? { text, ...(image ? { image } : {}), ...(timer ? { timer } : {}) } : text;
      }),
      is_paid: input.isPaid ?? false,
      influencer_id: user.id,
      influencer_name: profile?.full_name || 'Creator',
      influencer_handle: `@${handleBase}`,
      influencer_avatar: profile?.avatar_url || DEFAULT_AVATAR,
    })
    // Only the id: a bare .select() means "*", which now hits the revoked
    // ingredients/instructions columns and would fail every creation.
    .select('id')
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
