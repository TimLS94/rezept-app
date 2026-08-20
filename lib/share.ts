// Sharing a recipe out of the app — into iMessage, WhatsApp, mail, anywhere.
//
// Two kinds of recipe, two different payloads, and the difference matters:
//
//   A creator's recipe is public, so a link is the right thing to send. The
//   recipient opens it in the app or on the web, the creator keeps the credit,
//   and paid content stays behind its paywall because the link resolves
//   server-side.
//
//   Your own recipe exists only in your cookbook. A link to it would open
//   nothing for anybody else, so the text goes instead — the whole recipe,
//   readable in a message.
import { Share } from 'react-native';
import { Recipe } from '../data/recipes';
import { supabase } from './supabase';

const SITE = 'https://spoondrop.app';

// The app's own scheme, which works today. The https address above is the
// nicer link and is what universal links will use, but spoondrop.app does not
// resolve yet — sending it on its own would be sending a dead link.
const APP_SCHEME = 'spoondrop://';

/**
 * A link that opens this recipe inside SpoonDrop.
 *
 * Returns null when the share could not be created — an unsigned-in user, a
 * database that has not run recipe_shares.sql. Callers fall back to sending
 * the recipe as text, which is what they did before links existed.
 */
export async function createShareLink(
  recipe: Recipe,
  source: 'creator' | 'mine',
): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_recipe_share', {
    p_kind: source === 'mine' ? 'mine' : 'creator',
    p_recipe_id: recipe.id,
  });
  if (error || !data?.ok || !data.token) return null;
  return `${APP_SCHEME}s/${data.token}`;
}

function formatAmount(amount: number, unit: string): string {
  if (!amount) return unit || '';
  // 0.5 reads better as ½ in a message than as a decimal.
  const rounded = Math.round(amount * 100) / 100;
  const asFraction = { 0.25: '¼', 0.33: '⅓', 0.5: '½', 0.67: '⅔', 0.75: '¾' }[rounded];
  return `${asFraction ?? rounded}${unit ? ` ${unit}` : ''}`;
}

/** The full recipe as plain text, for recipes that have no public page. */
export function recipeAsText(recipe: Recipe): string {
  const time = recipe.prepTime + recipe.cookTime;
  const lines: string[] = [`🍳 ${recipe.title}`];

  if (recipe.description) lines.push('', recipe.description);

  const facts = [
    time > 0 ? `⏱ ${time} min` : null,
    recipe.servings ? `🍽 ${recipe.servings} servings` : null,
    recipe.calories > 0 ? `🔥 ${recipe.calories} cal` : null,
  ].filter(Boolean);
  if (facts.length) lines.push('', facts.join('  •  '));

  if (recipe.ingredients.length) {
    lines.push('', 'INGREDIENTS');
    for (const ing of recipe.ingredients) {
      lines.push(`• ${formatAmount(ing.amount, ing.unit)} ${ing.name}`.replace(/\s+/g, ' ').trim());
    }
  }

  if (recipe.steps.length) {
    lines.push('', 'STEPS');
    recipe.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }

  lines.push('', `Shared from SpoonDrop — ${SITE}`);
  return lines.join('\n');
}

/**
 * Share a recipe. `source` decides what actually gets sent: anything from a
 * creator travels as a link, anything of your own travels as text.
 */
export async function shareRecipe(recipe: Recipe, source: 'creator' | 'mine'): Promise<void> {
  const time = recipe.prepTime + recipe.cookTime;
  const link = await createShareLink(recipe, source);

  // With a link, both kinds travel the same way: a few lines to read in the
  // message and one tap to open it in the app, where a creator recipe lands
  // on its own screen — paywall included — and a personal one offers to be
  // imported into the recipient's cookbook.
  //
  // Without one, a personal recipe still travels as its full text. That is
  // worth keeping: it is readable by someone who does not have the app, and
  // it is the only thing that ever worked for recipes that exist nowhere
  // public.
  const headline =
    source === 'creator'
      ? `Check out "${recipe.title}" by ${recipe.influencer.handle} on SpoonDrop 🍳`
      : `I made "${recipe.title}" — here it is 🍳`;

  const facts = [
    time > 0 ? `⏱ ${time} min` : null,
    recipe.calories > 0 ? `🔥 ${recipe.calories} cal` : null,
  ].filter(Boolean).join(' • ');

  const message = link
    ? [headline, facts, '', `Open in SpoonDrop: ${link}`].filter(Boolean).join('\n')
    : source === 'creator'
      ? `${headline}\n${facts}\n\n${SITE}/recipe/${recipe.id}`
      : recipeAsText(recipe);

  try {
    await Share.share({ message, title: recipe.title });
  } catch {
    // The share sheet was dismissed. Nothing to report — the user closed it.
  }
}
