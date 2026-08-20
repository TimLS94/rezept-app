import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Recipe, DietaryTag, Ingredient, totalTime } from '../../../data/recipes';
import { fetchDbRecipeById, saveCookbookEdits, getCookbookEdits, applyEdits, CookbookEdits } from '../../../lib/recipes';
import { addRecipesToShoppingList, describeAdd } from '../../../lib/shopping';
import RecipeEditor, { EditableRecipe } from '../../../components/RecipeEditor';
import Paywall from '../../../components/Paywall';
import { shareRecipe } from '../../../lib/share';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../lib/auth';
import { HEADER_TOP } from '../../../lib/layout';

/**
 * View and edit a creator recipe that's in the user's cookbook.
 * Edits are stored locally (cookbook_edits table) and don't modify the original.
 */
export default function CookbookCreatorRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [edits, setEdits] = useState<CookbookEdits>({});
  const [loading, setLoading] = useState(true);
  const [addedToCart, setAddedToCart] = useState(false);
  const [draft, setDraft] = useState<EditableRecipe | null>(null);
  const { isPremium } = useAuth();
  const [showPaywall, setShowPaywall] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load recipe and any existing edits
  useEffect(() => {
    let active = true;
    (async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      const [recipeData, editsData] = await Promise.all([
        fetchDbRecipeById(id),
        getCookbookEdits(id),
      ]);
      if (active) {
        setRecipe(recipeData ?? null);
        setEdits(editsData);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  // The displayed recipe with edits applied
  const displayRecipe = recipe ? applyEdits(recipe, edits) : null;

  const startEditing = () => {
    // Editing a creator's recipe keeps a private patch over their original —
    // your salt, your oven, your swaps — and that is a Premium feature, the
    // same as bringing a recipe in from outside. Reading it is not gated.
    if (!isPremium) {
      setShowPaywall(true);
      return;
    }
    if (!displayRecipe) return;
    setDraft({
      title: displayRecipe.title,
      description: displayRecipe.description,
      prepTime: displayRecipe.prepTime,
      cookTime: displayRecipe.cookTime,
      servings: displayRecipe.servings,
      calories: displayRecipe.calories,
      nutrition: displayRecipe.nutrition,
      difficulty: displayRecipe.difficulty,
      dietary: displayRecipe.dietary,
      ingredients: displayRecipe.ingredients,
      steps: displayRecipe.steps,
      sourceUrl: '',
    });
  };

  const saveEditsToDb = async () => {
    if (!recipe || !draft) return;
    setSaving(true);
    const cleanDietary = draft.dietary.filter(d =>
      ['healthy', 'high-protein', 'gluten-free', 'vegetarian', 'vegan', 'dairy-free'].includes(d)
    ) as DietaryTag[];
    
    const newEdits: CookbookEdits = {
      title: draft.title,
      description: draft.description,
      prepTime: draft.prepTime,
      cookTime: draft.cookTime,
      servings: draft.servings,
      calories: draft.calories,
      nutrition: draft.nutrition,
      difficulty: draft.difficulty,
      dietary: cleanDietary,
      ingredients: draft.ingredients as Ingredient[],
      steps: draft.steps,
    };
    
    const result = await saveCookbookEdits(recipe.id, newEdits);
    setSaving(false);
    if ('error' in result) {
      Alert.alert('Error', result.error);
      return;
    }
    setEdits(newEdits);
    setDraft(null);
  };

  const resetToOriginal = () => {
    Alert.alert(
      'Reset to Original',
      'This will remove all your edits and restore the original recipe. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            if (!recipe) return;
            const result = await saveCookbookEdits(recipe.id, {});
            if ('ok' in result) {
              setEdits({});
              setDraft(null);
            }
          },
        },
      ]
    );
  };

  const startCooking = () => {
    if (!recipe) return;
    router.push(`/cook/${recipe.id}?source=creator&servings=${displayRecipe?.servings || recipe.servings}`);
  };

  const addToCart = async () => {
    if (!displayRecipe) return;

    // A locked recipe arrives with three teaser ingredients, so shopping from
    // it would produce a partial list that looks complete.
    if (displayRecipe.locked) {
      Alert.alert('Premium recipe', 'Join the membership to get the full ingredient list.');
      return;
    }
    if (displayRecipe.ingredients.length === 0) {
      Alert.alert('Nothing to shop for', 'This recipe has no ingredients listed.');
      return;
    }

    // The result used to be thrown away entirely: this showed "✓ Added" no
    // matter what happened, so a rejected write looked like a success and the
    // list stayed empty. That is what "adding from the cookbook does nothing"
    // was.
    const result = await addRecipesToShoppingList([{ recipe: displayRecipe }]);
    if ('error' in result) {
      if (result.error === 'not-authenticated') {
        Alert.alert('Sign in required', 'Sign in to save your shopping list.');
        return;
      }
      Alert.alert('Could not add to the list', result.error);
      return;
    }

    Alert.alert('Added 🛒', describeAdd(result.added, result.merged, displayRecipe.title, result), [
      { text: 'OK', style: 'cancel' },
      { text: 'View list', onPress: () => router.push('/shopping') },
    ]);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2500);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F2701E" />
      </View>
    );
  }

  if (!recipe || !displayRecipe) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Recipe not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Editing mode
  if (draft) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setDraft(null)} style={styles.headerBack} disabled={saving}>
            <Text style={styles.headerBackText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Recipe</Text>
          <TouchableOpacity onPress={saveEditsToDb} style={styles.saveButton} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? '...' : 'Save'}</Text>
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

  const hasEdits = Object.keys(edits).length > 0;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
            <Text style={styles.headerBackText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => displayRecipe && shareRecipe(displayRecipe, 'creator')}
            style={styles.editButton}
          >
            <Ionicons name="share-outline" size={19} color="#F2701E" />
          </TouchableOpacity>
          <TouchableOpacity onPress={startEditing} style={styles.editButton}>
            <Text style={styles.editButtonText}>✏️ Edit{!isPremium && ' ✨'}</Text>
          </TouchableOpacity>
        </View>

        {/* Image */}
        {displayRecipe.image ? (
          <Image source={{ uri: displayRecipe.image }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderText}>🍽️</Text>
          </View>
        )}

        {/* Title & Meta */}
        <View style={styles.content}>
          <Text style={styles.title}>{displayRecipe.title}</Text>
          
          {hasEdits && (
            <View style={styles.editedBadge}>
              <Text style={styles.editedBadgeText}>✏️ Edited</Text>
              <TouchableOpacity onPress={resetToOriginal}>
                <Text style={styles.resetLink}>Reset to original</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Creator info */}
          <TouchableOpacity 
            style={styles.creatorRow}
            onPress={() => router.push(`/creator/${recipe.influencer.id || recipe.influencer.handle.replace(/^@/, '')}`)}
          >
            {recipe.influencer.avatar && (
              <Image source={{ uri: recipe.influencer.avatar }} style={styles.creatorAvatar} />
            )}
            <View>
              <Text style={styles.creatorName}>{recipe.influencer.name}</Text>
              <Text style={styles.creatorHandle}>{recipe.influencer.handle}</Text>
            </View>
          </TouchableOpacity>

          {displayRecipe.description ? (
            <Text style={styles.description}>{displayRecipe.description}</Text>
          ) : null}

          {/* Time & Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{displayRecipe.prepTime}</Text>
              <Text style={styles.statLabel}>Prep (min)</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{displayRecipe.cookTime}</Text>
              <Text style={styles.statLabel}>Cook (min)</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: '#F2701E' }]}>{totalTime(displayRecipe)}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{displayRecipe.servings}</Text>
              <Text style={styles.statLabel}>Servings</Text>
            </View>
          </View>

          {/* Dietary tags */}
          {displayRecipe.dietary.length > 0 && (
            <View style={styles.tagsRow}>
              {displayRecipe.dietary.map(tag => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Ingredients */}
          <Text style={styles.sectionTitle}>Ingredients</Text>
          {displayRecipe.ingredients.map((ing, i) => (
            <View key={i} style={styles.ingredientRow}>
              <Text style={styles.ingredientAmount}>{ing.amount} {ing.unit}</Text>
              <Text style={styles.ingredientName}>{ing.name}</Text>
            </View>
          ))}

          {/* Steps. A saved recipe is re-checked against the paywall on every
              read, so one the creator has since made paid arrives here without
              its steps — say so rather than showing an empty list. */}
          <Text style={styles.sectionTitle}>Instructions</Text>
          {displayRecipe.locked ? (
            <View style={styles.lockedNote}>
              <Text style={styles.lockedNoteIcon}>🔒</Text>
              <Text style={styles.lockedNoteTitle}>This one is premium now</Text>
              <Text style={styles.lockedNoteText}>
                {displayRecipe.influencer.name} has made this a paid recipe since you saved it.
                Join their membership to cook it.
              </Text>
              <TouchableOpacity
                style={styles.lockedNoteBtn}
                onPress={() => router.push(`/recipe/${displayRecipe.id}`)}
              >
                <Text style={styles.lockedNoteBtnText}>See the options</Text>
              </TouchableOpacity>
            </View>
          ) : (
            displayRecipe.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.cookButton} onPress={startCooking}>
          <Text style={styles.cookButtonText}>👨‍🍳 Cook</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.cartButton, addedToCart && styles.cartButtonDone]} 
          onPress={addToCart}
          disabled={addedToCart}
        >
          <Text style={[styles.cartButtonText, addedToCart && styles.cartButtonTextDone]}>
            {addedToCart ? '✓ Added' : '🛒 Shopping List'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* The paywall reloads the auth context itself, so this only has to
          close and re-open the editor the user was reaching for. */}
      <Paywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSubscribed={() => { setShowPaywall(false); startEditing(); }}
        creatorName={recipe?.influencer?.name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF9F2' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF9F2' },
  errorText: { fontSize: 18, color: '#888', marginBottom: 20 },
  backButton: { padding: 12 },
  backButtonText: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: HEADER_TOP,
    paddingBottom: 12,
    backgroundColor: '#FFF',
  },
  headerBack: {},
  headerBackText: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  saveButton: { backgroundColor: '#F2701E', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  saveButtonText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  editBody: { padding: 20 },
  editButton: { backgroundColor: '#F5F5F5', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  editButtonText: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  image: { width: '100%', height: 250 },
  imagePlaceholder: { backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderText: { fontSize: 64 },
  content: { padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  editedBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFF5E6', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 8,
    marginBottom: 16,
    gap: 12,
  },
  editedBadgeText: { fontSize: 13, color: '#F2701E', fontWeight: '600' },
  resetLink: { fontSize: 13, color: '#888', textDecorationLine: 'underline' },
  creatorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
  creatorAvatar: { width: 40, height: 40, borderRadius: 20 },
  creatorName: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  creatorHandle: { fontSize: 12, color: '#888' },
  description: { fontSize: 15, color: '#666', lineHeight: 22, marginBottom: 16 },
  statsRow: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 4 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  tag: { backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  tagText: { fontSize: 12, color: '#3C8D40', fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginTop: 8, marginBottom: 16 },
  ingredientRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  ingredientAmount: { width: 100, fontSize: 14, fontWeight: '600', color: '#F2701E' },
  ingredientName: { flex: 1, fontSize: 15, color: '#1A1A1A' },
  lockedNote: {
    backgroundColor: '#FFF3E9',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginTop: 4,
  },
  lockedNoteIcon: { fontSize: 34, marginBottom: 8 },
  lockedNoteTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  lockedNoteText: { fontSize: 13, color: '#8A4B1E', textAlign: 'center', lineHeight: 19, marginTop: 6 },
  lockedNoteBtn: {
    backgroundColor: '#F2701E',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 14,
  },
  lockedNoteBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  stepRow: { flexDirection: 'row', marginBottom: 16 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F2701E', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stepNumberText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  stepText: { flex: 1, fontSize: 15, color: '#1A1A1A', lineHeight: 22 },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    gap: 12,
  },
  cookButton: { flex: 1, backgroundColor: '#0D2B63', padding: 16, borderRadius: 14, alignItems: 'center' },
  cookButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  cartButton: { flex: 1.3, backgroundColor: '#F2701E', padding: 16, borderRadius: 14, alignItems: 'center' },
  cartButtonDone: { backgroundColor: '#E8F5E9' },
  cartButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  cartButtonTextDone: { color: '#3C8D40' },
});
