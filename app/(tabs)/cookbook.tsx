import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { DIETARY_TAGS, DietaryTag } from '../../data/recipes';
import { router, useFocusEffect } from 'expo-router';
import { fetchMyRecipes, deleteMyRecipe, myRecipeToRecipe, MyRecipe } from '../../lib/myRecipes';
import {
  fetchCookbookCreatorRecipes,
  removeRecipeFromCookbook,
  CookbookCreatorRecipe,
} from '../../lib/recipes';
import { addRecipesToShoppingList } from '../../lib/shopping';
import { useAuth } from '../../lib/auth';
import Paywall from '../../components/Paywall';
import RecipeActions from '../../components/RecipeActions';
import ServingsStepper from '../../components/ServingsStepper';
import { getAllServings, setServings as setServingsStore } from '../../lib/servings';
import { getFamilyServings } from '../../lib/family';
import { HEADER_TOP } from '../../lib/layout';

// Two kinds of thing live in a cookbook, and they behave differently: what you
// wrote (yours, editable, deletable) and what you got from a creator (theirs,
// read-only, kept because you paid for it). One list mixing both would need an
// exception on every action, so they get a tab each.
type Tab = 'mine' | 'creators';

export default function CookbookScreen() {
  const { user, isGuest, isPremium, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');
  const [recipes, setRecipes] = useState<MyRecipe[]>([]);
  const [owned, setOwned] = useState<CookbookCreatorRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  // Portion counts are remembered per recipe and shared with favourites and
  // cook mode — the same recipe should not ask "how many?" twice.
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<DietaryTag[]>([]);
  const [servingsMap, setServingsMap] = useState<Record<string, number>>({});
  const [familyServings, setFamilyServings] = useState<number | null>(null);

  useEffect(() => {
    getAllServings().then(setServingsMap).catch(() => {});
    getFamilyServings().then(setFamilyServings).catch(() => {});
  }, []);

  // Search covers the title and the description, because a note's whole
  // content is its description — searching only titles would make notes
  // findable by name alone, which is the one thing you may not remember.
  const matches = (r: { title: string; description: string; dietary: DietaryTag[] }) => {
    const q = query.trim().toLowerCase();
    const hitsQuery =
      q === '' || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    return hitsQuery && activeFilters.every(tag => r.dietary.includes(tag));
  };

  const shownRecipes = recipes.filter(matches);

  const toggleFilter = (tag: DietaryTag) =>
    setActiveFilters(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));

  const servingsFor = (id: string, base: number) => servingsMap[id] ?? base;
  const setServingsExact = (id: string, val: number) => {
    const next = Math.max(1, val);
    setServingsMap(prev => ({ ...prev, [id]: next }));
    setServingsStore(id, next);
  };

  // Handle import button press - check premium status
  const handleImportPress = () => {
    if (isPremium) {
      router.push('/cookbook/import');
    } else {
      setShowPaywall(true);
    }
  };

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
        <Text style={styles.headerTitle}>Cookbook</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/discover')} style={styles.addButton}>
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

      {!loading && tab === 'mine' && recipes.length > 0 && (
        <View style={styles.findBar}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#9A9A9A" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search your recipes and notes"
              placeholderTextColor="#AAA"
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {DIETARY_TAGS.map(tag => {
              const active = activeFilters.includes(tag.id);
              return (
                <TouchableOpacity
                  key={tag.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleFilter(tag.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {tag.icon} {tag.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#F2701E" />
        </View>
      ) : tab === 'creators' ? (
        <CreatorsTab
          recipes={owned}
          refreshing={refreshing}
          onRefresh={onRefresh}
          servingsFor={servingsFor}
          setServingsExact={setServingsExact}
          familyServings={familyServings}
          onRemoved={id => setOwned(prev => prev.filter(r => r.id !== id))}
        />
      ) : shownRecipes.length === 0 && recipes.length > 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyText}>Nothing matches</Text>
          <Text style={styles.emptySubtext}>
            No recipe here matches that search or those filters.
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => { setQuery(''); setActiveFilters([]); }}
          >
            <Text style={styles.secondaryButtonText}>Clear search and filters</Text>
          </TouchableOpacity>
        </View>
      ) : recipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyText}>Your cookbook is empty</Text>
          <Text style={styles.emptySubtext}>
            Add recipes from photos, text, or write your own
          </Text>
          <View style={styles.emptyActions}>
            <TouchableOpacity 
              style={styles.emptyActionButton} 
              onPress={handleImportPress}
            >
              <Text style={styles.emptyActionIcon}>🖼️</Text>
              <Text style={styles.emptyActionText}>Gallery</Text>
              {!isPremium && <Text style={styles.premiumBadge}>✨</Text>}
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.emptyActionButton} 
              onPress={handleImportPress}
            >
              <Text style={styles.emptyActionIcon}>📷</Text>
              <Text style={styles.emptyActionText}>Camera</Text>
              {!isPremium && <Text style={styles.premiumBadge}>✨</Text>}
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.emptyActionButton} 
              onPress={handleImportPress}
            >
              <Text style={styles.emptyActionIcon}>📝</Text>
              <Text style={styles.emptyActionText}>Text</Text>
              {!isPremium && <Text style={styles.premiumBadge}>✨</Text>}
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.emptyActionButton} 
              onPress={() => router.push('/cookbook/new')}
            >
              <Text style={styles.emptyActionIcon}>✏️</Text>
              <Text style={styles.emptyActionText}>Write</Text>
              <Text style={styles.freeBadge}>Free</Text>
            </TouchableOpacity>
          </View>
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
              {shownRecipes.length === recipes.length
                ? `${recipes.length} ${recipes.length === 1 ? 'recipe' : 'recipes'}`
                : `${shownRecipes.length} of ${recipes.length}`}
            </Text>
            <View style={styles.topLinks}>
              <TouchableOpacity onPress={() => router.push('/cookbook/new')}>
                <Text style={styles.importLink}>+ Write</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleImportPress}>
                <Text style={styles.importLink}>+ Import {!isPremium && '✨'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {shownRecipes.map(recipe => {
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
                    {/* Say what the recipe actually is. A note gets called a
                        note, and "0 min" — which is just a field nobody
                        filled in — is left out rather than printed as a fact. */}
                    <Text style={styles.cardMeta}>
                      {[
                        recipe.ingredients.length === 0 && recipe.steps.length === 0
                          ? '📝 Note'
                          : null,
                        recipe.prepTime + recipe.cookTime > 0
                          ? `${recipe.prepTime + recipe.cookTime} min`
                          : null,
                        recipe.steps.length > 0 ? `${recipe.steps.length} steps` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Tap to add details'}
                    </Text>
                    {recipe.sourceUrl && (
                      <Text style={styles.cardSource}>📱 Imported</Text>
                    )}
                    <ServingsStepper
                      value={servingsFor(recipe.id, recipe.servings)}
                      onChange={n => setServingsExact(recipe.id, n)}
                      familyServings={familyServings}
                    />
                  </View>
                </TouchableOpacity>

                <RecipeActions
                  recipe={myRecipeToRecipe(recipe)}
                  source="mine"
                  servings={servingsFor(recipe.id, recipe.servings)}
                  onRemove={() => handleDelete(recipe)}
                />
              </View>
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Paywall for import features */}
      <Paywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSubscribed={refresh}
      />
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
  servingsFor,
  setServingsExact,
  familyServings,
}: {
  recipes: CookbookCreatorRecipe[];
  refreshing: boolean;
  onRefresh: () => void;
  onRemoved: (id: string) => void;
  servingsFor: (id: string, base: number) => number;
  setServingsExact: (id: string, val: number) => void;
  familyServings: number | null;
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
          Tap 📖 on any recipe to add it to your cookbook.
          Recipes you buy stay yours forever.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(tabs)/discover')}>
          <Text style={styles.primaryButtonText}>🔥 Discover Recipes</Text>
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
            onPress={() => router.push(`/cookbook/creator/${recipe.id}`)}
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
              <ServingsStepper
                value={servingsFor(recipe.id, recipe.servings)}
                onChange={n => setServingsExact(recipe.id, n)}
                familyServings={familyServings}
              />
            </View>
          </TouchableOpacity>

          {/* No remove button on a purchase: removing it would throw away
              something the user paid for. */}
          <RecipeActions
            recipe={recipe}
            source={recipe.purchased ? 'purchase' : 'creator'}
            servings={servingsFor(recipe.id, recipe.servings)}
            onRemove={recipe.purchased ? undefined : () => remove(recipe)}
            removeIcon="bookmark"
          />
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
    paddingTop: HEADER_TOP,
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
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 24 },
  emptyActionButton: { width: 72, height: 72, backgroundColor: '#FFF', borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  emptyActionIcon: { fontSize: 24, marginBottom: 4 },
  emptyActionText: { fontSize: 11, fontWeight: '600', color: '#666' },
  premiumBadge: { position: 'absolute', top: 4, right: 4, fontSize: 10 },
  freeBadge: { position: 'absolute', top: 4, right: 4, fontSize: 8, color: '#3C8D40', fontWeight: '700' },
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
  findBar: { paddingTop: 12, backgroundColor: '#FFF9F2' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EFE7DC',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A1A', paddingVertical: 0 },
  importLink: { fontSize: 13, color: '#F2701E', fontWeight: '700' },
  card: {
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
  cardMain: { flexDirection: 'row', alignItems: 'center' },
  cardImage: { width: 84, height: 84, borderRadius: 12, margin: 10 },
  cardImageEmpty: { backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  cardImageEmptyText: { fontSize: 32 },
  cardContent: { flex: 1, paddingRight: 12, paddingVertical: 10, justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  cardMeta: { fontSize: 12, color: '#888', marginTop: 4 },
  cardSource: { fontSize: 11, color: '#F2701E', fontWeight: '500', marginTop: 4 },
});
