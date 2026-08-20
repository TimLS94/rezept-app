// An icon for a shopping item, picked from its name.
//
// The list already had one icon per category — 🧀 above the Dairy section —
// which tells you nothing you didn't know from the heading. Per item it is
// worth something: a list you can skim in a shop without reading it, and a
// missing icon that says "I didn't recognise this" instead of guessing.
//
// Emoji, not an icon set: they need no assets, no native module and no
// licence, and they are what the rest of the app already draws with.
//
// German words are in the table alongside English ones. Recipes get imported
// from wherever the user found them, and half of a German shopping list
// coming back as 📦 would be worse than useless.

/** Everything we cannot place. Deliberately neutral: a parcel, not a guess. */
export const UNKNOWN_ICON = '📦';

type Entry = { icon: string; category: string; words: string[] };

// Order does not matter — the longest matching word wins, so "coconut milk"
// lands on 🥥 rather than 🥛 without the table having to be sorted by hand.
const TABLE: Entry[] = [
  // ── Produce ──────────────────────────────────────────────────────────
  { icon: '🍎', category: 'produce', words: ['apple', 'apfel', 'äpfel'] },
  { icon: '🍌', category: 'produce', words: ['banana', 'banane'] },
  { icon: '🍅', category: 'produce', words: ['tomato', 'tomatoes', 'tomate', 'tomaten', 'passata'] },
  { icon: '🥔', category: 'produce', words: ['potato', 'potatoes', 'kartoffel', 'kartoffeln'] },
  { icon: '🥕', category: 'produce', words: ['carrot', 'carrots', 'karotte', 'karotten', 'möhre', 'möhren'] },
  { icon: '🧅', category: 'produce', words: ['onion', 'onions', 'zwiebel', 'zwiebeln', 'shallot', 'schalotte'] },
  { icon: '🧄', category: 'produce', words: ['garlic', 'knoblauch'] },
  { icon: '🫑', category: 'produce', words: ['pepper', 'peppers', 'paprika', 'capsicum'] },
  { icon: '🌶️', category: 'produce', words: ['chili', 'chilli', 'chilies', 'jalapeno', 'jalapeño'] },
  { icon: '🥒', category: 'produce', words: ['cucumber', 'gurke', 'zucchini', 'courgette'] },
  { icon: '🥬', category: 'produce', words: ['lettuce', 'salad', 'salat', 'spinach', 'spinat', 'kale', 'cabbage', 'kohl', 'chard'] },
  { icon: '🥦', category: 'produce', words: ['broccoli', 'brokkoli'] },
  { icon: '🍄', category: 'produce', words: ['mushroom', 'mushrooms', 'pilz', 'pilze', 'champignon', 'champignons'] },
  { icon: '🌽', category: 'produce', words: ['corn', 'mais', 'sweetcorn'] },
  { icon: '🥑', category: 'produce', words: ['avocado', 'avocados'] },
  { icon: '🍋', category: 'produce', words: ['lemon', 'zitrone', 'lime', 'limette'] },
  { icon: '🍊', category: 'produce', words: ['orange', 'orangen', 'mandarin', 'clementine'] },
  { icon: '🍓', category: 'produce', words: ['strawberry', 'strawberries', 'erdbeere', 'erdbeeren'] },
  { icon: '🫐', category: 'produce', words: ['blueberry', 'blueberries', 'heidelbeere', 'blaubeeren', 'berries', 'beeren'] },
  { icon: '🍇', category: 'produce', words: ['grape', 'grapes', 'traube', 'trauben'] },
  { icon: '🍉', category: 'produce', words: ['watermelon', 'melone', 'melon'] },
  { icon: '🍑', category: 'produce', words: ['peach', 'pfirsich', 'nectarine'] },
  { icon: '🍐', category: 'produce', words: ['pear', 'birne'] },
  { icon: '🍍', category: 'produce', words: ['pineapple', 'ananas'] },
  { icon: '🥭', category: 'produce', words: ['mango'] },
  { icon: '🍒', category: 'produce', words: ['cherry', 'cherries', 'kirsche', 'kirschen'] },
  { icon: '🍆', category: 'produce', words: ['eggplant', 'aubergine'] },
  { icon: '🫒', category: 'produce', words: ['olive', 'olives', 'oliven'] },
  { icon: '🥥', category: 'produce', words: ['coconut', 'kokos', 'kokosnuss'] },
  { icon: '🫘', category: 'produce', words: ['beans', 'bean', 'bohnen', 'chickpea', 'chickpeas', 'kichererbsen', 'lentil', 'lentils', 'linsen'] },
  { icon: '🫛', category: 'produce', words: ['peas', 'erbsen'] },
  { icon: '🌿', category: 'produce', words: ['basil', 'basilikum', 'parsley', 'petersilie', 'coriander', 'cilantro', 'koriander', 'mint', 'minze', 'thyme', 'thymian', 'rosemary', 'rosmarin', 'herbs', 'kräuter', 'dill'] },
  { icon: '🫚', category: 'produce', words: ['ginger', 'ingwer'] },

  // ── Meat & fish ──────────────────────────────────────────────────────
  { icon: '🍗', category: 'meat', words: ['chicken', 'hähnchen', 'hahnchen', 'huhn', 'poultry', 'geflügel'] },
  { icon: '🦃', category: 'meat', words: ['turkey', 'pute', 'truthahn'] },
  { icon: '🥩', category: 'meat', words: ['beef', 'rind', 'rindfleisch', 'steak', 'mince', 'hackfleisch', 'hack'] },
  { icon: '🥓', category: 'meat', words: ['bacon', 'speck', 'pancetta'] },
  { icon: '🍖', category: 'meat', words: ['pork', 'schwein', 'schweinefleisch', 'lamb', 'lamm', 'ham', 'schinken', 'ribs'] },
  { icon: '🌭', category: 'meat', words: ['sausage', 'wurst', 'bratwurst', 'chorizo', 'salami'] },
  { icon: '🐟', category: 'meat', words: ['fish', 'fisch', 'salmon', 'lachs', 'tuna', 'thunfisch', 'cod', 'kabeljau', 'trout', 'forelle'] },
  { icon: '🦐', category: 'meat', words: ['shrimp', 'prawn', 'prawns', 'garnele', 'garnelen'] },
  { icon: '🦪', category: 'meat', words: ['oyster', 'oysters', 'auster', 'austern', 'mussel', 'muscheln'] },
  { icon: '🦀', category: 'meat', words: ['crab', 'krabbe'] },
  { icon: '🦞', category: 'meat', words: ['lobster', 'hummer'] },
  { icon: '🦑', category: 'meat', words: ['squid', 'calamari', 'tintenfisch'] },

  // ── Dairy ────────────────────────────────────────────────────────────
  { icon: '🥛', category: 'dairy', words: ['milk', 'milch', 'cream', 'sahne', 'buttermilk'] },
  { icon: '🧀', category: 'dairy', words: ['cheese', 'käse', 'kase', 'parmesan', 'mozzarella', 'feta', 'cheddar', 'gouda', 'ricotta', 'halloumi'] },
  { icon: '🧈', category: 'dairy', words: ['butter', 'margarine', 'ghee'] },
  { icon: '🥚', category: 'dairy', words: ['egg', 'eggs', 'ei', 'eier'] },
  { icon: '🍦', category: 'dairy', words: ['yogurt', 'yoghurt', 'joghurt', 'quark', 'skyr'] },

  // ── Bakery ───────────────────────────────────────────────────────────
  { icon: '🍞', category: 'bakery', words: ['bread', 'brot', 'toast', 'sourdough', 'brötchen', 'roll', 'rolls'] },
  { icon: '🥖', category: 'bakery', words: ['baguette'] },
  { icon: '🥐', category: 'bakery', words: ['croissant', 'pastry'] },
  { icon: '🥯', category: 'bakery', words: ['bagel'] },
  { icon: '🫓', category: 'bakery', words: ['tortilla', 'tortillas', 'wrap', 'wraps', 'pita', 'flatbread', 'naan'] },
  { icon: '🥨', category: 'bakery', words: ['pretzel', 'brezel'] },
  { icon: '🍰', category: 'bakery', words: ['cake', 'kuchen', 'torte'] },
  { icon: '🍪', category: 'bakery', words: ['cookie', 'cookies', 'keks', 'kekse', 'biscuit'] },
  { icon: '🥞', category: 'bakery', words: ['pancake', 'pancakes', 'pfannkuchen', 'crepe'] },
  { icon: '🧇', category: 'bakery', words: ['waffle', 'waffeln'] },

  // ── Pantry ───────────────────────────────────────────────────────────
  { icon: '🍚', category: 'pantry', words: ['rice', 'reis', 'risotto', 'quinoa', 'couscous'] },
  { icon: '🍝', category: 'pantry', words: ['pasta', 'spaghetti', 'nudeln', 'noodle', 'noodles', 'penne', 'macaroni', 'lasagne', 'lasagna'] },
  { icon: '🌾', category: 'pantry', words: ['flour', 'mehl', 'oats', 'haferflocken', 'oatmeal', 'wheat', 'weizen', 'breadcrumbs', 'paniermehl'] },
  { icon: '🍬', category: 'pantry', words: ['sugar', 'zucker', 'sweetener'] },
  { icon: '🧂', category: 'pantry', words: ['salt', 'salz', 'spice', 'spices', 'gewürz', 'gewürze', 'paprikapulver', 'cumin', 'kreuzkümmel', 'cinnamon', 'zimt', 'curry', 'oregano', 'baking powder', 'backpulver'] },
  { icon: '🫙', category: 'pantry', words: ['oil', 'öl', 'olivenöl', 'vinegar', 'essig', 'sauce', 'soße', 'soy', 'sojasauce', 'ketchup', 'mayo', 'mayonnaise', 'mustard', 'senf', 'pesto', 'sriracha', 'tahini'] },
  { icon: '🍯', category: 'pantry', words: ['honey', 'honig', 'jam', 'marmelade', 'syrup', 'sirup', 'maple'] },
  { icon: '🥜', category: 'pantry', words: ['peanut', 'erdnuss', 'nuts', 'nuss', 'nüsse', 'almond', 'mandel', 'mandeln', 'walnut', 'walnuss', 'cashew', 'seeds', 'samen'] },
  { icon: '🍫', category: 'pantry', words: ['chocolate', 'schokolade', 'cocoa', 'kakao'] },
  { icon: '🥫', category: 'pantry', words: ['canned', 'can', 'dose', 'tin', 'stock', 'broth', 'brühe', 'bouillon', 'tomato paste', 'tomatenmark'] },
  { icon: '☕', category: 'pantry', words: ['coffee', 'kaffee', 'espresso'] },
  { icon: '🍵', category: 'pantry', words: ['tea', 'tee', 'matcha'] },
  { icon: '🍷', category: 'pantry', words: ['wine', 'wein'] },
  { icon: '🍺', category: 'pantry', words: ['beer', 'bier'] },
  { icon: '🧃', category: 'pantry', words: ['juice', 'saft'] },
  { icon: '🥤', category: 'pantry', words: ['soda', 'cola', 'lemonade', 'limonade'] },
  { icon: '💧', category: 'pantry', words: ['water', 'wasser'] },
  { icon: '🍿', category: 'pantry', words: ['popcorn', 'chips', 'crisps'] },
  { icon: '🥣', category: 'pantry', words: ['cereal', 'müsli', 'muesli', 'granola'] },
  { icon: '🍶', category: 'pantry', words: ['tofu', 'sojasoße', 'miso'] },

  // ── Frozen ───────────────────────────────────────────────────────────
  { icon: '🍨', category: 'frozen', words: ['ice cream', 'eis', 'gelato', 'sorbet'] },
  { icon: '🧊', category: 'frozen', words: ['frozen', 'tiefkühl', 'gefroren', 'ice'] },
  { icon: '🍕', category: 'frozen', words: ['pizza'] },
];

