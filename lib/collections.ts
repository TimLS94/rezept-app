// Your own sections in the cookbook.
//
// A collection is a name, an icon and a list of recipe ids — nothing more.
// It deliberately does not own the recipes: deleting "Desserts" throws away
// the grouping and not a single recipe, which is the only behaviour anyone
// expects from a folder.
//
// Entries carry their source ('mine' | 'creator' | 'seed') because the
// cookbook draws from three places and an id alone does not say which. That
// saves opening an entry from having to ask all three.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCurrentUser } from './supabase';

export type CollectionSource = 'mine' | 'creator' | 'seed';

export type Collection = {
  id: string;
  name: string;
  icon: string;
  position: number;
  /** Filled in by fetchCollections; not stored. */
  count: number;
};

export type CollectionEntry = { recipeId: string; source: CollectionSource };

/**
 * What a new account starts with.
 *
 * Created as ordinary rows, once, and then never enforced again: rename them,
 * re-icon them, delete them. They exist so the tab is not an empty screen
 * with a "+" on it, which is a question rather than a starting point.
 */
export const DEFAULT_COLLECTIONS: { name: string; icon: string }[] = [
  { name: 'Breakfast', icon: '🍳' },
  { name: 'Lunch', icon: '🥪' },
  { name: 'Dinner', icon: '🍽️' },
  { name: 'Dessert', icon: '🍰' },
  { name: 'Snacks', icon: '🍿' },
];

/** Icons offered when naming a collection. */
export const COLLECTION_ICONS = [
  '📁', '🍳', '🥪', '🍽️', '🍰', '🍿', '🥗', '🍜', '🍕', '🌮', '🍣', '🥘',
  '🍝', '🥩', '🐟', '🥦', '🍎', '🧁', '☕', '🍷', '🔥', '⭐', '❤️', '⚡',
];

const SEEDED_KEY = 'collections_seeded_v1';

function sortKey(c: Collection): string {
  return `${String(c.position).padStart(6, '0')}-${c.name.toLowerCase()}`;
}

/**
 * All collections with how many recipes are in each.
 *
 * Two queries, not one per collection: the counts come back as a single list
 * of memberships and are tallied here.
 */
export async function fetchCollections(): Promise<Collection[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('collections')
    .select('id, name, icon, position')
    .eq('user_id', user.id);
  if (error || !data) return [];

  const ids = data.map(c => c.id);
  const counts: Record<string, number> = {};
  if (ids.length) {
    const { data: members } = await supabase
      .from('collection_recipes')
      .select('collection_id')
      .in('collection_id', ids);
    for (const m of members ?? []) {
      counts[(m as any).collection_id] = (counts[(m as any).collection_id] ?? 0) + 1;
    }
  }

  return data
    .map(c => ({
      id: c.id,
      name: c.name,
      icon: c.icon || '📁',
      position: c.position ?? 0,
      count: counts[c.id] ?? 0,
    }))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/**
 * Create the starting set, once per device, and only when the account has no
 * collections at all.
 *
 * The "once" is remembered locally rather than in the database, which is the
 * honest trade: a user who deletes every collection and then signs in on a
 * second device gets the presets back there. The alternative — a column on
 * profiles purely to remember that we already did this — is more schema than
 * the problem deserves.
 */
export async function ensureDefaultCollections(existing: Collection[]): Promise<Collection[]> {
  if (existing.length > 0) return existing;

  const seeded = await AsyncStorage.getItem(SEEDED_KEY).catch(() => null);
  if (seeded) return existing;

  const user = await getCurrentUser();
  if (!user) return existing;

  const { error } = await supabase.from('collections').insert(
    DEFAULT_COLLECTIONS.map((c, i) => ({
      user_id: user.id,
      name: c.name,
      icon: c.icon,
      position: i,
    })),
  );
  await AsyncStorage.setItem(SEEDED_KEY, '1').catch(() => {});
  if (error) return existing;

  return fetchCollections();
}

export async function createCollection(name: string, icon: string): Promise<{ id: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'not-authenticated' };

  const { data, error } = await supabase
    .from('collections')
    .insert({ user_id: user.id, name: name.trim(), icon, position: 999 })
    .select('id')
    .single();

  if (error || !data) return { error: error?.message || 'could-not-create' };
  return { id: data.id };
}

export async function renameCollection(id: string, name: string, icon: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('collections')
    .update({ name: name.trim(), icon })
    .eq('id', id);
  return error ? { error: error.message } : {};
}

export async function deleteCollection(id: string): Promise<{ error?: string }> {
  // Memberships go with it through the cascade; the recipes themselves are
  // untouched, which is the whole point of a collection being a grouping.
  const { error } = await supabase.from('collections').delete().eq('id', id);
  return error ? { error: error.message } : {};
}

export async function fetchCollection(id: string): Promise<Collection | null> {
  const { data } = await supabase
    .from('collections')
    .select('id, name, icon, position')
    .eq('id', id)
    .single();
  if (!data) return null;
  return { id: data.id, name: data.name, icon: data.icon || '📁', position: data.position ?? 0, count: 0 };
}

export async function fetchCollectionEntries(id: string): Promise<CollectionEntry[]> {
  const { data } = await supabase
    .from('collection_recipes')
    .select('recipe_id, source')
    .eq('collection_id', id)
    .order('added_at', { ascending: false });
  return (data ?? []).map((r: any) => ({ recipeId: r.recipe_id, source: r.source as CollectionSource }));
}

export async function addToCollection(
  collectionId: string,
  recipeId: string,
  source: CollectionSource,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('collection_recipes')
    .upsert({ collection_id: collectionId, recipe_id: recipeId, source },
            { onConflict: 'collection_id,recipe_id' });
  return error ? { error: error.message } : {};
}

export async function removeFromCollection(collectionId: string, recipeId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('collection_recipes')
    .delete()
    .eq('collection_id', collectionId)
    .eq('recipe_id', recipeId);
  return error ? { error: error.message } : {};
}

/** Which collections a recipe is already in — for the "add to collection" sheet. */
export async function collectionsContaining(recipeId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('collection_recipes')
    .select('collection_id')
    .eq('recipe_id', recipeId);
  return new Set((data ?? []).map((r: any) => r.collection_id));
}
