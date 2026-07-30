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
import { DIETARY_TAGS, DietaryTag, Ingredient } from '../../data/recipes';
import { createRecipe } from '../../lib/recipes';
import { pickAndUploadImage } from '../../lib/storage';
import { useAuth, canUploadRecipes } from '../../lib/auth';

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
  const addStep = () => setSteps(prev => [...prev, '']);
  const removeStep = (i: number) =>
    setSteps(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

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
    const cleanedSteps = steps.map(s => s.trim()).filter(Boolean);

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

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Import from Instagram */}
        <TouchableOpacity style={styles.importBanner} onPress={() => router.push('/creator/import')}>
          <Text style={styles.importIcon}>📱</Text>
          <View style={styles.importText}>
            <Text style={styles.importTitle}>Import from Instagram</Text>
            <Text style={styles.importSubtitle}>Paste a link and let AI extract the recipe</Text>
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
              <ActivityIndicator color="#F57C00" />
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
            <View key={i} style={styles.stepRow}>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F57C00', fontWeight: '600' },
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
  photoButton: { padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F57C00', backgroundColor: '#FFF5F0' },
  photoButtonText: { color: '#F57C00', fontSize: 15, fontWeight: '700' },
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
  chipActive: { backgroundColor: '#F57C00', borderColor: '#F57C00' },
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
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F57C00', justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  stepNumberText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  stepInput: { flex: 1, minHeight: 48, textAlignVertical: 'top' },
  removeCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFE0E0', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  removeCircleText: { fontSize: 18, color: '#E53935', fontWeight: '700' },
  addRow: { paddingVertical: 12, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#EEE', borderStyle: 'dashed' },
  addRowText: { fontSize: 14, color: '#F57C00', fontWeight: '600' },
  bottomAction: { padding: 16, paddingBottom: 32, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  publishButton: { backgroundColor: '#F57C00', padding: 18, borderRadius: 14, alignItems: 'center' },
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
  importArrow: { fontSize: 20, color: '#F57C00', fontWeight: '600' },
});