/** Lower-cased, punctuation gone, so "Chicken breast," matches "chicken". */
function normalise(name: string): string {
  return ` ${name.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()} `;
}

/**
 * The icon for an item, or null when nothing in the table fits.
 *
 * Null rather than a fallback: the caller decides whether an unrecognised
 * item shows the category's icon or the parcel, and a function that always
 * answers can't tell the difference between "cheese" and "I have no idea".
 */
export function matchFoodIcon(name: string): { icon: string; category: string } | null {
  const haystack = normalise(name);
  if (haystack.trim().length < 2) return null;

  let best: { entry: Entry; length: number } | null = null;
  for (const entry of TABLE) {
    for (const word of entry.words) {
      // Padded on both sides, so "ei" does not match "protein" and "eis"
      // does not match "reis".
      if (!haystack.includes(` ${word} `) && !haystack.includes(` ${word}s `)) continue;
      if (!best || word.length > best.length) best = { entry, length: word.length };
    }
  }
  return best ? { icon: best.entry.icon, category: best.entry.category } : null;
}

/** What to draw next to an item. Always answers — the parcel when unsure. */
export function foodIcon(name: string): string {
  return matchFoodIcon(name)?.icon ?? UNKNOWN_ICON;
}

/**
 * The icons offered when adding an item by hand, grouped the way the shopping
 * list is grouped. One per row of the table, deduped, so the picker and the
 * list can never disagree about what an icon means.
 */
export const ICON_CHOICES: { icon: string; category: string; label: string }[] = (() => {
  const seen = new Set<string>();
  const out: { icon: string; category: string; label: string }[] = [];
  for (const e of TABLE) {
    if (seen.has(e.icon)) continue;
    seen.add(e.icon);
    out.push({ icon: e.icon, category: e.category, label: e.words[0] });
  }
  out.push({ icon: UNKNOWN_ICON, category: 'other', label: 'something else' });
  return out;
})();
