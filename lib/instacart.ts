import { Linking } from 'react-native';
import { supabase } from './supabase';

export type ListItem = {
  name: string;
  amount?: number;
  unit?: string;
};

export type InstacartResult =
  | { kind: 'cart'; url: string }      // real list page, products pre-matched
  | { kind: 'search'; url: string }    // fallback: plain search on instacart.com
  | { kind: 'error'; detail: string };

// Ask the edge function to build a real Instacart shopping-list page.
//
// Falls back to a plain search URL when the integration isn't set up. That
// fallback is what the app did before and it is genuinely poor — it drops the
// whole list into one search box, so Instacart searches for the literal string
// "milk, eggs, spinach" and finds nothing useful. It exists so the button still
// does something, not because it works well.
export async function buildInstacartLink(
  items: ListItem[],
  title = 'My shopping list',
): Promise<InstacartResult> {
  const usable = items.filter(i => i.name?.trim());
  if (!usable.length) return { kind: 'error', detail: 'empty_list' };

  try {
    const { data, error } = await supabase.functions.invoke('instacart-list', {
      body: {
        title,
        items: usable.map(i => ({
          name: i.name.trim(),
          // Instacart matches on `name`; display_text is what the user reads,
          // so the amount belongs there rather than in the search term.
          displayText: i.amount && i.unit ? `${trimNumber(i.amount)} ${i.unit} ${i.name}` : i.name,
          quantity: i.amount,
          unit: i.unit,
        })),
      },
    });

    if (!error && data?.url) return { kind: 'cart', url: data.url };
    // `not_configured` is the expected state until the API key is set — it is
    // not an error worth showing anyone.
    if (data?.error && data.error !== 'not_configured') {
      console.warn('Instacart link failed:', data.error, data.detail ?? '');
    }
  } catch (e) {
    console.warn('Instacart link failed:', e);
  }

  return { kind: 'search', url: searchFallbackUrl(usable) };
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function searchFallbackUrl(items: ListItem[]): string {
  const query = items.map(i => i.name).join(', ');
  return `https://www.instacart.com/store/search/${encodeURIComponent(query)}`;
}

export async function openUrl(url: string): Promise<void> {
  await Linking.openURL(url).catch(() => {});
}
