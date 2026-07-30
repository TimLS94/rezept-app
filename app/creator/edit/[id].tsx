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
import { supabase } from '../../../lib/supabase';
import { pickAndUploadImage } from '../../../lib/storage';

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
  tags: string[];
  ingredients: Ingredient[];
  instructions: string[];
};

export default function EditRecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    loadRecipe();
  }, [id]);

  const loadRecipe = async () => {
    if (!id) return;
    
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      Alert.alert('Error', 'Could not load recipe');
      router.back();
      return;
    }

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
      tags: data.tags || [],
      ingredients: data.ingredients || [],
      instructions: data.instructions || [],
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

    const { error } = await supabase
      .from('recipes')
      .update({
        title: recipe.title,
        description: recipe.description,
        image_url: recipe.image_url,
        prep_time: recipe.prep_time,
        cook_time: recipe.cook_time,
        servings: recipe.servings,
        calories: recipe.calories,
        is_paid: recipe.is_paid,
        tags: recipe.tags,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
      })
      .eq('id', recipe.id);

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    Alert.alert('Saved', 'Recipe updated successfully', [
      { text: 'OK', onPress: () => router.back() }
    ]);
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
      instructions: [...recipe.instructions, '']
    });
  };

  const removeStep = (index: number) => {
    if (!recipe) return;
    setRecipe({
      ...recipe,
      instructions: recipe.instructions.filter((_, i) => i !== index)
    });
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
        <ActivityIndicator size="large" color="#F57C00" />
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
            <ActivityIndicator size="small" color="#F57C00" />
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
                value={String(recipe.prep_time)}
                onChangeText={(t) => setRecipe({ ...recipe, prep_time: parseInt(t) || 0 })}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.label}>Cook (min)</Text>
              <TextInput
                style={styles.inputSmall}
                value={String(recipe.cook_time)}
                onChangeText={(t) => setRecipe({ ...recipe, cook_time: parseInt(t) || 0 })}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.label}>Servings</Text>
              <TextInput
                style={styles.inputSmall}
                value={String(recipe.servings)}
                onChangeText={(t) => setRecipe({ ...recipe, servings: parseInt(t) || 4 })}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.label}>Calories</Text>
              <TextInput
                style={styles.inputSmall}
                value={String(recipe.calories)}
                onChangeText={(t) => setRecipe({ ...recipe, calories: parseInt(t) || 0 })}
                keyboardType="numeric"
              />
            </View>
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
                value={String(ing.amount)}
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
            <View key={i} style={styles.stepRow}>
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
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: { width: 80 },
  backText: { fontSize: 16, color: '#F57C00', fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  saveText: { fontSize: 16, color: '#F57C00', fontWeight: '700' },
  content: { flex: 1 },
  imageContainer: { height: 200, backgroundColor: '#F0F0F0', position: 'relative' },
  recipeImage: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  imagePlaceholderIcon: { fontSize: 48, marginBottom: 8 },
  imagePlaceholderText: { fontSize: 15, color: '#888' },
  imageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#FFF', margin: 16, marginBottom: 0, borderRadius: 16, padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A1A' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  metaRow: { flexDirection: 'row', marginTop: 8, gap: 8 },
  metaItem: { flex: 1 },
  inputSmall: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, fontSize: 15, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  toggleHint: { fontSize: 13, color: '#888', marginTop: 2 },
  toggle: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F0F0F0' },
  toggleActive: { backgroundColor: '#F57C00' },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#888' },
  toggleTextActive: { color: '#FFF' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  addLink: { fontSize: 14, color: '#F57C00', fontWeight: '600' },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  ingredientAmount: { width: 50, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14, textAlign: 'center' },
  ingredientUnit: { width: 60, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14 },
  ingredientName: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14 },
  removeButton: { fontSize: 24, color: '#E53935', fontWeight: '600', paddingHorizontal: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F57C00', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  stepNumberText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  stepInput: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14, minHeight: 40 },
  deleteButton: { margin: 16, padding: 16, borderRadius: 12, backgroundColor: '#FFEBEE', alignItems: 'center' },
  deleteButtonText: { fontSize: 16, fontWeight: '600', color: '#E53935' },
});
