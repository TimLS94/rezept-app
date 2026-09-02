// The nutrition block: calories, the three macros, and the estimate button.
//
// It lived inside RecipeEditor, which only the cookbook path uses. The creator
// path has its own editors — upload, edit and import — and none of them had any
// way to enter nutrition at all. So a creator could see calories on their own
// recipe and nothing else, with no field to type into, which is what this
// component exists to end.
//
// Shared rather than copied, because the two editors have already drifted once
// and a third copy of the estimate flag would be a third chance to get the
// labelling wrong. That flag is not cosmetic: figures the model produced must
// say so, and must stop saying so the moment a person edits them.
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Nutrition, estimateNutrition, ESTIMATE_NOTE } from '../lib/nutrition';
// Structural, not the Ingredient type from data/recipes: the creator editor
// declares its own shape with the same fields, and the estimate only ever reads
// name, amount and unit. Insisting on one nominal type here would force a cast
// at every call site for no gain.
type IngredientLike = { name: string; amount: number; unit: string };

export type NutritionValue = {
  calories: number;
  nutrition?: Nutrition;
};

type Props = {
  value: NutritionValue;
  /** Needed for the estimate; it is worked out from the ingredient list. */
  ingredients: IngredientLike[];
  servings: number;
  onChange: (next: NutritionValue) => void;
};

export default function NutritionFields({ value, ingredients, servings, onChange }: Props) {
  const [estimating, setEstimating] = useState(false);

  // Every macro edit carries calories along. Writing { protein } on its own
  // used to produce a nutrition object with no calories, which downstream reads
  // as "this recipe has no calorie data" — the meal then counted its macros
  // while displaying nothing.
  const setNutrition = (patch: Partial<Nutrition>) =>
    onChange({
      ...value,
      nutrition: {
        ...(value.calories > 0 ? { calories: value.calories } : {}),
        ...(value.nutrition ?? {}),
        ...patch,
      },
    });

  const estimate = async () => {
    if (estimating) return;
    setEstimating(true);
    const r = await estimateNutrition(ingredients as any, servings);
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
    onChange({
      ...value,
      calories: r.nutrition.calories ?? value.calories,
      nutrition: r.nutrition,
    });
  };

  return (
    <>
      <View style={s.header}>
        <Text style={s.title}>Nutrition (per serving)</Text>
        <TouchableOpacity onPress={estimate} disabled={estimating}>
          <Text style={s.estimateLink}>{estimating ? 'Estimating…' : '✨ Estimate'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.row}>
        <NumField
          label="Calories"
          value={value.calories}
          onChange={n =>
            onChange({
              ...value,
              calories: n,
              nutrition: { ...(value.nutrition ?? {}), calories: n, estimated: false },
            })
          }
        />
        <NumField label="Protein · g" value={value.nutrition?.protein ?? 0}
          onChange={n => setNutrition({ protein: n, estimated: false })} />
      </View>
      <View style={[s.row, s.mt]}>
        <NumField label="Carbs · g" value={value.nutrition?.carbs ?? 0}
          onChange={n => setNutrition({ carbs: n, estimated: false })} />
        <NumField label="Fat · g" value={value.nutrition?.fat ?? 0}
          onChange={n => setNutrition({ fat: n, estimated: false })} />
      </View>

      {/* Shown only while the figures are the model's. Editing any one of them
          clears the flag, because from that point a person stands behind them. */}
      {value.nutrition?.estimated && <Text style={s.note}>⚠︎ {ESTIMATE_NOTE}</Text>}
    </>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={s.numField}>
      <TextInput
        style={s.numInput}
        value={value ? String(value) : ''}
        onChangeText={t => onChange(Math.max(0, parseInt(t.replace(/[^0-9]/g, ''), 10) || 0))}
        placeholder="0"
        placeholderTextColor="#BBB"
        keyboardType="numeric"
      />
      <Text style={s.numLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  estimateLink: { fontSize: 14, fontWeight: '600', color: '#B84B08' },
  row: { flexDirection: 'row', gap: 12 },
  mt: { marginTop: 10 },
  numField: { flex: 1 },
  numInput: {
    borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#1A1A1A',
    backgroundColor: '#FFF',
  },
  numLabel: { fontSize: 12, color: '#777', marginTop: 4 },
  note: { fontSize: 12, color: '#8A6D3B', marginTop: 10, lineHeight: 17 },
});
