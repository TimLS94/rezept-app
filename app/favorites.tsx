import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useFavorites } from '../lib/favorites';
import { useMealPlan, thisWeekKey } from '../lib/mealPlan';
import { addRecipesToShoppingList } from '../lib/shopping';

export default function FavoritesScreen() {
  const { favorites, removeFavorite } = useFavorites();
  const { addRecipeToWeek } = useMealPlan();
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());

  const markAdded = (ids: string[]) =>
    setAddedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });

  const markInCart = (ids: string[]) =>
    setCartIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });

  const addToWeek = (id: string) => {
    const recipe = favorites.find(r => r.id === id);
    if (!recipe) return;
    addRecipeToWeek(thisWeekKey(), recipe);
    markAdded([id]);
  };

  const addAllToWeek = () => {
    favorites.forEach(r => addRecipeToWeek(thisWeekKey(), r));
    markAdded(favorites.map(r => r.id));
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

          {favorites.map(recipe => {
            const added = addedIds.has(recipe.id);
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
                  </View>
                </TouchableOpacity>

                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.cookButton} onPress={() => router.push(`/cook/${recipe.id}`)}>
                    <Text style={styles.cookButtonText}>👨‍🍳 Cook</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.planButton, added && styles.planButtonAdded]}
                    onPress={() => addToWeek(recipe.id)}
                    disabled={added}
                  >
                    <Text style={[styles.planButtonText, added && styles.planButtonTextAdded]}>
                      {added ? '✓ In plan' : '+ This week'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cartButton, inCart && styles.cartButtonAdded]}
                    onPress={() => addToCart([recipe])}
                    disabled={inCart}
                  >
                    <Text style={[styles.cartButtonText, inCart && styles.cartButtonTextAdded]}>
                      {inCart ? '✓ In cart' : '🛒 Cart'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.removeButton} onPress={() => removeFavorite(recipe.id)}>
                    <Text style={styles.removeButtonText}>♥</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#FF6B35', fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  count: { fontSize: 13, color: '#888' },
  addAll: { fontSize: 13, color: '#FF6B35', fontWeight: '700' },
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, marginHorizontal: 20, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardMain: { flex: 1, flexDirection: 'row' },
  cardImage: { width: 96, height: 96 },
  cardContent: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  cardMeta: { fontSize: 12, color: '#888', marginTop: 4 },
  cardHandle: { fontSize: 12, color: '#FF6B35', fontWeight: '500', marginTop: 6 },
  cardActions: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, gap: 6 },
  cookButton: { backgroundColor: '#FF6B35', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  cookButtonText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  planButton: { backgroundColor: '#FFF0EA', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#FFD3C2' },
  planButtonAdded: { backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' },
  planButtonText: { fontSize: 12, fontWeight: '700', color: '#FF6B35' },
  planButtonTextAdded: { color: '#2E7D32' },
  cartButton: { backgroundColor: '#EAF2FF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#C2D8FF' },
  cartButtonAdded: { backgroundColor: '#E8F5E9', borderColor: '#C8E6C9' },
  cartButtonText: { fontSize: 12, fontWeight: '700', color: '#2F6FED' },
  cartButtonTextAdded: { color: '#2E7D32' },
  removeButton: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  removeButtonText: { fontSize: 18, color: '#FF6B35' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  emptySubtext: { fontSize: 14, color: '#888', marginTop: 6, textAlign: 'center' },
  discoverButton: { backgroundColor: '#FF6B35', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 20 },
  discoverButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
