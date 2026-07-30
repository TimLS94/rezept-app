import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Ingredient } from '../data/recipes';

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
  sourceUrl?: string;
};

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
  const addStep = () => set({ steps: [...value.steps, ''] });
  const removeStep = (i: number) => set({ steps: value.steps.filter((_, idx) => idx !== i) });

  return (
    <View>
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
          <NumField label="Calories" value={value.calories} onChange={(n) => set({ calories: n })} />
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

      {/* Steps */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Steps ({value.steps.length})</Text>
        {value.steps.map((step, i) => (
          <View key={i} style={styles.stepRow}>
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

  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  amount: { width: 52, textAlign: 'center' },
  unit: { width: 60 },
  ingName: { flex: 1 },

  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F57C00',
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
    borderColor: '#F57C00',
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addTxt: { color: '#F57C00', fontSize: 14, fontWeight: '600' },
});
