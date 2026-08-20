import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { pickAndUploadImage } from '../lib/storage';
import { Nutrition, estimateNutrition, ESTIMATE_NOTE } from '../lib/nutrition';
import { Ingredient, DIETARY_TAGS, DietaryTag } from '../data/recipes';

// A single editable shape shared by the import review step and the "edit saved
// recipe" screen. Superset of ExtractedRecipe + the source link.
export type EditableRecipe = {
  title: string;
  description: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  calories: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  dietary: string[];
  ingredients: Ingredient[];
  steps: string[];
  /** Seconds per step, index-aligned with `steps`. Null = no timer. */
  stepTimers?: (number | null)[];
  nutrition?: Nutrition;
  image?: string;
  sourceUrl?: string;
};

/** Seconds → the minutes string shown in the field. Empty when there's no timer. */
function timerMinutes(seconds: number | null | undefined): string {
  return seconds ? String(Math.round(seconds / 60)) : '';
}

type Props = {
  value: EditableRecipe;
  onChange: (next: EditableRecipe) => void;
};

// Parse a numeric text field, keeping 0 for empty/invalid so state stays a number.
const toNum = (t: string) => {
  const n = parseFloat(t.replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

export default function RecipeEditor({ value, onChange }: Props) {
  const [estimating, setEstimating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const pickPhoto = async () => {
    if (uploading) return;
    setUploading(true);
    const url = await pickAndUploadImage('recipes');
    setUploading(false);
    // A null means the picker was cancelled or the upload failed, and
    // pickAndUploadImage has already said which. Clearing the existing photo
    // on a cancelled pick would be its own small disaster.
    if (url) onChange({ ...value, image: url });
  };

  const setNutrition = (patch: Partial<Nutrition>) =>
    onChange({ ...value, nutrition: { ...(value.nutrition ?? {}), ...patch } });

  const estimate = async () => {
    if (estimating) return;
    setEstimating(true);
    const r = await estimateNutrition(value.ingredients as any, value.servings);
    setEstimating(false);

    if (!r.ok) {
      Alert.alert(
        'Could not estimate',
        r.error === 'no-ingredients'
          ? 'Add the ingredients first — the estimate is worked out from them.'
          : r.error === 'quota'
            ? "You've used today's AI allowance. It resets tomorrow."
            : r.error === 'truncated'
              ? 'That ingredient list was too long to work through in one go. Try it with fewer items.'
              : `The estimate failed (${r.error}). Please try again.`,
      );
      return;
    }
    // Calories live in their own field and are filled in too, so the two
    // cannot disagree about the same recipe.
    onChange({
      ...value,
      calories: r.nutrition.calories ?? value.calories,
      nutrition: r.nutrition,
    });
  };

  const set = (patch: Partial<EditableRecipe>) => onChange({ ...value, ...patch });

  const updateIngredient = (i: number, patch: Partial<Ingredient>) => {
    const ingredients = value.ingredients.map((ing, idx) => (idx === i ? { ...ing, ...patch } : ing));
    set({ ingredients });
  };
  const addIngredient = () =>
    set({ ingredients: [...value.ingredients, { name: '', amount: 0, unit: '', category: 'other' }] });
  const removeIngredient = (i: number) =>
    set({ ingredients: value.ingredients.filter((_, idx) => idx !== i) });

  const updateStep = (i: number, text: string) =>
    set({ steps: value.steps.map((s, idx) => (idx === i ? text : s)) });
  // Timers are index-aligned with steps, so every operation on one has to do
  // the same to the other — otherwise deleting step 2 shifts every later
  // timer onto the wrong step.
  const timers = () => value.steps.map((_, i) => value.stepTimers?.[i] ?? null);

  const addStep = () => set({ steps: [...value.steps, ''], stepTimers: [...timers(), null] });
  const removeStep = (i: number) =>
    set({
      steps: value.steps.filter((_, idx) => idx !== i),
      stepTimers: timers().filter((_, idx) => idx !== i),
    });

  const updateTimer = (i: number, minutes: string) => {
    const n = parseInt(minutes.replace(/[^0-9]/g, ''), 10);
    const next = timers();
    next[i] = isNaN(n) || n <= 0 ? null : n * 60; // stored in seconds
    set({ stepTimers: next });
  };

  return (
    <View>
      {/* Photo. The editor never had one, so a recipe you wrote yourself
          could not have a picture — it showed the plate-and-cutlery
          placeholder everywhere, for good. */}
      <View style={styles.card}>
        <Text style={styles.label}>Photo</Text>
        {value.image ? (
          <View>
            <Image source={{ uri: value.image }} style={styles.photo} />
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={pickPhoto} disabled={uploading}>
                <Text style={styles.photoAction}>{uploading ? 'Uploading…' : 'Replace'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => set({ image: '' })}>
                <Text style={styles.photoRemove}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.photoEmpty} onPress={pickPhoto} disabled={uploading}>
            <Text style={styles.photoEmptyIcon}>{uploading ? '⏳' : '📷'}</Text>
            <Text style={styles.photoEmptyText}>
              {uploading ? 'Uploading…' : 'Add a photo'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Title & description */}
      <View style={styles.card}>
        <Text style={styles.label}>Title</Text>
        <TextInput
          style={styles.input}
          value={value.title}
          onChangeText={(t) => set({ title: t })}
          placeholder="Recipe name"
          placeholderTextColor="#999"
        />
        <Text style={[styles.label, styles.mt]}>Description</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={value.description}
          onChangeText={(t) => set({ description: t })}
          placeholder="Short description"
          placeholderTextColor="#999"
          multiline
        />
      </View>

      {/* Meta */}
      <View style={styles.card}>
        <View style={styles.metaRow}>
          <NumField label="Prep (min)" value={value.prepTime} onChange={(n) => set({ prepTime: n })} />
          <NumField label="Cook (min)" value={value.cookTime} onChange={(n) => set({ cookTime: n })} />
          <NumField label="Servings" value={value.servings} onChange={(n) => set({ servings: n })} />
        </View>
      </View>

      {/* Difficulty */}
      <View style={styles.card}>
        <Text style={styles.label}>Difficulty</Text>
        <View style={styles.difficultyRow}>
          {(['Easy', 'Medium', 'Hard'] as const).map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.difficultyBtn, value.difficulty === d && styles.difficultyBtnActive]}
              onPress={() => set({ difficulty: d })}
            >
              <Text style={[styles.difficultyTxt, value.difficulty === d && styles.difficultyTxtActive]}>
                {d === 'Easy' ? '😊' : d === 'Medium' ? '🤔' : '😤'} {d}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Dietary Tags */}
      <View style={styles.card}>
        <Text style={styles.label}>Tags</Text>
        <View style={styles.tagsRow}>
          {DIETARY_TAGS.map((tag) => {
            const isSelected = value.dietary.includes(tag.id);
            return (
              <TouchableOpacity
                key={tag.id}
                style={[styles.tagBtn, isSelected && styles.tagBtnActive]}
                onPress={() => {
                  const newDietary = isSelected
                    ? value.dietary.filter((d) => d !== tag.id)
                    : [...value.dietary, tag.id];
                  set({ dietary: newDietary });
                }}
              >
                <Text style={[styles.tagTxt, isSelected && styles.tagTxtActive]}>
                  {tag.icon} {tag.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Source link */}
      <View style={styles.card}>
        <Text style={styles.label}>🔗 Video / source link</Text>
        <TextInput
          style={styles.input}
          value={value.sourceUrl ?? ''}
          onChangeText={(t) => set({ sourceUrl: t })}
          placeholder="https://instagram.com/reel/…"
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.hint}>Saved with the recipe so you never lose the original.</Text>
      </View>

      {/* Ingredients */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Ingredients ({value.ingredients.length})</Text>
        {value.ingredients.map((ing, i) => (
          <View key={i} style={styles.ingRow}>
            <TextInput
              style={[styles.input, styles.amount]}
              value={ing.amount ? String(ing.amount) : ''}
              onChangeText={(t) => updateIngredient(i, { amount: toNum(t) })}
              placeholder="1"
              placeholderTextColor="#BBB"
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, styles.unit]}
              value={ing.unit}
              onChangeText={(t) => updateIngredient(i, { unit: t })}
              placeholder="cup"
              placeholderTextColor="#BBB"
            />
            <TextInput
              style={[styles.input, styles.ingName]}
              value={ing.name}
              onChangeText={(t) => updateIngredient(i, { name: t })}
              placeholder="Ingredient"
              placeholderTextColor="#BBB"
            />
            <TouchableOpacity onPress={() => removeIngredient(i)} style={styles.removeBtn}>
              <Text style={styles.removeTxt}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity onPress={addIngredient} style={styles.addBtn}>
          <Text style={styles.addTxt}>+ Add ingredient</Text>
        </TouchableOpacity>
      </View>

      {/* Nutrition */}
      <View style={styles.card}>
        <View style={styles.nutriHead}>
          <Text style={styles.sectionTitle}>Nutrition (per serving)</Text>
          <TouchableOpacity onPress={estimate} disabled={estimating}>
            <Text style={styles.estimateLink}>
              {estimating ? 'Estimating…' : '✨ Estimate'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.row}>
          <NumField label="Calories" value={value.calories}
            onChange={n =>
              onChange({
                ...value,
                calories: n,
                nutrition: { ...(value.nutrition ?? {}), calories: n, estimated: false },
              })
            } />
          <NumField label="Protein (g)" value={value.nutrition?.protein ?? 0}
            onChange={n => setNutrition({ protein: n, estimated: false })} />
          <NumField label="Carbs (g)" value={value.nutrition?.carbs ?? 0}
            onChange={n => setNutrition({ carbs: n, estimated: false })} />
          <NumField label="Fat (g)" value={value.nutrition?.fat ?? 0}
            onChange={n => setNutrition({ fat: n, estimated: false })} />
        </View>

        {/* Only while the figures are the model's. Editing any of them clears
            the flag, because from that point a person stands behind them. */}
        {value.nutrition?.estimated && (
          <Text style={styles.estimateNote}>⚠︎ {ESTIMATE_NOTE}</Text>
        )}
      </View>

      {/* Steps */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Steps ({value.steps.length})</Text>
        {value.steps.map((step, i) => (
          <View key={i} style={styles.stepBlock}>
            <View style={styles.stepRow}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumTxt}>{i + 1}</Text>
              </View>
              <TextInput
                style={[styles.input, styles.stepInput]}
                value={step}
                onChangeText={(t) => updateStep(i, t)}
                placeholder="Describe this step"
                placeholderTextColor="#BBB"
                multiline
              />
              <TouchableOpacity onPress={() => removeStep(i)} style={styles.removeBtn}>
                <Text style={styles.removeTxt}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* Entered in minutes, stored in seconds — the same unit cook mode
                counts down in, and the same shape a creator's step uses. */}
            <View style={styles.timerRow}>
              <Text style={styles.timerLabel}>⏱ Timer</Text>
              <TextInput
                style={styles.timerInput}
                value={timerMinutes(value.stepTimers?.[i])}
                onChangeText={(t) => updateTimer(i, t)}
                placeholder="–"
                placeholderTextColor="#CCC"
                keyboardType="number-pad"
              />
              <Text style={styles.timerUnit}>min</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity onPress={addStep} style={styles.addBtn}>
          <Text style={styles.addTxt}>+ Add step</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.numField}>
      <TextInput
        style={[styles.input, styles.numInput]}
        value={value ? String(value) : ''}
        onChangeText={(t) => onChange(toNum(t))}
        placeholder="0"
        placeholderTextColor="#BBB"
        keyboardType="numeric"
      />
      <Text style={styles.numLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6 },
  mt: { marginTop: 14 },
  hint: { fontSize: 12, color: '#999', marginTop: 6 },
  input: {
    backgroundColor: '#FFF9F2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },

  metaRow: { flexDirection: 'row', gap: 8 },
  numField: { flex: 1, alignItems: 'center' },
  numInput: { width: '100%', textAlign: 'center' },
  numLabel: { fontSize: 11, color: '#888', marginTop: 4, textAlign: 'center' },

  difficultyRow: { flexDirection: 'row', gap: 8 },
  difficultyBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F5F5F5', alignItems: 'center' },
  difficultyBtnActive: { backgroundColor: '#F2701E' },
  difficultyTxt: { fontSize: 14, fontWeight: '600', color: '#666' },
  difficultyTxtActive: { color: '#FFF' },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E0E0E0' },
  tagBtnActive: { backgroundColor: '#E8F5E9', borderColor: '#3C8D40' },
  tagTxt: { fontSize: 13, fontWeight: '600', color: '#666' },
  tagTxtActive: { color: '#3C8D40' },

  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  amount: { width: 52, textAlign: 'center' },
  unit: { width: 60 },
  ingName: { flex: 1 },

  stepBlock: { marginBottom: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 36 },
  timerLabel: { fontSize: 13, color: '#888' },
  timerInput: {
    width: 56,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#EDE3D6',
    borderRadius: 8,
    fontSize: 14,
    color: '#1A1A1A',
    textAlign: 'center',
  },
  timerUnit: { fontSize: 13, color: '#888' },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F2701E',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  stepNumTxt: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  stepInput: { flex: 1, minHeight: 42, textAlignVertical: 'top' },

  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  removeTxt: { color: '#FF5252', fontSize: 14, fontWeight: '700' },
  addBtn: {
    borderWidth: 1,
    borderColor: '#F2701E',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  photo: { width: '100%', height: 170, borderRadius: 12, backgroundColor: '#F0EDE7' },
  photoActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  photoAction: { color: '#F2701E', fontWeight: '700', fontSize: 14 },
  photoRemove: { color: '#8A8A8A', fontWeight: '600', fontSize: 14 },
  photoEmpty: {
    height: 130, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#E4DACA', backgroundColor: '#FAF8F4',
  },
  photoEmptyIcon: { fontSize: 30 },
  photoEmptyText: { fontSize: 14, color: '#8A8A8A', fontWeight: '600' },
  nutriHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  estimateLink: { fontSize: 13, color: '#F2701E', fontWeight: '700' },
  estimateNote: { fontSize: 12, color: '#8A4B1E', lineHeight: 17, marginTop: 10 },
  row: { flexDirection: 'row', gap: 10 },
  addTxt: { color: '#F2701E', fontSize: 14, fontWeight: '600' },
});
