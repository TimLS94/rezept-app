import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { fetchMyRecipes, deleteMyRecipe, myRecipeToRecipe, MyRecipe } from '../../lib/myRecipes';
import { addRecipesToShoppingList } from '../../lib/shopping';
import { useAuth } from '../../lib/auth';

export default function CookbookScreen() {
  const { user, isGuest } = useAuth();
  const [recipes, setRecipes] = useState<MyRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());

  const loadRecipes = async () => {
    const data = await fetchMyRecipes();
    setRecipes(data);
    setLoading(false);
  };

  useEffect(() => {
    if (!isGuest) loadRecipes();
    else setLoading(false);
  }, [isGuest]);

  useFocusEffect(
    useCallback(() => {
      if (!isGuest) loadRecipes();
    }, [isGuest])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRecipes();
    setRefreshing(false);
  };

  const handleDelete = (recipe: MyRecipe) => {
    Alert.alert(
      'Delete Recipe',
      `Remove "${recipe.title}" from your cookbook?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteMyRecipe(recipe.id);
            if (result.success) {
              setRecipes(prev => prev.filter(r => r.id !== recipe.id));
            } else {
              Alert.alert('Error', result.error || 'Could not delete recipe');
            }
          },
        },
      ]
    );
  };

  const addToCart = async (recipe: MyRecipe) => {
    const recipeFormat = myRecipeToRecipe(recipe);
    const result = await addRecipesToShoppingList([{ recipe: recipeFormat }]);
    
    if ('error' in result) {
      Alert.alert('Error', result.error);
      return;
    }

    setCartIds(prev => new Set(prev).add(recipe.id));
    Alert.alert(
      'Added to Cart! 🛒',
      `${result.added} items added`,
      [
        { text: 'Done', style: 'cancel' },
        { text: 'View Cart', onPress: () => router.push('/shopping') },
      ]
    );
  };

  // Guest state
  if (isGuest) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Cookbook</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyText}>Sign in to save recipes</Text>
          <Text style={styles.emptySubtext}>
            Create your personal cookbook with imported and custom recipes
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/login')}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Cookbook</Text>
        <TouchableOpacity onPress={() => router.push('/cookbook/import')} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#F57C00" />
        </View>
      ) : recipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyText}>Your cookbook is empty</Text>
          <Text style={styles.emptySubtext}>
            Import recipes from Instagram or add your own
          </Text>
          <TouchableOpacity 
            style={styles.primaryButton} 
            onPress={() => router.push('/cookbook/import')}
          >
            <Text style={styles.primaryButtonText}>📱 Import from Instagram</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/cookbook/import')}
          >
            <Text style={styles.secondaryButtonText}>✏️ Add manually</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F57C00" />
          }
        >
          <View style={styles.topRow}>
            <Text style={styles.count}>
              {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
            </Text>
            <TouchableOpacity onPress={() => router.push('/cookbook/import')}>
              <Text style={styles.importLink}>+ Import</Text>
            </TouchableOpacity>
          </View>

          {recipes.map(recipe => {
            const inCart = cartIds.has(recipe.id);
            return (
              <View key={recipe.id} style={styles.card}>
                <TouchableOpacity
                  style={styles.cardMain}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/cookbook/${recipe.id}`)}
                >
                  {recipe.image ? (
                    <Image source={{ uri: recipe.image }} style={styles.cardImage} />
                  ) : (
                    <View style={[styles.cardImage, styles.cardImageEmpty]}>
                      <Text style={styles.cardImageEmptyText}>🍽️</Text>
                    </View>
                  )}
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{recipe.title}</Text>
                    <Text style={styles.cardMeta}>
                      {recipe.prepTime + recipe.cookTime} min • {recipe.servings} servings
                    </Text>
                    {recipe.sourceUrl && (
                      <Text style={styles.cardSource}>📱 Imported</Text>
                    )}
                  </View>
                </TouchableOpacity>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.cartButton, inCart && styles.cartButtonAdded]}
                    onPress={() => addToCart(recipe)}
                    disabled={inCart}
                  >
                    <Text style={[styles.cartButtonText, inCart && styles.cartButtonTextAdded]}>
                      {inCart ? '✓' : '🛒'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(recipe)}
                  >
                    <Text style={styles.deleteButtonText}>🗑️</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F57C00', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },
  addButton: { width: 60, alignItems: 'flex-end' },
  addButtonText: { fontSize: 16, color: '#F57C00', fontWeight: '600' },
  loadingState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  emptySubtext: { fontSize: 14, color: '#888', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  primaryButton: {
    backgroundColor: '#F57C00',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 24,
  },
  primaryButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 12,
  },
  secondaryButtonText: { color: '#666', fontSize: 16, fontWeight: '600' },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  count: { fontSize: 13, color: '#888' },
  importLink: { fontSize: 13, color: '#F57C00', fontWeight: '700' },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardMain: { flex: 1, flexDirection: 'row' },
  cardImage: { width: 96, height: 96 },
  cardImageEmpty: { backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  cardImageEmptyText: { fontSize: 32 },
  cardContent: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  cardMeta: { fontSize: 12, color: '#888', marginTop: 4 },
  cardSource: { fontSize: 11, color: '#F57C00', fontWeight: '500', marginTop: 4 },
  cardActions: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, gap: 8 },
  cartButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E9EEF8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartButtonAdded: { backgroundColor: '#E8F5E9' },
  cartButtonText: { fontSize: 18 },
  cartButtonTextAdded: { color: '#3C8D40' },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: { fontSize: 16 },
});
