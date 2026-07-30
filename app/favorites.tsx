import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../lib/theme';
import { useFavorites } from '../lib/favorites';
import { useMealPlan, thisWeekKey } from '../lib/mealPlan';
import { addRecipesToShoppingList } from '../lib/shopping';
import { getAllServings, setServings as setServingsStore } from '../lib/servings';

export default function FavoritesScreen() {
  const { favorites, removeFavorite, collections, setCollection } = useFavorites();
  const { addRecipeToWeek, plansByWeek, updateWeekPlan } = useMealPlan();
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());
  const [activeCollection, setActiveCollection] = useState<string | null>(null); // null = All
  const [assignFor, setAssignFor] = useState<string | null>(null); // recipe id being filed
  const [newColl, setNewColl] = useState('');
  const [servingsMap, setServingsMap] = useState<Record<string, number>>({}); // per-recipe overrides

  useEffect(() => {
    getAllServings().then(setServingsMap).catch(() => {});
  }, []);

  const servingsFor = (id: string, base: number) => servingsMap[id] ?? base;
  const changeServings = (id: string, base: number, delta: number) => {
    const nextVal = Math.max(1, servingsFor(id, base) + delta);
    setServingsMap(prev => ({ ...prev, [id]: nextVal }));
    setServingsStore(id, nextVal);
  };

  const PRESETS = ['Healthy', 'Easy', 'Quick', 'Dinner', 'Dessert'];
  // Collections that actually have recipes, plus the presets, for the chips.
  const usedCollections = Array.from(
    new Set(Object.values(collections).filter((c): c is string => !!c))
  );
  const chipCollections = Array.from(new Set([...usedCollections, ...PRESETS]));

  const shownFavorites = activeCollection
    ? favorites.filter(r => collections[r.id] === activeCollection)
    : favorites;

  const assignAndClose = (collection: string | null) => {
    if (assignFor) setCollection(assignFor, collection);
    setAssignFor(null);
    setNewColl('');
  };

  // Reflect the real weekly plan so the calendar button can add AND remove.
  const weekKeyStr = thisWeekKey();
  const weekPlan = plansByWeek[weekKeyStr] ?? [];
  const inPlan = (id: string) => weekPlan.some(m => m.recipe.id === id);

  const markInCart = (ids: string[]) =>
    setCartIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });

  // Toggle a recipe in/out of this week's plan.
  const toggleWeek = (id: string) => {
    const recipe = favorites.find(r => r.id === id);
    if (!recipe) return;
    if (inPlan(id)) updateWeekPlan(weekKeyStr, plan => plan.filter(m => m.recipe.id !== id));
    else addRecipeToWeek(weekKeyStr, recipe);
  };

  const addAllToWeek = () => {
    favorites.forEach(r => addRecipeToWeek(weekKeyStr, r));
  };

  // Push favorites into the shopping cart (a separate place from the meal plan).
  // Ingredients are grouped by category / recipe on the Shopping screen.
  const addToCart = async (recipes: typeof favorites) => {
    if (recipes.length === 0) return;
    const result = await addRecipesToShoppingList(recipes.map(recipe => ({ recipe })));
    if ('error' in result) {
      Alert.alert('Sign in required', 'Sign in to save your shopping list.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/login') },
      ]);
      return;
    }
    markInCart(recipes.map(r => r.id));
    Alert.alert(
      'Added to Cart! 🛒',
      `${recipes.length} ${recipes.length === 1 ? 'recipe' : 'recipes'} • ${result.added} new items` +
        (result.merged ? ` (${result.merged} merged)` : ''),
      [
        { text: 'Done', style: 'cancel' },
        { text: 'View Cart', onPress: () => router.push('/shopping') },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Favorites</Text>
        <View style={{ width: 60 }} />
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>❤️</Text>
          <Text style={styles.emptyText}>No favorites yet</Text>
          <Text style={styles.emptySubtext}>Swipe right in Discover to save recipes here</Text>
          <TouchableOpacity style={styles.discoverButton} onPress={() => router.push('/discover')}>
            <Text style={styles.discoverButtonText}>🔥 Start swiping</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <Text style={styles.count}>
              {favorites.length} {favorites.length === 1 ? 'recipe' : 'recipes'}
            </Text>
            <View style={styles.topActions}>
              <TouchableOpacity onPress={addAllToWeek}>
                <Text style={styles.addAll}>+ This week</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => addToCart(favorites)}>
                <Text style={styles.addAll}>🛒 Add all to cart</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Collection filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <TouchableOpacity style={[styles.chip, !activeCollection && styles.chipActive]} onPress={() => setActiveCollection(null)}>
              <Text style={[styles.chipText, !activeCollection && styles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {chipCollections.map(c => (
              <TouchableOpacity key={c} style={[styles.chip, activeCollection === c && styles.chipActive]} onPress={() => setActiveCollection(c)}>
                <Text style={[styles.chipText, activeCollection === c && styles.chipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {shownFavorites.length === 0 && (
            <Text style={styles.emptyCollText}>No recipes in "{activeCollection}" yet — tap 📁 on a recipe to add it.</Text>
          )}

          {shownFavorites.map(recipe => {
            const added = inPlan(recipe.id);
            const inCart = cartIds.has(recipe.id);
            return (
              <View key={recipe.id} style={styles.card}>
                <TouchableOpacity
                  style={styles.cardMain}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/recipe/${recipe.id}`)}
                >
                  <Image source={{ uri: recipe.image }} style={styles.cardImage} />
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{recipe.title}</Text>
                    <Text style={styles.cardMeta}>
                      {recipe.prepTime + recipe.cookTime} min • {recipe.calories} cal
                    </Text>
                    <Text style={styles.cardHandle}>{recipe.influencer.handle}</Text>
                    <TouchableOpacity
                      style={styles.collTag}
                      onPress={() => setAssignFor(recipe.id)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="folder-outline" size={12} color={collections[recipe.id] ? COLORS.orange : COLORS.warmGray} />
                      <Text style={[styles.collTagText, collections[recipe.id] && styles.collTagTextActive]} numberOfLines={1}>
                        {collections[recipe.id] || 'Add to collection'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.servRow}>
                      <Ionicons name="people-outline" size={13} color={COLORS.warmGray} />
                      <TouchableOpacity style={styles.servBtn} onPress={() => changeServings(recipe.id, recipe.servings, -1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="remove" size={14} color={COLORS.navy} />
                      </TouchableOpacity>
                      <Text style={styles.servVal}>{servingsFor(recipe.id, recipe.servings)}</Text>
                      <TouchableOpacity style={styles.servBtn} onPress={() => changeServings(recipe.id, recipe.servings, 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="add" size={14} color={COLORS.navy} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>

                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.actCook} onPress={() => router.push(`/cook/${recipe.id}?servings=${servingsFor(recipe.id, recipe.servings)}`)}>
                    <Ionicons name="restaurant" size={17} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.act, added && styles.actDone]}
                    onPress={() => toggleWeek(recipe.id)}
                  >
                    <Ionicons name={added ? 'checkmark' : 'calendar-outline'} size={17} color={added ? COLORS.green : COLORS.navy} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.act, inCart && styles.actDone]}
                    onPress={() => addToCart([recipe])}
                    disabled={inCart}
                  >
                    <Ionicons name={inCart ? 'checkmark' : 'cart-outline'} size={17} color={inCart ? COLORS.green : COLORS.navy} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.act} onPress={() => removeFavorite(recipe.id)}>
                    <Ionicons name="heart" size={17} color={COLORS.orange} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Assign-to-collection modal */}
      <Modal visible={!!assignFor} transparent animationType="fade" onRequestClose={() => setAssignFor(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setAssignFor(null)}>
          <TouchableOpacity style={styles.modalSheet} activeOpacity={1}>
            <Text style={styles.modalTitle}>Add to collection</Text>

            <View style={styles.modalChips}>
              {chipCollections.map(c => {
                const selected = assignFor ? collections[assignFor] === c : false;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.modalChip, selected && styles.modalChipActive]}
                    onPress={() => assignAndClose(c)}
                  >
                    <Text style={[styles.modalChipText, selected && styles.modalChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.newRow}>
              <TextInput
                style={styles.newInput}
                placeholder="New collection…"
                placeholderTextColor={COLORS.warmGray}
                value={newColl}
                onChangeText={setNewColl}
                onSubmitEditing={() => newColl.trim() && assignAndClose(newColl.trim())}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.newBtn, !newColl.trim() && styles.newBtnDisabled]}
                disabled={!newColl.trim()}
                onPress={() => assignAndClose(newColl.trim())}
              >
                <Text style={styles.newBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            {assignFor && collections[assignFor] && (
              <TouchableOpacity style={styles.removeColl} onPress={() => assignAndClose(null)}>
                <Ionicons name="close-circle-outline" size={16} color={COLORS.orange} />
                <Text style={styles.removeCollText}>Remove from collection</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F57C00', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  count: { fontSize: 13, color: '#888' },
  addAll: { fontSize: 13, color: '#F57C00', fontWeight: '700' },
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, marginHorizontal: 20, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardMain: { flex: 1, flexDirection: 'row' },
  cardImage: { width: 96, height: 96 },
  cardContent: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  cardMeta: { fontSize: 12, color: '#888', marginTop: 4 },
  cardHandle: { fontSize: 12, color: '#F57C00', fontWeight: '500', marginTop: 6 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', width: 90, alignItems: 'center', justifyContent: 'center', paddingRight: 8, gap: 6 },
  act: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F6F1EA', justifyContent: 'center', alignItems: 'center' },
  actCook: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F57C00', justifyContent: 'center', alignItems: 'center' },
  actDone: { backgroundColor: '#E8F5E9' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  emptySubtext: { fontSize: 14, color: '#888', marginTop: 6, textAlign: 'center' },
  discoverButton: { backgroundColor: '#F57C00', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 20 },
  discoverButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  // Collection filter chips
  chipsRow: { paddingHorizontal: 20, paddingBottom: 12, gap: 8, flexDirection: 'row' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  chipText: { fontSize: 13, color: COLORS.navy, fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  emptyCollText: { fontSize: 13, color: COLORS.warmGray, textAlign: 'center', paddingHorizontal: 30, paddingVertical: 24 },
  // Per-card collection tag
  collTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' },
  collTagText: { fontSize: 11, color: COLORS.warmGray, fontWeight: '600', maxWidth: 140 },
  collTagTextActive: { color: COLORS.orange },
  // Per-card servings stepper
  servRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  servBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#F6F1EA', justifyContent: 'center', alignItems: 'center' },
  servVal: { fontSize: 13, fontWeight: '700', color: COLORS.navy, minWidth: 16, textAlign: 'center' },
  // Assign modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(13,43,99,0.35)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: COLORS.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 40 },
  modalTitle: { fontFamily: 'Anton_400Regular', fontSize: 18, color: COLORS.navy, marginBottom: 16, letterSpacing: 0.3 },
  modalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.border },
  modalChipActive: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  modalChipText: { fontSize: 13, color: COLORS.navy, fontWeight: '600' },
  modalChipTextActive: { color: '#FFF' },
  newRow: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'center' },
  newInput: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: COLORS.charcoal },
  newBtn: { backgroundColor: COLORS.navy, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  newBtnDisabled: { opacity: 0.4 },
  newBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  removeColl: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  removeCollText: { fontSize: 13, color: COLORS.orange, fontWeight: '600' },
});
