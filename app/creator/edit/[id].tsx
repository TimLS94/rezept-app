import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase, updateByIdTolerant } from '../../../lib/supabase';
import { pickAndUploadImage } from '../../../lib/storage';
import { DIETARY_TAGS, Recipe, CUISINES } from '../../../data/recipes';
import NutritionFields from '../../../components/NutritionFields';
import ChipMultiSelect from '../../../components/ChipMultiSelect';
import EquipmentList, { cleanEquipment } from '../../../components/EquipmentList';
import { RECIPE_PRICE_TIERS, creatorTakeHomeCents, usd } from '../../../lib/pricing';
import { HEADER_TOP } from '../../../lib/layout';

type Ingredient = {
  name: string;
  amount: number;
  unit: string;
  category: string;
};

type RecipeData = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  prep_time: number;
  cook_time: number;
  servings: number;
  calories: number;
  is_paid: boolean;
  price_cents: number | null;   // null = use the creator's default price
  tags: string[];
  ingredients: Ingredient[];
  instructions: string[];
  stepImages: (string | null)[];
  stepTimers: (number | null)[];
  nutrition?: Recipe['nutrition'];
  cuisines: string[];
  equipment: string[];
};

/**
 * A number for a text field, or nothing.
 *
 * String(value) put a literal "null" in the box whenever the value was missing,
 * and a plain "0" where the field had simply never been filled in — both of
 * which someone has to delete before they can type. null, undefined and 0 all
 * mean "empty" here, and all three should show the placeholder.
 */
const numText = (n: number | null | undefined): string => (n ? String(n) : '');

