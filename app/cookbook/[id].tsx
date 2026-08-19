import { useState, useEffect, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { fetchMyRecipeById, updateMyRecipe, myRecipeToRecipe, MyRecipe } from '../../lib/myRecipes';
import { addRecipesToShoppingList, describeAdd } from '../../lib/shopping';
import { DietaryTag, Ingredient } from '../../data/recipes';
import RecipeEditor, { EditableRecipe } from '../../components/RecipeEditor';
import { HEADER_TOP } from '../../lib/layout';
import { shareRecipe } from '../../lib/share';
import { Ionicons } from '@expo/vector-icons';
import { goBackOr } from '../../lib/nav';

export default function CookbookRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<MyRecipe | null>(null);
  const [loading, setLoading] = useState(true);
  // A brief confirmation, not a latch. This button used to disable itself on
  // the first press for the rest of the screen's life, so a second helping —
  // or a retry after clearing the list — was impossible, and the screen looked
  // like the feature had stopped working.
  const [addedToCart, setAddedToCart] = useState(false);
  const [draft, setDraft] = useState<EditableRecipe | null>(null); // non-null while editing
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    if (!recipe) return;
    setDraft({
      title: recipe.title,
      description: recipe.description,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      servings: recipe.servings,
      calories: recipe.calories,
      difficulty: recipe.difficulty,
      dietary: recipe.dietary,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      stepTimers: recipe.stepTimers,
      sourceUrl: recipe.sourceUrl ?? '',
    });
  };

  const saveEdits = async () => {
    if (!recipe || !draft) return;
    setSaving(true);
    const cleanDietary = draft.dietary.filter(d =>
      ['healthy', 'high-protein', 'gluten-free', 'vegetarian', 'vegan', 'dairy-free'].includes(d)
    ) as DietaryTag[];
    const sourceUrl = draft.sourceUrl?.trim() || undefined;
    const result = await updateMyRecipe(recipe.id, {
      title: draft.title,
      description: draft.description,
      prepTime: draft.prepTime,
      cookTime: draft.cookTime,
      servings: draft.servings,
      calories: draft.calories,
      difficulty: draft.difficulty,
      dietary: cleanDietary,
      ingredients: draft.ingredients as Ingredient[],
      steps: draft.steps,
      stepTimers: draft.stepTimers,
      sourceUrl,
    });
    setSaving(false);
    if ('error' in result) {
      Alert.alert('Error', result.error);
      return;
    }
    // Reflect the saved edits locally without a refetch.
    setRecipe({ ...recipe, ...draft, dietary: cleanDietary, sourceUrl });
    setDraft(null);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      const data = await fetchMyRecipeById(id);
      if (active) {
        setRecipe(data);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  // `source=mine` sends cook mode straight to my_recipes instead of making it
  // search every table for the id.
  const startCooking = () => {
    if (!recipe) return;
    router.push(`/cook/${recipe.id}?source=mine&servings=${recipe.servings}`);
  };

  const addToCart = async () => {
    if (!recipe) return;
    const result = await addRecipesToShoppingList([{ recipe: myRecipeToRecipe(recipe) }]);
    if ('error' in result) {
      Alert.alert('Error', result.error);
      return;
    }
    Alert.alert('Added to Cart! 🛒', describeAdd(result.added, result.merged, recipe.title, result), [
      { text: 'OK', style: 'cancel' },
      { text: 'View list', onPress: () => router.push('/shopping') },
    ]);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2500);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#F2701E" />
      </View>
    );
  }

  // Recipe not found (deleted, or bad id) — show a real screen, never a blank route.
  if (!recipe) {
    return (
      <View style={styles.container}>
        <Header title="Recipe" />
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🤔</Text>
          <Text style={styles.emptyTitle}>Recipe not found</Text>
          <Text style={styles.emptyText}>This recipe may have been deleted.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/cookbook')}>
            <Text style={styles.primaryButtonText}>Back to Cookbook</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Edit mode — reuse the same editor as the import review step.
  if (draft) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setDraft(null)} style={styles.backButton} disabled={saving}>
            <Text style={styles.backText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Recipe</Text>
          <TouchableOpacity onPress={saveEdits} style={styles.saveHeaderBtn} disabled={saving}>
            <Text style={styles.saveHeaderTxt}>{saving ? '…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.editBody}>
            <RecipeEditor value={draft} onChange={setDraft} />
            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  const totalTime = recipe.prepTime + recipe.cookTime;
  // No ingredients and no steps has two very different causes, and only one of
  // them is a failure: an import that came back empty (there's a source URL to
  // retry with), or a note the user wrote on purpose. Treating every empty
  // recipe as a broken import told people their own notes were a mistake.
  const hasStructure = recipe.ingredients.length > 0 || recipe.steps.length > 0;
  const failedImport = !hasStructure && !!recipe.sourceUrl && !recipe.description;
  const isNoteEntry = !hasStructure && !failedImport;

  return (
    <View style={styles.container}>
      <Header
        title="Recipe"
        right={
          <View style={styles.headerActions}>
            {/* Your own recipes live nowhere public, so this sends the whole
                thing as text rather than a link that would open nothing. */}
            <TouchableOpacity onPress={() => shareRecipe(myRecipeToRecipe(recipe), 'mine')}>
              <Ionicons name="share-outline" size={20} color="#F2701E" />
            </TouchableOpacity>
            <TouchableOpacity onPress={startEditing}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
        }
      />
      <ScrollView showsVerticalScrollIndicator={false}>
        {recipe.image ? (
          <Image source={{ uri: recipe.image }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroEmpty]}>
            <Text style={styles.heroEmptyIcon}>🍽️</Text>
          </View>
        )}

        <View style={styles.body}>
          <Text style={styles.title}>{recipe.title}</Text>
          {recipe.description ? <Text style={styles.description}>{recipe.description}</Text> : null}

          <View style={styles.metaRow}>
            <Meta value={totalTime > 0 ? `${totalTime}` : '—'} label="min" />
            <Meta value={`${recipe.servings}`} label="servings" />
            <Meta value={recipe.calories > 0 ? `${recipe.calories}` : '—'} label="cal" />
            <Meta value={recipe.difficulty} label="level" />
          </View>

          {recipe.sourceUrl ? (
            <TouchableOpacity
              style={styles.sourceLink}
              onPress={() => Linking.openURL(recipe.sourceUrl!)}
            >
              <Text style={styles.sourceLinkText}>📱 View original post</Text>
            </TouchableOpacity>
          ) : null}

          {/* Empty recipe: caption/video extraction produced no content */}
          {failedImport ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardTitle}>No recipe details yet</Text>
              <Text style={styles.emptyCardText}>
                We couldn't read ingredients or steps from this post — the caption was empty
                and the video couldn't be analysed. Re-import it using a screenshot for the best result.
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => router.replace('/cookbook/import')}
              >
                <Text style={styles.primaryButtonText}>Re-import with screenshot</Text>
              </TouchableOpacity>
            </View>
          ) : isNoteEntry ? (
            /* A note: free text, no structure. Still openable in cook mode as a
               readable card, and one tap away from becoming a real recipe. */
            <>
              <View style={styles.noteCard}>
                <Text style={styles.noteBody}>
                  {recipe.description || 'This note is empty. Tap Edit to write it.'}
                </Text>
              </View>
              {recipe.description ? (
                <TouchableOpacity style={styles.cookButton} onPress={startCooking}>
                  <Text style={styles.cookButtonText}>👨‍🍳 Open while cooking</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.ghostButton} onPress={startEditing}>
                <Text style={styles.ghostButtonText}>
                  Add ingredients and steps to make it cookable
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {recipe.ingredients.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Ingredients ({recipe.ingredients.length})</Text>
                  {recipe.ingredients.map((ing, i) => (
                    <View key={i} style={styles.ingredientRow}>
                      <Text style={styles.ingredientAmount}>
                        {ing.amount} {ing.unit}
                      </Text>
                      <Text style={styles.ingredientName}>{ing.name}</Text>
                    </View>
                  ))}
                </View>
              )}

              {recipe.steps.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Steps ({recipe.steps.length})</Text>
                  {recipe.steps.map((step, i) => (
                    <View key={i} style={styles.stepRow}>
                      <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.stepText}>{step}</Text>
                    </View>
                  ))}
                </View>
              )}

              {recipe.steps.length > 0 && (
                <TouchableOpacity style={styles.cookButton} onPress={startCooking}>
                  <Text style={styles.cookButtonText}>👨‍🍳 Start cooking</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.cartButton, addedToCart && styles.cartButtonAdded]}
                onPress={addToCart}
              >
                <Text style={styles.cartButtonText}>
                  {addedToCart ? '✓ Added to shopping list' : '🛒 Add to shopping list'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: 40 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => goBackOr('/cookbook')} style={styles.backButton}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

