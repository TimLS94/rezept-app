import { useState, useCallback } from 'react';
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
import {
  fetchCookbookCreatorRecipes,
  removeRecipeFromCookbook,
  CookbookCreatorRecipe,
} from '../../lib/recipes';
import { addRecipesToShoppingList } from '../../lib/shopping';
import { useAuth } from '../../lib/auth';

// Two kinds of thing live in a cookbook, and they behave differently: what you
// wrote (yours, editable, deletable) and what you got from a creator (theirs,
// read-only, kept because you paid for it). One list mixing both would need an
// exception on every action, so they get a tab each.
type Tab = 'mine' | 'creators';

export default function CookbookScreen() {
  const { user, isGuest } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');
  const [recipes, setRecipes] = useState<MyRecipe[]>([]);
  const [owned, setOwned] = useState<CookbookCreatorRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());

  // Both tabs load together, in one round trip's worth of time — switching tabs
  // should never be a loading spinner.
  const loadRecipes = async () => {
    const [mine, bought] = await Promise.all([fetchMyRecipes(), fetchCookbookCreatorRecipes()]);
    setRecipes(mine);
    setOwned(bought);
    setLoading(false);
  };

  // useFocusEffect already fires on mount, so a separate mount effect would
  // just fetch the same list twice on the way in.
  useFocusEffect(
    useCallback(() => {
      if (!isGuest) loadRecipes();
      else setLoading(false);
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

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'mine' && styles.tabActive]}
          onPress={() => setTab('mine')}
        >
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>
            My recipes{recipes.length ? ` (${recipes.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'creators' && styles.tabActive]}
          onPress={() => setTab('creators')}
        >
          <Text style={[styles.tabText, tab === 'creators' && styles.tabTextActive]}>
            From creators{owned.length ? ` (${owned.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#F2701E" />
        </View>
      ) : tab === 'creators' ? (
        <CreatorsTab
          recipes={owned}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onRemoved={id => setOwned(prev => prev.filter(r => r.id !== id))}
        />
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
            onPress={() => router.push('/cookbook/new')}
          >
            <Text style={styles.secondaryButtonText}>✏️ Write your own</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F2701E" />
          }
        >
          <View style={styles.topRow}>
            <Text style={styles.count}>
              {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}
            </Text>
            <View style={styles.topLinks}>
              <TouchableOpacity onPress={() => router.push('/cookbook/new')}>
                <Text style={styles.importLink}>+ Write</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/cookbook/import')}>
                <Text style={styles.importLink}>+ Import</Text>
              </TouchableOpacity>
            </View>
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
                    {/* "0 min • 4 servings" is noise on a note nobody filled
                        those in for — say what it actually is instead. */}
                    <Text style={styles.cardMeta}>
                      {recipe.ingredients.length === 0 && recipe.steps.length === 0
                        ? '📝 Note'
                        : `${recipe.prepTime + recipe.cookTime} min • ${recipe.servings} servings`}
                    </Text>
                    {recipe.sourceUrl && (
                      <Text style={styles.cardSource}>📱 Imported</Text>
                    )}
                  </View>
                </TouchableOpacity>

                <View style={styles.cardActions}>
                  {/* Nothing to shop for on a note — the button would report
                      "0 items added" and look broken. */}
                  <TouchableOpacity
                    style={[
                      styles.cartButton,
                      inCart && styles.cartButtonAdded,
                      recipe.ingredients.length === 0 && styles.cartButtonDisabled,
                    ]}
                    onPress={() => addToCart(recipe)}
                    disabled={inCart || recipe.ingredients.length === 0}
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

/**
 * Recipes from creators — bought and saved for free alike. They belong to their
 * author, so nothing here is editable ("Save an editable copy" on the recipe
 * screen makes a copy in My recipes instead). A free save can be removed; a
 * purchase cannot, because removing it would throw away something paid for.
 */
function CreatorsTab({
  recipes,
  refreshing,
  onRefresh,
  onRemoved,
}: {
  recipes: CookbookCreatorRecipe[];
  refreshing: boolean;
  onRefresh: () => void;
  onRemoved: (id: string) => void;
}) {
  // Filter by creator. Only worth showing once there's more than one — a chip
  // row with a single chip is just clutter.
  const [creator, setCreator] = useState<string | null>(null);

  const creators = Array.from(
    new Map(recipes.map(r => [r.influencer.id || r.influencer.handle, r.influencer])).values()
  );
  const shown = creator
    ? recipes.filter(r => (r.influencer.id || r.influencer.handle) === creator)
    : recipes;

  const remove = (recipe: CookbookCreatorRecipe) => {
    Alert.alert(
      'Remove from cookbook',
      `Remove "${recipe.title}"? You can save it again any time.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await removeRecipeFromCookbook(recipe.id);
            if ('error' in result) {
              Alert.alert('Error', result.error);
              return;
            }
            onRemoved(recipe.id);
          },
        },
      ]
    );
  };

  if (recipes.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>🔖</Text>
        <Text style={styles.emptyText}>No creator recipes yet</Text>
        <Text style={styles.emptySubtext}>
          Save any free recipe to keep it here. Recipes you buy stay yours
          forever — even if the creator takes them down later.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/search')}>
          <Text style={styles.primaryButtonText}>Browse creators</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#F2701E" />
      }
    >
      {creators.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <TouchableOpacity
            style={[styles.chip, !creator && styles.chipActive]}
            onPress={() => setCreator(null)}
          >
            <Text style={[styles.chipText, !creator && styles.chipTextActive]}>All</Text>
          </TouchableOpacity>
          {creators.map(c => {
            const key = c.id || c.handle;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.chip, creator === key && styles.chipActive]}
                onPress={() => setCreator(creator === key ? null : key)}
              >
                <Text style={[styles.chipText, creator === key && styles.chipTextActive]}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.topRow}>
        <Text style={styles.count}>
          {shown.length} {shown.length === 1 ? 'recipe' : 'recipes'}
        </Text>
      </View>

      {shown.map(recipe => (
        <View key={recipe.id} style={styles.card}>
          <TouchableOpacity
            style={styles.cardMain}
            activeOpacity={0.8}
            onPress={() => router.push(`/recipe/${recipe.id}`)}
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
                {recipe.influencer.name}
                {recipe.purchased ? ' · Purchased' : ''}
              </Text>
              {/* The creator pulled it. Say so plainly — the copy still works,
                  but it will never get their updates again. */}
              {!recipe.available && (
                <Text style={styles.cardGone}>Removed by creator · your copy</Text>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.cartButton}
              onPress={() =>
                router.push(`/cook/${recipe.id}?source=purchase&servings=${recipe.servings}`)
              }
            >
              <Text style={styles.cartButtonText}>👨‍🍳</Text>
            </TouchableOpacity>
            {/* No remove button on a purchase — see the comment above. */}
            {!recipe.purchased && (
              <TouchableOpacity style={styles.deleteButton} onPress={() => remove(recipe)}>
                <Text style={styles.deleteButtonText}>🗑️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#F2701E' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#999' },
  tabTextActive: { color: '#0D2B63' },
  cardGone: { fontSize: 11, color: '#B0402A', fontWeight: '600', marginTop: 4 },
  chipRow: { paddingHorizontal: 20, paddingTop: 14, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EDE3D6',
  },
  chipActive: { backgroundColor: '#0D2B63', borderColor: '#0D2B63' },
  chipText: { fontSize: 13, color: '#666', fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
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
  backText: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },
  addButton: { width: 60, alignItems: 'flex-end' },
  addButtonText: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  loadingState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  emptySubtext: { fontSize: 14, color: '#888', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  primaryButton: {
    backgroundColor: '#F2701E',
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
  topLinks: { flexDirection: 'row', gap: 18 },
  importLink: { fontSize: 13, color: '#F2701E', fontWeight: '700' },
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
  cardSource: { fontSize: 11, color: '#F2701E', fontWeight: '500', marginTop: 4 },
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
  cartButtonDisabled: { opacity: 0.3 },
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