export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingStep, setUploadingStep] = useState<number | null>(null);

  useEffect(() => {
    loadRecipe();
  }, [id]);

  const loadRecipe = async () => {
    if (!id) return;
    
    // Ingredients and instructions are no longer directly readable (see
    // supabase/lock_recipe_content.sql); this RPC returns the full row, but
    // only to the recipe's owner.
    const { data, error } = await supabase.rpc('get_recipe_for_edit', { p_recipe_id: id });

    if (error || !data || (data as any).error) {
      Alert.alert('Error', (data as any)?.error === 'not_owner'
        ? 'You can only edit your own recipes.'
        : 'Could not load recipe');
      router.back();
      return;
    }

    // Instructions may be plain strings (legacy) or { text, image } objects.
    const instr: any[] = Array.isArray(data.instructions) ? data.instructions : [];
    setRecipe({
      id: data.id,
      title: data.title || '',
      description: data.description || '',
      image_url: data.image_url || '',
      prep_time: data.prep_time || 0,
      cook_time: data.cook_time || 0,
      servings: data.servings || 4,
      calories: data.calories || 0,
      is_paid: data.is_paid || false,
      price_cents: data.price_cents ?? null,
      tags: data.tags || [],
      ingredients: data.ingredients || [],
      instructions: instr.map(s => (typeof s === 'string' ? s : (s?.text ?? ''))),
      stepImages: instr.map(s => (typeof s === 'string' ? null : (s?.image ?? null))),
      stepTimers: instr.map(s => (typeof s === 'string' ? null : (s?.timer ?? null))),
      nutrition: data.nutrition ?? undefined,
      cuisines: Array.isArray(data.cuisines) ? data.cuisines
        : data.cuisine ? [data.cuisine] : [],
      equipment: Array.isArray(data.equipment) ? data.equipment : [],
    });
    setLoading(false);
  };

  const handleSave = async () => {
    if (!recipe) return;
    
    if (!recipe.title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    setSaving(true);

    const { error, degraded } = await updateByIdTolerant('recipes', recipe.id, {
        title: recipe.title,
        description: recipe.description,
        image_url: recipe.image_url,
        prep_time: recipe.prep_time,
        cook_time: recipe.cook_time,
        servings: recipe.servings,
        calories: recipe.calories,
        is_paid: recipe.is_paid,
        nutrition: recipe.nutrition ?? null,
        cuisines: recipe.cuisines.length ? recipe.cuisines : null,
        equipment: cleanEquipment(recipe.equipment).length ? cleanEquipment(recipe.equipment) : null,
        // Only meaningful on a premium recipe; clearing it on a free one keeps
        // a stale price from reappearing if it's flipped back to premium later.
        price_cents: recipe.is_paid ? recipe.price_cents : null,
        tags: recipe.tags,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions.map((text, i) => {
          const image = recipe.stepImages[i];
          const timer = recipe.stepTimers[i];
          return image || timer ? { text, ...(image ? { image } : {}), ...(timer ? { timer } : {}) } : text;
        }),
      },
      // Dropped automatically if creator_pricing.sql hasn't been run yet.
      ['price_cents'],
    );

    setSaving(false);

    if (error) {
      Alert.alert('Error', error);
      return;
    }

    Alert.alert(
      'Saved',
      degraded
        ? 'Recipe updated — but the price was not saved. Run supabase/creator_pricing.sql to enable per-recipe pricing.'
        : 'Recipe updated successfully',
      [{ text: 'OK', onPress: () => router.back() }],
    );
  };

  const pickImage = async () => {
    setUploadingImage(true);
    const url = await pickAndUploadImage('recipes');
    setUploadingImage(false);
    if (url && recipe) {
      setRecipe({ ...recipe, image_url: url });
    }
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string | number) => {
    if (!recipe) return;
    const updated = [...recipe.ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setRecipe({ ...recipe, ingredients: updated });
  };

  const addIngredient = () => {
    if (!recipe) return;
    setRecipe({
      ...recipe,
      ingredients: [...recipe.ingredients, { name: '', amount: 1, unit: 'piece', category: 'other' }]
    });
  };

  const removeIngredient = (index: number) => {
    if (!recipe) return;
    setRecipe({
      ...recipe,
      ingredients: recipe.ingredients.filter((_, i) => i !== index)
    });
  };

  const updateStep = (index: number, value: string) => {
    if (!recipe) return;
    const updated = [...recipe.instructions];
    updated[index] = value;
    setRecipe({ ...recipe, instructions: updated });
  };

  const addStep = () => {
    if (!recipe) return;
    setRecipe({
      ...recipe,
      instructions: [...recipe.instructions, ''],
      stepImages: [...recipe.stepImages, null],
      stepTimers: [...recipe.stepTimers, null],
    });
  };

  const removeStep = (index: number) => {
    if (!recipe) return;
    setRecipe({
      ...recipe,
      instructions: recipe.instructions.filter((_, i) => i !== index),
      stepImages: recipe.stepImages.filter((_, i) => i !== index),
      stepTimers: recipe.stepTimers.filter((_, i) => i !== index),
    });
  };

  const setStepTimerMinutes = (index: number, mins: string) => {
    if (!recipe) return;
    const m = parseFloat(mins.replace(',', '.'));
    const secs = isNaN(m) || m <= 0 ? null : Math.round(m * 60);
    setRecipe({ ...recipe, stepTimers: recipe.stepTimers.map((t, i) => (i === index ? secs : t)) });
  };

  const chooseStepImage = async (index: number) => {
    setUploadingStep(index);
    const url = await pickAndUploadImage('recipes');
    setUploadingStep(null);
    if (url && recipe) {
      setRecipe(r => (r ? { ...r, stepImages: r.stepImages.map((img, i) => (i === index ? url : img)) } : r));
    }
  };

  const removeStepImage = (index: number) => {
    if (!recipe) return;
    setRecipe({ ...recipe, stepImages: recipe.stepImages.map((img, i) => (i === index ? null : img)) });
  };

  const deleteRecipe = () => {
    Alert.alert(
      'Delete Recipe',
      'Are you sure you want to delete this recipe? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('recipes').delete().eq('id', id);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              router.replace('/profile');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#F2701E" />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>Recipe not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Recipe</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#F2701E" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Image */}
        <TouchableOpacity style={styles.imageContainer} onPress={pickImage}>
          {recipe.image_url ? (
            <Image source={{ uri: recipe.image_url }} style={styles.recipeImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderIcon}>📷</Text>
              <Text style={styles.imagePlaceholderText}>Add Photo</Text>
            </View>
          )}
          {uploadingImage && (
            <View style={styles.imageOverlay}>
              <ActivityIndicator color="#FFF" />
            </View>
          )}
        </TouchableOpacity>

        {/* Basic Info */}
        <View style={styles.card}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={recipe.title}
            onChangeText={(t) => setRecipe({ ...recipe, title: t })}
            placeholder="Recipe name"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={recipe.description}
            onChangeText={(t) => setRecipe({ ...recipe, description: t })}
            placeholder="Short description"
            multiline
          />

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.label}>Prep (min)</Text>
              <TextInput
                style={styles.inputSmall}
                value={numText(recipe.prep_time)}
                onChangeText={(t) => setRecipe({ ...recipe, prep_time: parseInt(t) || 0 })}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.label}>Cook (min)</Text>
              <TextInput
                style={styles.inputSmall}
                value={numText(recipe.cook_time)}
                onChangeText={(t) => setRecipe({ ...recipe, cook_time: parseInt(t) || 0 })}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.label}>Servings</Text>
              <TextInput
                style={styles.inputSmall}
                value={numText(recipe.servings)}
                onChangeText={(t) => setRecipe({ ...recipe, servings: parseInt(t) || 4 })}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.label}>Calories</Text>
              <TextInput
                style={styles.inputSmall}
                value={numText(recipe.calories)}
                onChangeText={(t) => setRecipe({ ...recipe, calories: parseInt(t) || 0 })}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Dietary tags */}
        <View style={styles.card}>
          <Text style={styles.label}>Dietary tags</Text>
          <View style={styles.tagPickRow}>
            {DIETARY_TAGS.map(tag => {
              const active = recipe.tags.includes(tag.id);
              return (
                <TouchableOpacity
                  key={tag.id}
                  style={[styles.tagPick, active && styles.tagPickActive]}
                  onPress={() => setRecipe({
                    ...recipe,
                    tags: active ? recipe.tags.filter(t => t !== tag.id) : [...recipe.tags, tag.id],
                  })}
                >
                  <Text style={[styles.tagPickText, active && styles.tagPickTextActive]}>{tag.icon} {tag.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Premium Toggle */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Premium Recipe</Text>
              <Text style={styles.toggleHint}>Only subscribers can view full recipe</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, recipe.is_paid && styles.toggleActive]}
              onPress={() => setRecipe({ ...recipe, is_paid: !recipe.is_paid })}
            >
              <Text style={[styles.toggleText, recipe.is_paid && styles.toggleTextActive]}>
                {recipe.is_paid ? '💎 ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          </View>

          {recipe.is_paid && (
            <View style={styles.priceBlock}>
              <Text style={styles.priceLabel}>Price for this recipe</Text>
              <Text style={styles.toggleHint}>
                Leave on “Default” to follow the price set in your creator profile.
              </Text>
              <View style={styles.tierRow}>
                <TouchableOpacity
                  style={[styles.tier, recipe.price_cents == null && styles.tierOn]}
                  onPress={() => setRecipe({ ...recipe, price_cents: null })}
                >
                  <Text style={[styles.tierText, recipe.price_cents == null && styles.tierTextOn]}>Default</Text>
                </TouchableOpacity>
                {RECIPE_PRICE_TIERS.map(t => (
                  <TouchableOpacity
                    key={t.cents}
                    style={[styles.tier, recipe.price_cents === t.cents && styles.tierOn]}
                    onPress={() => setRecipe({ ...recipe, price_cents: t.cents })}
                  >
                    <Text style={[styles.tierText, recipe.price_cents === t.cents && styles.tierTextOn]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {recipe.price_cents != null && (
                <Text style={styles.takeHome}>
                  You keep {usd(creatorTakeHomeCents(recipe.price_cents))} per sale
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Nutrition, cuisine and equipment. None of this existed on the creator
            path — a creator could see calories on their own recipe and had no field
            to correct them, while the cookbook editor had all of it. NutritionFields
            is the same component both sides use now, so the estimate flag cannot
            drift apart again. */}
        <View style={styles.card}>
          <NutritionFields
            value={{ calories: recipe.calories, nutrition: recipe.nutrition }}
            ingredients={recipe.ingredients}
            servings={recipe.servings}
            onChange={v => setRecipe({ ...recipe, calories: v.calories, nutrition: v.nutrition })}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Cuisine & equipment</Text>
          <Text style={styles.equipHint}>Cuisine — pick one, or two for fusion</Text>
          <ChipMultiSelect
            options={CUISINES}
            value={recipe.cuisines}
            onChange={v => setRecipe({ ...recipe, cuisines: v })}
          />
          <Text style={[styles.equipHint, { marginTop: 14 }]}>Equipment</Text>
          <EquipmentList
            value={recipe.equipment}
            onChange={v => setRecipe({ ...recipe, equipment: v })}
          />
          <Text style={styles.equipHint}>
            Only what the recipe can't be made without. No pans, pots or ovens.
          </Text>
        </View>
        {/* Ingredients */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ingredients ({recipe.ingredients.length})</Text>
            <TouchableOpacity onPress={addIngredient}>
              <Text style={styles.addLink}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {recipe.ingredients.map((ing, i) => (
            <View key={i} style={styles.ingredientRow}>
              <TextInput
                style={styles.ingredientAmount}
                value={numText(ing.amount)}
                onChangeText={(t) => updateIngredient(i, 'amount', parseFloat(t) || 0)}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.ingredientUnit}
                value={ing.unit}
                onChangeText={(t) => updateIngredient(i, 'unit', t)}
              />
              <TextInput
                style={styles.ingredientName}
                value={ing.name}
                onChangeText={(t) => updateIngredient(i, 'name', t)}
                placeholder="Ingredient"
              />
              <TouchableOpacity onPress={() => removeIngredient(i)}>
                <Text style={styles.removeButton}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Steps */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Steps ({recipe.instructions.length})</Text>
            <TouchableOpacity onPress={addStep}>
              <Text style={styles.addLink}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {recipe.instructions.map((step, i) => (
            <View key={i} style={styles.stepItem}>
              <View style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <TextInput
                  style={styles.stepInput}
                  value={step}
                  onChangeText={(t) => updateStep(i, t)}
                  placeholder={`Step ${i + 1}`}
                  multiline
                />
                <TouchableOpacity onPress={() => removeStep(i)}>
                  <Text style={styles.removeButton}>×</Text>
                </TouchableOpacity>
              </View>
              {recipe.stepImages[i] ? (
                <View style={styles.stepImageWrap}>
                  <Image source={{ uri: recipe.stepImages[i]! }} style={styles.stepImageThumb} />
                  <TouchableOpacity style={styles.stepImageRemove} onPress={() => removeStepImage(i)}>
                    <Text style={styles.stepImageRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.stepPhotoBtn}
                  onPress={() => chooseStepImage(i)}
                  disabled={uploadingStep === i}
                >
                  <Text style={styles.stepPhotoText}>{uploadingStep === i ? 'Uploading…' : '📷 Add step photo'}</Text>
                </TouchableOpacity>
              )}
              <View style={styles.stepTimerRow}>
                <Text style={styles.stepTimerLabel}>⏱ Timer (optional):</Text>
                <TextInput
                  style={styles.stepTimerInput}
                  value={recipe.stepTimers[i] ? String(Math.round(recipe.stepTimers[i]! / 60 * 100) / 100) : ''}
                  onChangeText={(t) => setStepTimerMinutes(i, t)}
                  placeholder="0"
                  keyboardType="numeric"
                />
                <Text style={styles.stepTimerLabel}>min</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Delete */}
        <TouchableOpacity style={styles.deleteButton} onPress={deleteRecipe}>
          <Text style={styles.deleteButtonText}>🗑 Delete Recipe</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  center: { justifyContent: 'center', alignItems: 'center' },
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
  backButton: { width: 80 },
  backText: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 18, color: '#0D2B63', letterSpacing: 0.3 },
  saveText: { fontSize: 16, color: '#F2701E', fontWeight: '700' },
  content: { flex: 1 },
  imageContainer: { height: 200, backgroundColor: '#F0F0F0', position: 'relative' },
  recipeImage: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderIcon: { fontSize: 48, marginBottom: 8 },
  imagePlaceholderText: { fontSize: 15, color: '#888' },
  imageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#FFF', margin: 16, marginBottom: 0, borderRadius: 16, padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6, marginTop: 8 },
  tagPickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tagPick: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F6F1EA', borderWidth: 1, borderColor: '#EEE' },
  tagPickActive: { backgroundColor: '#F2701E', borderColor: '#F2701E' },
  tagPickText: { fontSize: 13, color: '#666', fontWeight: '600' },
  tagPickTextActive: { color: '#FFF' },
  input: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A1A' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  metaRow: { flexDirection: 'row', marginTop: 8, gap: 8 },
  metaItem: { flex: 1 },
  inputSmall: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, fontSize: 15, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  toggleHint: { fontSize: 13, color: '#888', marginTop: 2 },
  priceBlock: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#EFE7DC', paddingTop: 14 },
  priceLabel: { fontSize: 15, fontWeight: '700', color: '#0D2B63' },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tier: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18,
    borderWidth: 1, borderColor: '#EFE7DC', backgroundColor: '#FFF9F2',
  },
  tierOn: { backgroundColor: '#0D2B63', borderColor: '#0D2B63' },
  tierText: { fontSize: 13, fontWeight: '600', color: '#0D2B63' },
  tierTextOn: { color: '#FFF' },
  takeHome: { fontSize: 12.5, color: '#3C8D40', fontWeight: '600', marginTop: 11 },
  toggle: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F0F0F0' },
  toggleActive: { backgroundColor: '#F2701E' },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#888' },
  toggleTextActive: { color: '#FFF' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  equipHint: { fontSize: 12, color: '#8A8A8A', marginTop: 8, lineHeight: 16 },
  addLink: { fontSize: 14, color: '#F2701E', fontWeight: '600' },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  ingredientAmount: { width: 50, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14, textAlign: 'center' },
  ingredientUnit: { width: 60, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14 },
  ingredientName: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14 },
  removeButton: { fontSize: 24, color: '#E53935', fontWeight: '600', paddingHorizontal: 8 },
  stepItem: { marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepPhotoBtn: { alignSelf: 'flex-start', marginLeft: 38, marginTop: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FFD3C2', backgroundColor: '#FFF3EC' },
  stepPhotoText: { fontSize: 12.5, fontWeight: '600', color: '#F2701E' },
  stepTimerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 38, marginTop: 8 },
  stepTimerLabel: { fontSize: 12.5, color: '#888' },
  stepTimerInput: { width: 54, backgroundColor: '#FFF9F2', borderRadius: 8, borderWidth: 1, borderColor: '#EEE', paddingVertical: 5, paddingHorizontal: 10, fontSize: 13, textAlign: 'center' },
  stepImageWrap: { marginLeft: 38, marginTop: 8, width: 120, height: 90, borderRadius: 10, overflow: 'hidden' },
  stepImageThumb: { width: '100%', height: '100%' },
  stepImageRemove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(13,43,99,0.8)', justifyContent: 'center', alignItems: 'center' },
  stepImageRemoveText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F2701E', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  stepNumberText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  stepInput: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14, minHeight: 40 },
  deleteButton: { margin: 16, padding: 16, borderRadius: 12, backgroundColor: '#FFEBEE', alignItems: 'center' },
  deleteButtonText: { fontSize: 16, fontWeight: '600', color: '#E53935' },
});
