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
    name: string;
    handle: string;
    avatar: string;
  };
  ingredients: Ingredient[];
  steps: string[];
};

export const RECIPES: Recipe[] = [
  // === QUICK & EASY (3) ===
  {
    id: '1',
    title: '15-Minute Garlic Butter Shrimp',
    description: 'Succulent shrimp in a rich garlic butter sauce. Ready in minutes!',
    image: 'https://images.unsplash.com/photo-1599084993091-1cb5c0721cc6?w=800',
    prepTime: 5,
    cookTime: 10,
    servings: 4,
    calories: 320,
    cost: 12.50,
    difficulty: 'Easy',
    categories: ['quick'],
    kidApproved: false,
    influencer: { name: 'Quick Bites', handle: '@quickbites', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200' },
    dietary: ['high-protein', 'gluten-free'],
    ingredients: [
      { name: 'Large Shrimp', amount: 1.5, unit: 'lb', category: 'meat' },
      { name: 'Butter', amount: 4, unit: 'tbsp', category: 'dairy' },
      { name: 'Garlic', amount: 6, unit: 'cloves', category: 'produce' },
      { name: 'Lemon', amount: 1, unit: '', category: 'produce' },
      { name: 'Parsley', amount: 0.25, unit: 'cup', category: 'produce' },
      { name: 'Red Pepper Flakes', amount: 0.5, unit: 'tsp', category: 'pantry' },
      { name: 'Salt', amount: 1, unit: 'tsp', category: 'pantry' },
    ],
    steps: [
      'Pat shrimp dry with paper towels and season with salt.',
      'Melt butter in a large skillet over medium-high heat.',
      'Add minced garlic and red pepper flakes, sauté for 30 seconds.',
      'Add shrimp in a single layer, cook 2 minutes per side until pink.',
      'Squeeze lemon juice over shrimp and garnish with fresh parsley.',
      'Serve immediately over rice or with crusty bread.'
    ]
  },
  {
    id: '2',
    title: 'One-Pan Lemon Herb Chicken',
    description: 'Juicy chicken thighs with roasted vegetables - all in one pan!',
    image: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=800',
    prepTime: 10,
    cookTime: 25,
    servings: 4,
    calories: 380,
    cost: 9.00,
    difficulty: 'Easy',
    categories: ['quick', 'healthy'],
    kidApproved: true,
    influencer: { name: 'Weeknight Wins', handle: '@weeknightwins', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200' },
    dietary: ['healthy', 'high-protein', 'gluten-free', 'dairy-free'],
    ingredients: [
      { name: 'Chicken Thighs', amount: 2, unit: 'lb', category: 'meat' },
      { name: 'Baby Potatoes', amount: 1, unit: 'lb', category: 'produce' },
      { name: 'Green Beans', amount: 0.5, unit: 'lb', category: 'produce' },
      { name: 'Lemon', amount: 2, unit: '', category: 'produce' },
      { name: 'Olive Oil', amount: 3, unit: 'tbsp', category: 'pantry' },
      { name: 'Garlic', amount: 4, unit: 'cloves', category: 'produce' },
      { name: 'Thyme', amount: 1, unit: 'tbsp', category: 'produce' },
      { name: 'Rosemary', amount: 1, unit: 'tbsp', category: 'produce' },
    ],
    steps: [
      'Preheat oven to 425°F (220°C).',
      'Halve potatoes and toss with olive oil, salt, and pepper on a sheet pan.',
      'Season chicken thighs with herbs, garlic, salt, and pepper.',
      'Nestle chicken among potatoes, add lemon slices.',
      'Roast for 20 minutes, add green beans, roast 10 more minutes.',
      'Chicken is done when internal temp reaches 165°F (74°C).'
    ]
  },
  {
    id: '3',
    title: '10-Minute Teriyaki Stir Fry',
    description: 'Quick veggie stir fry with homemade teriyaki sauce.',
    image: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800',
    prepTime: 5,
    cookTime: 5,
    servings: 4,
    calories: 290,
    cost: 7.50,
    difficulty: 'Easy',
    categories: ['quick', 'healthy'],
    kidApproved: true,
    influencer: { name: 'Fast & Fresh', handle: '@fastandfresh', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200' },
    dietary: ['healthy', 'high-protein', 'dairy-free'],
    ingredients: [
      { name: 'Chicken Breast', amount: 1, unit: 'lb', category: 'meat' },
      { name: 'Broccoli', amount: 2, unit: 'cups', category: 'produce' },
      { name: 'Bell Peppers', amount: 2, unit: '', category: 'produce' },
      { name: 'Soy Sauce', amount: 0.25, unit: 'cup', category: 'pantry' },
      { name: 'Honey', amount: 2, unit: 'tbsp', category: 'pantry' },
      { name: 'Sesame Oil', amount: 1, unit: 'tbsp', category: 'pantry' },
      { name: 'Ginger', amount: 1, unit: 'tbsp', category: 'produce' },
      { name: 'Cornstarch', amount: 1, unit: 'tbsp', category: 'pantry' },
    ],
    steps: [
      'Slice chicken into thin strips, season with salt.',
      'Mix soy sauce, honey, sesame oil, ginger, and cornstarch for sauce.',
      'Heat oil in wok over high heat, stir fry chicken 3 minutes.',
      'Add broccoli and peppers, stir fry 2 minutes.',
      'Pour sauce over, toss until thickened and glossy.',
      'Serve over steamed rice.'
    ]
  },

  // === KIDS APPROVED (2) ===
  {
    id: '4',
    title: 'Cheesy Baked Mac & Cheese',
    description: 'Creamy, cheesy comfort food that kids go absolutely crazy for!',
    image: 'https://images.unsplash.com/photo-1543339494-b4cd4f7ba686?w=800',
    prepTime: 15,
    cookTime: 25,
    servings: 6,
    calories: 450,
    cost: 8.00,
    difficulty: 'Easy',
    categories: ['kids'],
    kidApproved: true,
    influencer: { name: 'Family Food Fun', handle: '@familyfoodfun', avatar: 'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=200' },
    dietary: ['vegetarian'],
    ingredients: [
      { name: 'Elbow Macaroni', amount: 1, unit: 'lb', category: 'pantry' },
      { name: 'Sharp Cheddar', amount: 3, unit: 'cups', category: 'dairy' },
      { name: 'Milk', amount: 2, unit: 'cups', category: 'dairy' },
      { name: 'Butter', amount: 4, unit: 'tbsp', category: 'dairy' },
      { name: 'Flour', amount: 3, unit: 'tbsp', category: 'pantry' },
      { name: 'Breadcrumbs', amount: 0.5, unit: 'cup', category: 'pantry' },
      { name: 'Paprika', amount: 0.5, unit: 'tsp', category: 'pantry' },
    ],
    steps: [
      'Preheat oven to 375°F (190°C). Cook pasta according to package.',
      'Melt butter in saucepan, whisk in flour, cook 1 minute.',
      'Gradually add milk, whisking constantly until thickened.',
      'Remove from heat, stir in 2.5 cups cheese until melted.',
      'Combine sauce with pasta, pour into baking dish.',
      'Top with remaining cheese and breadcrumbs.',
      'Bake 20-25 minutes until golden and bubbly.'
    ]
  },
  {
    id: '5',
    title: 'Mini Pizza Bagels',
    description: 'Fun, customizable pizza bagels - let kids build their own!',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800',
    prepTime: 10,
    cookTime: 12,
    servings: 4,
    calories: 320,
    cost: 6.50,
    difficulty: 'Easy',
    categories: ['kids', 'quick'],
    kidApproved: true,
    influencer: { name: 'Kid Chef Club', handle: '@kidchefclub', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200' },
    dietary: [],
    ingredients: [
      { name: 'Mini Bagels', amount: 8, unit: '', category: 'bakery' },
      { name: 'Pizza Sauce', amount: 1, unit: 'cup', category: 'pantry' },
      { name: 'Mozzarella', amount: 2, unit: 'cups', category: 'dairy' },
      { name: 'Pepperoni', amount: 24, unit: 'slices', category: 'meat' },
      { name: 'Bell Pepper', amount: 1, unit: '', category: 'produce' },
      { name: 'Black Olives', amount: 0.25, unit: 'cup', category: 'pantry' },
    ],
    steps: [
      'Preheat oven to 400°F (200°C).',
      'Split bagels and place cut-side up on baking sheet.',
      'Spread 1-2 tablespoons pizza sauce on each half.',
      'Sprinkle with mozzarella cheese.',
      'Add pepperoni and any other toppings.',
      'Bake 10-12 minutes until cheese is melted and bubbly.',
      'Let cool slightly before serving.'
    ]
  },

  // === HEALTHY (3) ===
  {
    id: '6',
    title: 'Mediterranean Quinoa Bowl',
    description: 'Protein-packed quinoa with fresh veggies and tangy feta.',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
    prepTime: 15,
    cookTime: 20,
    servings: 4,
    calories: 380,
    cost: 10.00,
    difficulty: 'Easy',
    categories: ['healthy'],
    kidApproved: false,
    influencer: { name: 'Clean Eats', handle: '@cleaneats', avatar: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200' },
    dietary: ['healthy', 'vegetarian', 'gluten-free'],
    ingredients: [
      { name: 'Quinoa', amount: 1.5, unit: 'cups', category: 'pantry' },
      { name: 'Cucumber', amount: 1, unit: '', category: 'produce' },
      { name: 'Cherry Tomatoes', amount: 1, unit: 'cup', category: 'produce' },
      { name: 'Red Onion', amount: 0.5, unit: '', category: 'produce' },
      { name: 'Kalamata Olives', amount: 0.5, unit: 'cup', category: 'pantry' },
      { name: 'Feta Cheese', amount: 1, unit: 'cup', category: 'dairy' },
      { name: 'Olive Oil', amount: 3, unit: 'tbsp', category: 'pantry' },
      { name: 'Lemon', amount: 1, unit: '', category: 'produce' },
      { name: 'Chickpeas', amount: 1, unit: 'can', category: 'pantry' },
    ],
    steps: [
      'Cook quinoa according to package directions, let cool.',
      'Dice cucumber, halve tomatoes, slice red onion thinly.',
      'Drain and rinse chickpeas.',
      'Whisk olive oil, lemon juice, salt, and oregano for dressing.',
      'Combine quinoa, vegetables, olives, and chickpeas.',
      'Drizzle with dressing, top with crumbled feta.',
      'Serve chilled or at room temperature.'
    ]
  },
  {
    id: '7',
    title: 'Grilled Salmon with Asparagus',
    description: 'Heart-healthy omega-3 rich salmon with crispy asparagus.',
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800',
    prepTime: 10,
    cookTime: 15,
    servings: 4,
    calories: 420,
    cost: 16.00,
    difficulty: 'Medium',
    categories: ['healthy'],
    kidApproved: false,
    influencer: { name: 'Fit Kitchen', handle: '@fitkitchen', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200' },
    dietary: ['healthy', 'high-protein', 'gluten-free', 'dairy-free'],
    ingredients: [
      { name: 'Salmon Fillets', amount: 4, unit: '6oz', category: 'meat' },
      { name: 'Asparagus', amount: 1, unit: 'bunch', category: 'produce' },
      { name: 'Olive Oil', amount: 2, unit: 'tbsp', category: 'pantry' },
      { name: 'Lemon', amount: 2, unit: '', category: 'produce' },
      { name: 'Garlic', amount: 3, unit: 'cloves', category: 'produce' },
      { name: 'Dill', amount: 2, unit: 'tbsp', category: 'produce' },
      { name: 'Capers', amount: 2, unit: 'tbsp', category: 'pantry' },
    ],
    steps: [
      'Preheat grill or grill pan to medium-high heat.',
      'Brush salmon with olive oil, season with salt, pepper, and garlic.',
      'Toss asparagus with olive oil and season.',
      'Grill salmon 4-5 minutes per side until internal temp is 145°F.',
      'Grill asparagus 3-4 minutes, turning occasionally.',
      'Serve salmon topped with lemon slices, dill, and capers.'
    ]
  },
  {
    id: '8',
    title: 'Thai Coconut Curry Soup',
    description: 'Warming, aromatic soup packed with vegetables and lean protein.',
    image: 'https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=800',
    prepTime: 15,
    cookTime: 20,
    servings: 6,
    calories: 310,
    cost: 11.00,
    difficulty: 'Medium',
    categories: ['healthy'],
    kidApproved: false,
    influencer: { name: 'Global Bowls', handle: '@globalbowls', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200' },
    dietary: ['healthy', 'high-protein', 'gluten-free', 'dairy-free'],
    ingredients: [
      { name: 'Coconut Milk', amount: 2, unit: 'cans', category: 'pantry' },
      { name: 'Chicken Breast', amount: 1, unit: 'lb', category: 'meat' },
      { name: 'Red Curry Paste', amount: 3, unit: 'tbsp', category: 'pantry' },
      { name: 'Chicken Broth', amount: 4, unit: 'cups', category: 'pantry' },
      { name: 'Mushrooms', amount: 8, unit: 'oz', category: 'produce' },
      { name: 'Baby Spinach', amount: 2, unit: 'cups', category: 'produce' },
      { name: 'Fish Sauce', amount: 2, unit: 'tbsp', category: 'pantry' },
      { name: 'Lime', amount: 2, unit: '', category: 'produce' },
      { name: 'Cilantro', amount: 0.5, unit: 'cup', category: 'produce' },
    ],
    steps: [
      'Slice chicken into thin strips.',
      'Heat 1 tbsp oil in large pot, sauté curry paste 1 minute.',
      'Add coconut milk and broth, bring to simmer.',
      'Add chicken and mushrooms, cook 10 minutes.',
      'Stir in fish sauce and lime juice.',
      'Add spinach, cook until wilted.',
      'Serve topped with cilantro and extra lime.'
    ]
  },

  // === BUDGET (2) ===
  {
    id: '9',
    title: 'Black Bean Tacos',
    description: 'Hearty, meatless tacos that cost under $2 per serving!',
    image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800',
    prepTime: 10,
    cookTime: 10,
    servings: 4,
    calories: 340,
    cost: 5.50,
    difficulty: 'Easy',
    categories: ['budget', 'healthy'],
    kidApproved: true,
    influencer: { name: 'Budget Bytes', handle: '@budgetbytes', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200' },
    dietary: ['healthy', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free'],
    ingredients: [
      { name: 'Black Beans', amount: 2, unit: 'cans', category: 'pantry' },
      { name: 'Corn Tortillas', amount: 12, unit: '', category: 'bakery' },
      { name: 'Lime', amount: 2, unit: '', category: 'produce' },
      { name: 'Cilantro', amount: 0.5, unit: 'cup', category: 'produce' },
      { name: 'Onion', amount: 1, unit: '', category: 'produce' },
      { name: 'Cumin', amount: 1, unit: 'tsp', category: 'pantry' },
      { name: 'Salsa', amount: 1, unit: 'cup', category: 'pantry' },
      { name: 'Avocado', amount: 2, unit: '', category: 'produce' },
    ],
    steps: [
      'Drain and rinse black beans.',
      'Mash half the beans, leave half whole for texture.',
      'Sauté onion until soft, add beans and cumin.',
      'Cook 5 minutes, mashing and stirring.',
      'Warm tortillas in dry skillet or microwave.',
      'Fill tortillas with beans, top with salsa, avocado, cilantro.',
      'Squeeze lime over tacos and serve.'
    ]
  },
  {
    id: '10',
    title: 'Spaghetti Aglio e Olio',
    description: 'Classic Italian pasta with garlic and olive oil - simple perfection.',
    image: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800',
    prepTime: 5,
    cookTime: 15,
    servings: 4,
    calories: 380,
    cost: 4.00,
    difficulty: 'Easy',
    categories: ['budget', 'quick'],
    kidApproved: true,
    influencer: { name: 'Pasta Queen', handle: '@pastaqueen', avatar: 'https://images.unsplash.com/photo-1499557354967-2b2d8910bcca?w=200' },
    dietary: ['vegetarian'],
    ingredients: [
      { name: 'Spaghetti', amount: 1, unit: 'lb', category: 'pantry' },
      { name: 'Garlic', amount: 8, unit: 'cloves', category: 'produce' },
      { name: 'Olive Oil', amount: 0.5, unit: 'cup', category: 'pantry' },
      { name: 'Red Pepper Flakes', amount: 1, unit: 'tsp', category: 'pantry' },
      { name: 'Parsley', amount: 0.5, unit: 'cup', category: 'produce' },
      { name: 'Parmesan', amount: 0.5, unit: 'cup', category: 'dairy' },
    ],
    steps: [
      'Cook spaghetti in salted water until al dente. Reserve 1 cup pasta water.',
      'While pasta cooks, slice garlic very thin.',
      'Heat olive oil in large pan over medium-low heat.',
      'Add garlic and red pepper flakes, cook until garlic is golden (not brown!).',
      'Add drained pasta to pan with 1/2 cup pasta water.',
      'Toss vigorously to emulsify oil and water into sauce.',
      'Add parsley and parmesan, toss and serve immediately.'
    ]
  },
];

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
