import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DIETARY_TAGS, DietaryTag, Ingredient, Recipe } from '../../data/recipes';
import NutritionFields from '../../components/NutritionFields';
import { createRecipe } from '../../lib/recipes';
import { pickAndUploadImage } from '../../lib/storage';
import { COLORS } from '../../lib/theme';
import { useAuth, canUploadRecipes } from '../../lib/auth';
import { HEADER_TOP } from '../../lib/layout';

type Difficulty = 'Easy' | 'Medium' | 'Hard';

const CATEGORIES: { id: Ingredient['category']; icon: string }[] = [
  { id: 'produce', icon: '🥬' },
  { id: 'meat', icon: '🥩' },
  { id: 'dairy', icon: '🧀' },
  { id: 'bakery', icon: '🍞' },
  { id: 'pantry', icon: '🥫' },
  { id: 'frozen', icon: '🧊' },
  { id: 'other', icon: '📦' },
];

type IngredientDraft = { name: string; amount: string; unit: string; category: Ingredient['category'] };

const emptyIngredient = (): IngredientDraft => ({ name: '', amount: '', unit: '', category: 'other' });

export default function UploadRecipeScreen() {
  const { role } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('4');
  const [calories, setCalories] = useState('');
  const [cost, setCost] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('Easy');
  const [dietary, setDietary] = useState<DietaryTag[]>([]);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([emptyIngredient()]);
  const [steps, setSteps] = useState<string[]>(['']);
  const [stepImages, setStepImages] = useState<(string | null)[]>([null]);
  const [stepTimers, setStepTimers] = useState<(number | null)[]>([null]); // seconds
  const [nutrition, setNutrition] = useState<Recipe['nutrition']>(undefined);
  const [cuisine, setCuisine] = useState('');
  const [equipment, setEquipment] = useState<string[]>([]);
  const [uploadingStep, setUploadingStep] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const chooseImage = async () => {
    setUploadingImage(true);
    const url = await pickAndUploadImage('recipes');
    setUploadingImage(false);
    if (url) setImage(url);
  };

  const toggleDietary = (tag: DietaryTag) => {
    setDietary(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));
  };

  const updateIngredient = (i: number, patch: Partial<IngredientDraft>) => {
    setIngredients(prev => prev.map((ing, idx) => (idx === i ? { ...ing, ...patch } : ing)));
  };
  const addIngredient = () => setIngredients(prev => [...prev, emptyIngredient()]);
  const removeIngredient = (i: number) =>
    setIngredients(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const updateStep = (i: number, value: string) =>
    setSteps(prev => prev.map((s, idx) => (idx === i ? value : s)));
  const addStep = () => {
    setSteps(prev => [...prev, '']);
    setStepImages(prev => [...prev, null]);
    setStepTimers(prev => [...prev, null]);
  };
  const removeStep = (i: number) => {
    setSteps(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
    setStepImages(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
    setStepTimers(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  };
  // Timer entered in minutes; stored as seconds (empty/0 → no timer).
  const setStepTimerMinutes = (i: number, mins: string) => {
    const m = parseFloat(mins.replace(',', '.'));
    const secs = isNaN(m) || m <= 0 ? null : Math.round(m * 60);
    setStepTimers(prev => prev.map((t, idx) => (idx === i ? secs : t)));
  };
  const chooseStepImage = async (i: number) => {
    setUploadingStep(i);
    const url = await pickAndUploadImage('recipes');
    setUploadingStep(null);
    if (url) setStepImages(prev => prev.map((img, idx) => (idx === i ? url : img)));
  };
  const removeStepImage = (i: number) =>
    setStepImages(prev => prev.map((img, idx) => (idx === i ? null : img)));

  const submit = async () => {
    if (!title.trim()) return Alert.alert('Missing title', 'Please give your recipe a name.');
    if (!image.trim()) return Alert.alert('Missing image', 'Please paste an image URL.');

    const cleanedIngredients: Ingredient[] = ingredients
      .filter(i => i.name.trim())
      .map(i => ({
        name: i.name.trim(),
        amount: parseFloat(i.amount) || 0,
        unit: i.unit.trim(),
        category: i.category,
      }));
    // Keep each step's photo aligned after dropping empty steps.
    const stepPairs = steps
      .map((s, i) => ({ text: s.trim(), image: stepImages[i] ?? null, timer: stepTimers[i] ?? null }))
      .filter(p => p.text);
    const cleanedSteps = stepPairs.map(p => p.text);
    const cleanedStepImages = stepPairs.map(p => p.image);
    const cleanedStepTimers = stepPairs.map(p => p.timer);

    if (cleanedIngredients.length === 0)
      return Alert.alert('Missing ingredients', 'Add at least one ingredient.');
    if (cleanedSteps.length === 0)
      return Alert.alert('Missing steps', 'Add at least one step.');

    setSaving(true);
    const result = await createRecipe({
      title: title.trim(),
      description: description.trim(),
      image: image.trim(),
      prepTime: parseInt(prepTime) || 0,
      cookTime: parseInt(cookTime) || 0,
      servings: parseInt(servings) || 4,
      calories: parseInt(calories) || 0,
      cost: parseFloat(cost) || 0,
      difficulty,
      dietary,
      ingredients: cleanedIngredients,
      steps: cleanedSteps,
      stepImages: cleanedStepImages,
      stepTimers: cleanedStepTimers,
      nutrition,
      cuisine: cuisine.trim() || undefined,
      equipment: equipment.length ? equipment : undefined,
    });
    setSaving(false);

    if ('error' in result) {
      if (result.error === 'not-authenticated') {
        Alert.alert('Sign in required', 'Sign in to publish a recipe.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign in', onPress: () => router.push('/login') },
        ]);
      } else {
        Alert.alert('Could not publish', result.error);
      }
      return;
    }

    Alert.alert('Recipe published! 🎉', 'Your recipe is now live in Discover.', [
      { text: 'View Recipe', onPress: () => router.replace(`/recipe/${result.id}`) },
      { text: 'Done', onPress: () => router.back() },
    ]);
  };

  // Uploads are limited to creator/admin accounts (see FEATURES.publicRecipeUploads).
  if (!canUploadRecipes(role)) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Recipe</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.blockedState}>
          <Text style={styles.blockedIcon}>👨‍🍳</Text>
          <Text style={styles.blockedTitle}>Creators only</Text>
          <Text style={styles.blockedText}>
            Recipe uploads are open to creator accounts for now. Want to become a
            creator? Get in touch and we'll set you up.
          </Text>
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
        <Text style={styles.headerTitle}>New Recipe</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Import instead of typing */}
        <TouchableOpacity style={styles.importBanner} onPress={() => router.push('/creator/import')}>
          <Text style={styles.importIcon}>✨</Text>
          <View style={styles.importText}>
            <Text style={styles.importTitle}>Import a recipe</Text>
            <Text style={styles.importSubtitle}>From an Instagram link, screenshots or text — AI does the rest</Text>
          </View>
          <Text style={styles.importArrow}>→</Text>
        </TouchableOpacity>
        {/* Image preview + URL */}
        {image.trim() ? (
          <Image source={{ uri: image.trim() }} style={styles.preview} />
        ) : (
          <View style={[styles.preview, styles.previewEmpty]}>
            <Text style={styles.previewEmptyText}>🖼️ Image preview</Text>
          </View>
        )}
        <View style={styles.field}>
          <TouchableOpacity style={styles.photoButton} onPress={chooseImage} disabled={uploadingImage}>
            {uploadingImage ? (
              <ActivityIndicator color="#F2701E" />
            ) : (
              <Text style={styles.photoButtonText}>📷 Upload photo</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.orLabel}>or paste an image URL</Text>
          <TextInput
            style={styles.input}
            value={image}
            onChangeText={setImage}
            placeholder="https://…"
            placeholderTextColor="#999"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Creamy Tuscan Chicken"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="A short, tasty pitch…"
            placeholderTextColor="#999"
            multiline
          />
        </View>

        {/* Numbers */}
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Prep (min)</Text>
            <TextInput style={styles.input} value={prepTime} onChangeText={setPrepTime} keyboardType="numeric" placeholder="10" placeholderTextColor="#999" />
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Cook (min)</Text>
            <TextInput style={styles.input} value={cookTime} onChangeText={setCookTime} keyboardType="numeric" placeholder="20" placeholderTextColor="#999" />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Servings</Text>
            <TextInput style={styles.input} value={servings} onChangeText={setServings} keyboardType="numeric" placeholder="4" placeholderTextColor="#999" />
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Calories</Text>
            <TextInput style={styles.input} value={calories} onChangeText={setCalories} keyboardType="numeric" placeholder="450" placeholderTextColor="#999" />
          </View>
          <View style={styles.rowItem}>
            <Text style={styles.label}>Cost ($)</Text>
            <TextInput style={styles.input} value={cost} onChangeText={setCost} keyboardType="numeric" placeholder="8.50" placeholderTextColor="#999" />
          </View>
        </View>

        {/* Difficulty */}
        <View style={styles.field}>
          <Text style={styles.label}>Difficulty</Text>
          <View style={styles.segment}>
            {(['Easy', 'Medium', 'Hard'] as Difficulty[]).map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.segmentButton, difficulty === d && styles.segmentButtonActive]}
                onPress={() => setDifficulty(d)}
              >
                <Text style={[styles.segmentText, difficulty === d && styles.segmentTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Dietary tags */}
        <View style={styles.field}>
          <Text style={styles.label}>Dietary tags</Text>
          <View style={styles.chipWrap}>
            {DIETARY_TAGS.map(tag => {
              const active = dietary.includes(tag.id);
              return (
                <TouchableOpacity
                  key={tag.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleDietary(tag.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {tag.icon} {tag.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Nutrition, cuisine and equipment — the same three the edit screen and
            the cookbook editor carry. Leaving them off here meant a creator had to
            publish first and immediately reopen the recipe to fill them in. */}
        <View style={styles.field}>
          <NutritionFields
            value={{ calories: parseInt(calories) || 0, nutrition }}
            ingredients={ingredients.map(i => ({
              name: i.name,
              amount: Number(i.amount) || 0,
              unit: i.unit,
            }))}
            servings={parseInt(servings) || 4}
            onChange={v => {
              setCalories(v.calories ? String(v.calories) : '');
              setNutrition(v.nutrition);
            }}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Cuisine & equipment</Text>
          <TextInput
            style={styles.input}
            value={cuisine}
            onChangeText={setCuisine}
            placeholder="Italian, Thai, Mexican… (optional)"
            placeholderTextColor="#BBB"
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={equipment.join(', ')}
            onChangeText={t => setEquipment(t.split(',').map(x => x.trim()).filter(Boolean))}
            placeholder="Air fryer, blender… (optional)"
            placeholderTextColor="#BBB"
          />
          <Text style={styles.equipHint}>
            Only what the recipe can't be made without. No pans, pots or ovens.
          </Text>
        </View>
        {/* Ingredients */}
        <View style={styles.field}>
          <Text style={styles.label}>Ingredients</Text>
          {ingredients.map((ing, i) => (
            <View key={i} style={styles.ingredientCard}>
              <View style={styles.ingredientTop}>
                <TextInput
                  style={[styles.input, styles.ingredientName]}
                  value={ing.name}
                  onChangeText={t => updateIngredient(i, { name: t })}
                  placeholder="Ingredient"
                  placeholderTextColor="#999"
                />
                <TextInput
                  style={[styles.input, styles.ingredientAmount]}
                  value={ing.amount}
                  onChangeText={t => updateIngredient(i, { amount: t })}
                  placeholder="Qty"
                  placeholderTextColor="#999"
                  keyboardType="numeric"
                />
                <TextInput
                  style={[styles.input, styles.ingredientUnit]}
                  value={ing.unit}
                  onChangeText={t => updateIngredient(i, { unit: t })}
                  placeholder="unit"
                  placeholderTextColor="#999"
                />
                {ingredients.length > 1 && (
                  <TouchableOpacity onPress={() => removeIngredient(i)} style={styles.removeCircle}>
                    <Text style={styles.removeCircleText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catChip, ing.category === cat.id && styles.catChipActive]}
                    onPress={() => updateIngredient(i, { category: cat.id })}
                  >
                    <Text style={styles.catChipText}>{cat.icon} {cat.id}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
          <TouchableOpacity style={styles.addRow} onPress={addIngredient}>
            <Text style={styles.addRowText}>+ Add ingredient</Text>
          </TouchableOpacity>
        </View>

        {/* Steps */}
        <View style={styles.field}>
          <Text style={styles.label}>Steps</Text>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepItem}>
              <View style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.stepInput]}
                  value={step}
                  onChangeText={t => updateStep(i, t)}
                  placeholder="Describe this step…"
                  placeholderTextColor="#999"
                  multiline
                />
                {steps.length > 1 && (
                  <TouchableOpacity onPress={() => removeStep(i)} style={styles.removeCircle}>
                    <Text style={styles.removeCircleText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
              {stepImages[i] ? (
                <View style={styles.stepImageWrap}>
                  <Image source={{ uri: stepImages[i]! }} style={styles.stepImage} />
                  <TouchableOpacity style={styles.stepImageRemove} onPress={() => removeStepImage(i)}>
                    <Ionicons name="close" size={14} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.stepPhotoBtn}
                  onPress={() => chooseStepImage(i)}
                  disabled={uploadingStep === i}
                >
                  <Ionicons name="camera-outline" size={16} color={COLORS.orange} />
                  <Text style={styles.stepPhotoText}>{uploadingStep === i ? 'Uploading…' : 'Add step photo'}</Text>
                </TouchableOpacity>
              )}
              <View style={styles.stepTimerRow}>
                <Ionicons name="timer-outline" size={16} color="#888" />
                <Text style={styles.stepTimerLabel}>Timer (optional):</Text>
                <TextInput
                  style={styles.stepTimerInput}
                  value={stepTimers[i] ? String(Math.round(stepTimers[i]! / 60 * 100) / 100) : ''}
                  onChangeText={t => setStepTimerMinutes(i, t)}
                  placeholder="0"
                  placeholderTextColor="#BBB"
                  keyboardType="numeric"
                />
                <Text style={styles.stepTimerLabel}>min</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.addRow} onPress={addStep}>
            <Text style={styles.addRowText}>+ Add step</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Publish */}
      <View style={styles.bottomAction}>
        <TouchableOpacity style={styles.publishButton} onPress={submit} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.publishButtonText}>Publish Recipe</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: HEADER_TOP, paddingBottom: 16 },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },
  blockedState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  blockedIcon: { fontSize: 64, marginBottom: 16 },
  blockedTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  blockedText: { fontSize: 15, color: '#888', textAlign: 'center', marginTop: 10, lineHeight: 22 },
  preview: { width: '100%', height: 180, backgroundColor: '#EEE' },
  previewEmpty: { justifyContent: 'center', alignItems: 'center' },
  previewEmptyText: { fontSize: 16, color: '#AAA' },
  field: { paddingHorizontal: 20, marginTop: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  equipHint: { fontSize: 12, color: '#8A8A8A', marginTop: 8, lineHeight: 16 },
  photoButton: { padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F2701E', backgroundColor: '#FFF5F0' },
  photoButtonText: { color: '#F2701E', fontSize: 15, fontWeight: '700' },
  orLabel: { fontSize: 12, color: '#999', textAlign: 'center', marginVertical: 8 },
  input: { backgroundColor: '#FFF', borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#EEE' },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', paddingHorizontal: 20, marginTop: 16, gap: 10 },
  rowItem: { flex: 1 },
  segment: { flexDirection: 'row', backgroundColor: '#F0F0F0', borderRadius: 10, padding: 4 },
  segmentButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  segmentButtonActive: { backgroundColor: '#FFF' },
  segmentText: { fontSize: 14, color: '#888', fontWeight: '500' },
  segmentTextActive: { color: '#1A1A1A', fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EEE' },
  chipActive: { backgroundColor: '#F2701E', borderColor: '#F2701E' },
  chipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  chipTextActive: { color: '#FFF', fontWeight: '600' },
  ingredientCard: { backgroundColor: '#F7F7F7', borderRadius: 12, padding: 10, marginBottom: 10 },
  ingredientTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ingredientName: { flex: 3 },
  ingredientAmount: { flex: 1 },
  ingredientUnit: { flex: 1 },
  catRow: { marginTop: 8 },
  catChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EEE', marginRight: 6 },
  catChipActive: { backgroundColor: '#FFE0B2', borderColor: '#FFB74D' },
  catChipText: { fontSize: 12, color: '#666' },
  stepItem: { marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  stepPhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginLeft: 40, marginTop: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FFD3C2', backgroundColor: '#FFF3EC' },
  stepPhotoText: { fontFamily: 'Poppins_600SemiBold', fontSize: 12.5, color: '#F2701E' },
  stepTimerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 40, marginTop: 8 },
  stepTimerLabel: { fontSize: 12.5, color: '#888' },
  stepTimerInput: { width: 54, backgroundColor: '#FFF9F2', borderRadius: 8, borderWidth: 1, borderColor: '#EEE', paddingVertical: 5, paddingHorizontal: 10, fontSize: 13, textAlign: 'center', color: '#1A1A1A' },
  stepImageWrap: { marginLeft: 40, marginTop: 8, width: 120, height: 90, borderRadius: 10, overflow: 'hidden' },
  stepImage: { width: '100%', height: '100%' },
  stepImageRemove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(13,43,99,0.8)', justifyContent: 'center', alignItems: 'center' },
  stepNumber: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2701E', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  stepNumberText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  stepInput: { flex: 1, minHeight: 48, textAlignVertical: 'top' },
  removeCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFE0E0', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  removeCircleText: { fontSize: 18, color: '#E53935', fontWeight: '700' },
  addRow: { paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#EEE', borderStyle: 'dashed' },
  addRowText: { fontSize: 14, color: '#F2701E', fontWeight: '600' },
  bottomAction: { padding: 16, paddingBottom: 32, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  publishButton: { backgroundColor: '#F2701E', padding: 18, borderRadius: 14, alignItems: 'center' },
  publishButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  importBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F0',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFE0D0',
  },
  importIcon: { fontSize: 28, marginRight: 12 },
  importText: { flex: 1 },
  importTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  importSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  importArrow: { fontSize: 20, color: '#F2701E', fontWeight: '600' },
});
