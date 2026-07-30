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
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../lib/theme';
import { useFavorites } from '../lib/favorites';
import { useMealPlan, thisWeekKey } from '../lib/mealPlan';
import { addRecipesToShoppingList } from '../lib/shopping';

export default function FavoritesScreen() {
  const { favorites, removeFavorite } = useFavorites();
  const { addRecipeToWeek, plansByWeek, updateWeekPlan } = useMealPlan();
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());

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

          {favorites.map(recipe => {
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
                  </View>
                </TouchableOpacity>

                <View style={styles.cardActions}>
                  <TouchableOpacity style={styles.actCook} onPress={() => router.push(`/cook/${recipe.id}`)}>
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
});
