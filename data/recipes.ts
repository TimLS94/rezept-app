export type Ingredient = {
  name: string;
  amount: number;
  unit: string;
  category: 'produce' | 'meat' | 'dairy' | 'pantry' | 'bakery' | 'frozen' | 'other';
};

// Dietary / attribute tags used for the swipe pre-filters and the meal planner filter.
export type DietaryTag =
  | 'healthy'
  | 'high-protein'
  | 'gluten-free'
  | 'vegetarian'
  | 'vegan'
  | 'dairy-free';

export const DIETARY_TAGS: { id: DietaryTag; label: string; icon: string }[] = [
  { id: 'healthy', label: 'Healthy', icon: '🥗' },
  { id: 'high-protein', label: 'High Protein', icon: '💪' },
  { id: 'gluten-free', label: 'Gluten-Free', icon: '🌾' },
  { id: 'vegetarian', label: 'Vegetarian', icon: '🥕' },
  { id: 'vegan', label: 'Vegan', icon: '🌱' },
  { id: 'dairy-free', label: 'Dairy-Free', icon: '🥥' },
];

export type Recipe = {
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
  categories: ('quick' | 'kids' | 'healthy' | 'budget')[];
  dietary: DietaryTag[];
  kidApproved: boolean;
  influencer: {
    id?: string;
    name: string;
    handle: string;
    avatar: string;
  };
  /** Which table this came from. Absent means a creator recipe or seed data. */
  source?: 'mine';
  /** Per-serving figures. `estimated` says whether a person or the model
   *  produced them — the display must not blur the two. */
  nutrition?: {
    calories?: number; protein?: number; carbs?: number; fat?: number;
    estimated?: boolean; estimated_at?: string;
  };
  ingredients: Ingredient[];
  steps: string[];
  // Optional per-step photo (index-aligned with `steps`). Undefined/null = none.
  stepImages?: (string | null)[];
  // Optional per-step timer in seconds (index-aligned). Undefined/null = none.
  stepTimers?: (number | null)[];
  // Paywall: true = premium-only (creator-gated content). Optional so the local
  // seed catalogue (all free) doesn't need the field.
  isPaid?: boolean;
  // Real counts from the server (survive premium stripping) for the paywall teaser.
  ingredientsCount?: number;
  stepsCount?: number;
  // Server says this recipe is locked for the current user (premium, no access).
  locked?: boolean;
  // Phase 2 pricing, only sent with a locked teaser. Null = not on offer, so
  // that unlock route is hidden rather than shown at a made-up price.
  unlockPriceCents?: number | null;
  creatorSubPriceCents?: number | null;
};

// Empty since the cold start.
//
// This held sixteen sample recipes, and every listing appended them behind
// whatever came from the database — fetchAllRecipes returned [...db, ...RECIPES],
// unconditionally. That was right while the database was empty: a brand-new
// account would otherwise have opened the app to nothing at all.
//
// It is wrong now. The catalogue is being filled with real creator recipes, and
// a demo shrimp dish sitting between them reads as a real recipe — attributed to
// a creator who does not exist, saveable into a cookbook, and impossible to tell
// apart from the ones somebody actually wrote.
//
// The array stays instead of the file being deleted, because the types and
// DIETARY_TAGS below are imported by around forty modules. Every use of RECIPES
// is a spread, a find, a filter or a map; nothing indexes into it, so an empty
// array is safe everywhere it is read.
//
// Do not refill this with samples. An empty catalogue is a state the screens
// already handle; fake recipes are a state a user has to untangle.
export const RECIPES: Recipe[] = [];

// Total hands-on + cooking time for a recipe.
export const totalTime = (r: Recipe): number => (r.prepTime || 0) + (r.cookTime || 0);

// Auto-derived attributes (no manual tagging needed). Quick = fast to make,
// Budget = cheap per serving. Applied to every recipe, including creator uploads.
export const QUICK_MAX_MIN = 30;
export const BUDGET_MAX_PER_SERVING = 3; // USD
export const isQuick = (r: Recipe): boolean => { const t = totalTime(r); return t > 0 && t <= QUICK_MAX_MIN; };
export const costPerServing = (r: Recipe): number => (r.servings > 0 ? r.cost / r.servings : r.cost);
export const isBudget = (r: Recipe): boolean => r.cost > 0 && costPerServing(r) <= BUDGET_MAX_PER_SERVING;

export const getRecipesByCategory = (category: 'quick' | 'kids' | 'healthy' | 'budget'): Recipe[] => {
  return RECIPES.filter(r => r.categories.includes(category));
};

export const getRecipeById = (id: string): Recipe | undefined => {
  return RECIPES.find(r => r.id === id);
};

// Recipes matching ALL selected dietary tags (empty selection = all recipes).
export const filterRecipesByDietary = (tags: DietaryTag[]): Recipe[] => {
  if (tags.length === 0) return RECIPES;
  return RECIPES.filter(r => tags.every(tag => r.dietary.includes(tag)));
};
