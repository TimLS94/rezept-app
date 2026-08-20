// One collection: what is in it, and everything you can do to it.
//
// The list screen is deliberately just doors. Renaming, re-iconing, adding,
// removing and deleting all live here, where there is room to say what each
// one does — and where "delete" can say plainly that the recipes survive it.
//
// Membership is resolved against lists the cookbook already loads (your
// recipes, your creator recipes, the bundled seeds) rather than one lookup per
// entry: a collection of twenty would otherwise be twenty round trips.
import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { RECIPES, Recipe } from '../../../data/recipes';
import { fetchMyRecipes, myRecipeToRecipe } from '../../../lib/myRecipes';
import { fetchCookbookCreatorRecipes } from '../../../lib/recipes';
import {
  fetchCollection, fetchCollectionEntries, addToCollection, removeFromCollection,
  renameCollection, deleteCollection, COLLECTION_ICONS,
  Collection, CollectionEntry, CollectionSource,
} from '../../../lib/collections';
import { COLORS, FONTS } from '../../../lib/theme';
import { HEADER_TOP } from '../../../lib/layout';
import { goBackOr } from '../../../lib/nav';

type Candidate = { recipe: Recipe; source: CollectionSource };

export default function CollectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ name: string; icon: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!id) return;
        const [col, ent, mine, creators] = await Promise.all([
          fetchCollection(id),
          fetchCollectionEntries(id),
          fetchMyRecipes(),
          fetchCookbookCreatorRecipes(),
        ]);
        if (!active) return;
        setCollection(col);
        setEntries(ent);
        setCandidates([
          ...mine.map(m => ({ recipe: myRecipeToRecipe(m), source: 'mine' as CollectionSource })),
          ...creators.map(c => ({ recipe: c as Recipe, source: 'creator' as CollectionSource })),
          ...RECIPES.map(r => ({ recipe: r, source: 'seed' as CollectionSource })),
        ]);
        setLoading(false);
      })();
      return () => { active = false; };
    }, [id])
  );

  const byId = new Map(candidates.map(c => [c.recipe.id, c]));
  const inCollection = entries
    .map(e => byId.get(e.recipeId))
    .filter((c): c is Candidate => !!c);
  const memberIds = new Set(entries.map(e => e.recipeId));

  // Seeds are only offered once you have nothing of your own to put in —
  // a picker listing the whole bundled catalogue would bury the four recipes
  // the user actually saved.
  const ownCandidates = candidates.filter(c => c.source !== 'seed');
  const pickable = (ownCandidates.length ? ownCandidates : candidates).filter(c => {
    const q = query.trim().toLowerCase();
    return !q || c.recipe.title.toLowerCase().includes(q);
  });

  const toggle = async (c: Candidate) => {
    if (!id) return;
    if (memberIds.has(c.recipe.id)) {
      setEntries(prev => prev.filter(e => e.recipeId !== c.recipe.id));
      const r = await removeFromCollection(id, c.recipe.id);
      if (r.error) Alert.alert('Could not remove', r.error);
      return;
    }
    setEntries(prev => [{ recipeId: c.recipe.id, source: c.source }, ...prev]);
    const r = await addToCollection(id, c.recipe.id, c.source);
    if (r.error) Alert.alert('Could not add', r.error);
  };

  const openRecipe = (c: Candidate) =>
    router.push(c.source === 'mine' ? `/cookbook/${c.recipe.id}` : `/recipe/${c.recipe.id}`);

  const saveEdits = async () => {
    if (!editing || !id) return;
    if (!editing.name.trim()) {
      Alert.alert('Name needed', 'A collection without a name is hard to find again.');
      return;
    }
    const r = await renameCollection(id, editing.name, editing.icon);
    if (r.error) { Alert.alert('Could not save', r.error); return; }
    setCollection(c => (c ? { ...c, name: editing.name.trim(), icon: editing.icon } : c));
    setEditing(null);
  };

  const confirmDelete = () => {
    if (!id || !collection) return;
    Alert.alert(
      `Delete "${collection.name}"?`,
      'The collection goes away. Every recipe in it stays exactly where it is.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const r = await deleteCollection(id);
            if (r.error) { Alert.alert('Could not delete', r.error); return; }
            goBackOr('/cookbook');
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/cookbook')} style={styles.hBtn}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {collection ? `${collection.icon} ${collection.name}` : 'Collection'}
        </Text>
        <TouchableOpacity
          style={styles.hBtnRight}
          onPress={() => collection && setEditing({ name: collection.name, icon: collection.icon })}
        >
          <Text style={styles.edit}>Edit</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.orange} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.mode, !adding && styles.modeOn]}
              onPress={() => setAdding(false)}
            >
              <Text style={[styles.modeText, !adding && styles.modeTextOn]}>
                In this collection ({entries.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mode, adding && styles.modeOn]}
              onPress={() => setAdding(true)}
            >
              <Text style={[styles.modeText, adding && styles.modeTextOn]}>Add recipes</Text>
            </TouchableOpacity>
          </View>

          {adding ? (
            <>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color="#9A9A9A" />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search your cookbook"
                  placeholderTextColor="#AAA"
                  clearButtonMode="while-editing"
                />
              </View>
              {pickable.length === 0 ? (
                <Text style={styles.empty}>Nothing in your cookbook matches that.</Text>
              ) : (
                pickable.map(c => (
                  <TouchableOpacity key={c.recipe.id} style={styles.pickRow} onPress={() => toggle(c)}>
                    <Thumb recipe={c.recipe} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickTitle} numberOfLines={2}>{c.recipe.title}</Text>
                      <Text style={styles.pickMeta}>
                        {c.source === 'mine' ? 'Yours' : c.source === 'creator' ? 'From a creator' : 'SpoonDrop'}
                      </Text>
                    </View>
                    <Ionicons
                      name={memberIds.has(c.recipe.id) ? 'checkmark-circle' : 'add-circle-outline'}
                      size={26}
                      color={memberIds.has(c.recipe.id) ? COLORS.green : '#C9BFB0'}
                    />
                  </TouchableOpacity>
                ))
              )}
            </>
          ) : inCollection.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{collection?.icon ?? '📁'}</Text>
              <Text style={styles.emptyTitle}>Nothing in here yet</Text>
              <Text style={styles.empty}>
                {entries.length > 0
                  ? 'The recipes in this collection are no longer in your cookbook.'
                  : 'Add recipes from your cookbook and they will show up here.'}
              </Text>
              <TouchableOpacity style={styles.primary} onPress={() => setAdding(true)}>
                <Text style={styles.primaryText}>Add recipes</Text>
              </TouchableOpacity>
            </View>
          ) : (
            inCollection.map(c => (
              <View key={c.recipe.id} style={styles.pickRow}>
                <TouchableOpacity style={styles.rowMain} onPress={() => openRecipe(c)}>
                  <Thumb recipe={c.recipe} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickTitle} numberOfLines={2}>{c.recipe.title}</Text>
                    <Text style={styles.pickMeta}>
                      {[
                        c.recipe.prepTime + c.recipe.cookTime > 0
                          ? `${c.recipe.prepTime + c.recipe.cookTime} min`
                          : null,
                        c.source === 'mine' ? 'Yours' : 'From a creator',
                      ].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggle(c)} hitSlop={10}>
                  <Ionicons name="remove-circle-outline" size={24} color="#C9BFB0" />
                </TouchableOpacity>
              </View>
            ))
          )}

          {!adding && collection && (
            <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
              <Text style={styles.deleteText}>Delete this collection</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <TouchableOpacity onPress={() => setEditing(null)}>
                <Text style={styles.sheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>Edit collection</Text>
              <TouchableOpacity onPress={saveEdits}>
                <Text style={styles.sheetSave}>Save</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.sheetInput}
              value={editing?.name ?? ''}
              onChangeText={t => setEditing(e => (e ? { ...e, name: t } : e))}
              placeholder="Name"
              placeholderTextColor="#AAA"
              returnKeyType="done"
              onSubmitEditing={saveEdits}
            />
            <ScrollView contentContainerStyle={styles.iconGrid}>
              {COLLECTION_ICONS.map(icon => (
                <TouchableOpacity
                  key={icon}
                  style={[styles.iconCell, editing?.icon === icon && styles.iconCellOn]}
                  onPress={() => setEditing(e => (e ? { ...e, icon } : e))}
                >
                  <Text style={styles.iconCellText}>{icon}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Thumb({ recipe }: { recipe: Recipe }) {
  return recipe.image ? (
    <Image source={{ uri: recipe.image }} style={styles.thumb} contentFit="cover" />
  ) : (
    <View style={[styles.thumb, styles.thumbEmpty]}><Text style={styles.thumbIcon}>🍽️</Text></View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: HEADER_TOP, paddingBottom: 16,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  hBtn: { width: 64 },
  hBtnRight: { width: 64, alignItems: 'flex-end' },
  back: { fontSize: 16, color: COLORS.orange, fontWeight: '600' },
  edit: { fontSize: 16, color: COLORS.orange, fontWeight: '600' },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: FONTS.display, fontSize: 18, color: COLORS.navy },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  body: { padding: 20, gap: 10 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  mode: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFE7DC',
  },
  modeOn: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  modeText: { fontSize: 13, fontWeight: '700', color: '#8A8378' },
  modeTextOn: { color: '#FFF' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#333' },

  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF', borderRadius: 14, padding: 10,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 54, height: 54, borderRadius: 10 },
  thumbEmpty: { backgroundColor: '#F0EAE0', alignItems: 'center', justifyContent: 'center' },
  thumbIcon: { fontSize: 22 },
  pickTitle: { fontSize: 14.5, fontWeight: '700', color: COLORS.navy },
  pickMeta: { fontSize: 12, color: '#8A8378', marginTop: 3 },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 46, marginBottom: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.navy, marginBottom: 6 },
  empty: { fontSize: 13.5, color: '#8A8378', textAlign: 'center', lineHeight: 20 },
  primary: {
    backgroundColor: COLORS.orange, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14, marginTop: 18,
  },
  primaryText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  deleteBtn: { alignItems: 'center', paddingVertical: 18, marginTop: 10 },
  deleteText: { fontSize: 14, color: '#B0402A', fontWeight: '600' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.cream, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, paddingBottom: 28, maxHeight: '80%',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: COLORS.navy },
  sheetCancel: { fontSize: 15, color: '#8A8378' },
  sheetSave: { fontSize: 15, fontWeight: '700', color: COLORS.orange },
  sheetInput: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, fontSize: 16,
    borderWidth: 1, borderColor: '#EFE7DC', marginBottom: 14,
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 10 },
  iconCell: {
    width: 54, height: 54, borderRadius: 14, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  iconCellOn: { borderColor: COLORS.orange, borderWidth: 2, backgroundColor: '#FFF3E9' },
  iconCellText: { fontSize: 24 },
});
