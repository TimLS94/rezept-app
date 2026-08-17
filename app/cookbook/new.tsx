// Write a recipe by hand — no AI, no import, no Premium.
//
// This is deliberately the same editor a creator uses, and deliberately the
// same screen you use to jot down a note: fill in ingredients and steps and you
// get a fully cookable recipe; fill in only a title and some text and you get a
// note. There is no "type" to choose up front, because people don't know which
// one they're writing until they've written it — a note that grows steps simply
// becomes a recipe.
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { saveMyRecipe } from '../../lib/myRecipes';
import { DietaryTag, Ingredient } from '../../data/recipes';
import RecipeEditor, { EditableRecipe } from '../../components/RecipeEditor';
import { HEADER_TOP } from '../../lib/layout';
import { goBackOr } from '../../lib/nav';

const EMPTY: EditableRecipe = {
  title: '',
  description: '',
  prepTime: 0,
  cookTime: 0,
  servings: 4,
  calories: 0,
  difficulty: 'Easy',
  dietary: [],
  ingredients: [],
  steps: [],
};

const DIETARY_TAGS = ['healthy', 'high-protein', 'gluten-free', 'vegetarian', 'vegan', 'dairy-free'];

export default function NewRecipeScreen() {
  const [draft, setDraft] = useState<EditableRecipe>(EMPTY);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.title.trim()) {
      Alert.alert('Title needed', 'Give it a name so you can find it again.');
      return;
    }
    // Everything else is optional on purpose. A title plus a line of text is a
    // perfectly good note, and refusing to save it would defeat the point.
    setSaving(true);
    const result = await saveMyRecipe({
      title: draft.title.trim(),
      description: draft.description.trim(),
      image: '',
      prepTime: draft.prepTime,
      cookTime: draft.cookTime,
      servings: draft.servings,
      calories: draft.calories,
      cost: 0,
      difficulty: draft.difficulty,
      dietary: draft.dietary.filter(d => DIETARY_TAGS.includes(d)) as DietaryTag[],
      ingredients: draft.ingredients as Ingredient[],
      steps: draft.steps.filter(s => s.trim()),
    });
    setSaving(false);

    if ('error' in result) {
      Alert.alert('Could not save', result.error);
      return;
    }
    // replace, not push: backing out of the new recipe should land in the
    // cookbook, not on a blank editor the user already finished with.
    router.replace(`/cookbook/${result.id}`);
  };

  const isNote = !draft.ingredients.length && !draft.steps.length;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/cookbook')} style={styles.headerBtn} disabled={saving}>
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Recipe</Text>
        <TouchableOpacity onPress={save} style={styles.headerBtnRight} disabled={saving}>
          <Text style={styles.saveText}>{saving ? '…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.body}>
          <View style={styles.hintCard}>
            <Text style={styles.hintText}>
              {isNote
                ? 'Just a title and some text saves as a note. Add ingredients and steps and it becomes a full recipe you can cook step by step.'
                : 'Looking good — with steps you can cook this in cook mode, and the ingredients go straight to your shopping list.'}
            </Text>
          </View>

          <RecipeEditor value={draft} onChange={setDraft} />
          <View style={{ height: 60 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
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
  headerBtn: { width: 60 },
  headerBtnRight: { width: 60, alignItems: 'flex-end' },
  backText: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  saveText: { fontSize: 16, color: '#F2701E', fontWeight: '700' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },
  body: { padding: 20 },
  hintCard: { backgroundColor: '#FFF3E9', borderRadius: 14, padding: 16, marginBottom: 16 },
  hintText: { fontSize: 13, color: '#8A4B1E', lineHeight: 19 },
});
