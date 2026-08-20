// Daily targets.
//
// Numbers about someone's body deserve care. The screen suggests a starting
// point so nobody faces four empty fields, says plainly that it is a rough
// suggestion rather than advice, and leaves every figure editable — including
// to nothing at all, which means "I would rather not track this".
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { COLORS, FONTS } from '../../lib/theme';
import { HEADER_TOP } from '../../lib/layout';
import { goBackOr } from '../../lib/nav';
import { Preferences, loadPreferences, savePreferences, NUTRITION_GOALS, suggestedTargets } from '../../lib/preferences';

export default function NutritionGoalsScreen() {
  const [prefs, setPrefs] = useState<Preferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPreferences().then(r => { setPrefs(r.prefs); setLoading(false); });
  }, []);

  const n = prefs.nutrition ?? {};
  const setN = (patch: Partial<NonNullable<Preferences['nutrition']>>) =>
    setPrefs(p => ({ ...p, nutrition: { ...(p.nutrition ?? {}), ...patch } }));

  const pickGoal = (goal: NonNullable<Preferences['nutrition']>['goal']) => {
    // "My own numbers" leaves the fields alone. Every other goal fills them
    // in, which is the point of asking: most people know "I want to lose
    // weight" and not "1800 kcal, 135g protein". They stay editable either
    // way, and editing one flips the goal to custom below.
    if (goal === 'custom') { setN({ goal }); return; }
    setN({ goal, ...suggestedTargets(goal) });
  };

  const num = (v: number | undefined) => (v == null ? '' : String(v));
  const parse = (t: string) => {
    const v = parseInt(t.replace(/[^0-9]/g, ''), 10);
    return isNaN(v) ? undefined : v;
  };

  const save = async () => {
    setSaving(true);
    await savePreferences(prefs);
    setSaving(false);
    goBackOr('/profile');
  };

  if (loading) {
    return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator color={COLORS.orange} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/profile')} style={styles.hBtn}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.hTitle}>Nutrition Goals</Text>
        <TouchableOpacity onPress={save} style={styles.hBtnR} disabled={saving}>
          <Text style={styles.save}>{saving ? '…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>What are you aiming for?</Text>
        <View style={styles.goals}>
          {NUTRITION_GOALS.map(g => {
            const on = n.goal === g.id;
            return (
              <TouchableOpacity key={g.id} style={[styles.goal, on && styles.goalOn]} onPress={() => pickGoal(g.id)}>
                <Text style={styles.goalIcon}>{g.icon}</Text>
                <Text style={[styles.goalText, on && styles.goalTextOn]}>{g.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Daily targets</Text>
        <Text style={styles.note}>
          {n.goal === 'custom'
            ? 'Your own numbers. Nothing is suggested or overwritten here.'
            : 'A rough starting point based on your goal — change any figure and it becomes yours.'}
          {' '}These are not medical advice, and nothing in the app is blocked by them.
          Leave a field empty to stop tracking it.
        </Text>

        {[
          { key: 'calories' as const, label: 'Calories', unit: 'kcal' },
          { key: 'protein' as const, label: 'Protein', unit: 'g' },
          { key: 'carbs' as const, label: 'Carbs', unit: 'g' },
          { key: 'fat' as const, label: 'Fat', unit: 'g' },
        ].map(f => (
          <View key={f.key} style={styles.field}>
            <Text style={styles.fieldLabel}>{f.label}</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={num(n[f.key])}
                onChangeText={t => setN({ [f.key]: parse(t), goal: 'custom' })}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor="#BBB"
              />
              <Text style={styles.unit}>{f.unit}</Text>
            </View>
          </View>
        ))}

        <View style={{ height: 50 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: HEADER_TOP, paddingBottom: 16,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  hBtn: { width: 60 }, hBtnR: { width: 60, alignItems: 'flex-end' },
  back: { fontSize: 16, color: COLORS.orange, fontWeight: '600' },
  save: { fontSize: 16, color: COLORS.orange, fontWeight: '700' },
  hTitle: { fontFamily: 'Anton_400Regular', fontSize: 19, color: COLORS.navy },

  body: { padding: 20 },
  label: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.navy, marginTop: 18, marginBottom: 10 },
  note: { fontSize: 12.5, color: COLORS.warmGray, lineHeight: 18, marginTop: -4, marginBottom: 14 },

  goals: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  goal: {
    width: '47%', backgroundColor: '#FFF', borderRadius: 14, paddingVertical: 18,
    alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: '#EFE7DC',
  },
  goalOn: { borderColor: COLORS.orange, backgroundColor: '#FFF6EE' },
  goalIcon: { fontSize: 22 },
  goalText: { fontSize: 14, fontWeight: '600', color: COLORS.navy },
  goalTextOn: { color: COLORS.orange },

  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: '#EFE7DC', marginBottom: 9,
  },
  fieldLabel: { fontSize: 15, color: COLORS.navy, fontWeight: '600' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { fontSize: 16, color: COLORS.navy, minWidth: 62, textAlign: 'right', fontWeight: '700', paddingVertical: 0 },
  unit: { fontSize: 13, color: COLORS.warmGray, width: 32 },
});