function Meta({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaValue}>{value}</Text>
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: HEADER_TOP,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },
  headerRight: { width: 60, alignItems: 'flex-end' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  editLink: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  saveHeaderBtn: { width: 60, alignItems: 'flex-end' },
  saveHeaderTxt: { fontSize: 16, color: '#F2701E', fontWeight: '700' },
  editBody: { padding: 20 },

  hero: { width: '100%', height: 240 },
  heroEmpty: { backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center' },
  heroEmptyIcon: { fontSize: 64 },

  body: { padding: 20 },
  title: { fontSize: 26, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  description: { fontSize: 15, color: '#666', lineHeight: 22, marginBottom: 16 },

  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 16,
  },
  metaItem: { alignItems: 'center' },
  metaValue: { fontSize: 18, fontWeight: '700', color: '#F2701E' },
  metaLabel: { fontSize: 12, color: '#888', marginTop: 2 },

  sourceLink: { marginBottom: 16 },
  sourceLinkText: { fontSize: 14, color: '#F2701E', fontWeight: '600' },

  emptyCard: {
    backgroundColor: '#FFF5F0',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  emptyCardTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  emptyCardText: { fontSize: 14, color: '#666', lineHeight: 21, marginBottom: 16 },

  section: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  ingredientRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  ingredientAmount: { width: 80, fontSize: 14, color: '#F2701E', fontWeight: '600' },
  ingredientName: { flex: 1, fontSize: 14, color: '#333' },
  stepRow: { flexDirection: 'row', marginBottom: 12 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F2701E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  stepText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },

  noteCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  noteBody: { fontSize: 16, color: '#333', lineHeight: 25 },

  cookButton: {
    backgroundColor: '#0D2B63',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  cookButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  ghostButton: { paddingVertical: 14, alignItems: 'center' },
  ghostButtonText: { color: '#F2701E', fontSize: 14, fontWeight: '600' },

  cartButton: {
    backgroundColor: '#F2701E',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
  },
  cartButtonAdded: { backgroundColor: '#3C8D40' },
  cartButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  emptyText: { fontSize: 14, color: '#888', marginTop: 6, textAlign: 'center' },
  primaryButton: {
    backgroundColor: '#F2701E',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  primaryButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
