// Per-serving nutrition on a recipe, and where the numbers came from.
//
// The provenance is the point. A creator who worked their figures out gets
// them shown plainly; anything the model estimated is labelled as an estimate
// every time it appears. Presenting a guess as a measurement is the claim the
// FTC treats as deceptive, and it is dishonest to whoever is deciding what to
// eat — so the label travels with the number rather than living in a footnote.
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../lib/theme';
import type { Recipe } from '../data/recipes';

export default function NutritionStrip({
  nutrition, calories, flush,
}: {
  nutrition?: Recipe['nutrition'];
  calories?: number;
  /**
   * Set when the strip sits inside a container that already has its own
   * padding. Without it the card carries its own 16pt margin on top of the
   * parent's, and it ends up visibly narrower than everything around it.
   */
  flush?: boolean;
}) {
  // `calories` predates the nutrition column, so a recipe can carry one
  // without the other. Either alone is worth showing.
  const kcal = nutrition?.calories ?? (calories && calories > 0 ? calories : undefined);
  const hasMacros = nutrition?.protein != null || nutrition?.carbs != null || nutrition?.fat != null;
  if (kcal == null && !hasMacros) return null;

  const Cell = ({ label, value, unit }: { label: string; value?: number; unit: string }) => (
    <View style={styles.cell}>
      <Text style={styles.value}>{value != null ? `${value}${unit}` : '—'}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );

  return (
    <View style={[styles.card, flush && styles.cardFlush]}>
      <View style={styles.head}>
        <Text style={styles.title}>Per serving</Text>
        {nutrition?.estimated && <Text style={styles.badge}>estimated</Text>}
      </View>

      <View style={styles.row}>
        <Cell label="Calories" value={kcal} unit="" />
        <Cell label="Protein" value={nutrition?.protein} unit="g" />
        <Cell label="Carbs" value={nutrition?.carbs} unit="g" />
        <Cell label="Fat" value={nutrition?.fat} unit="g" />
      </View>

      {nutrition?.estimated && (
        <Text style={styles.note}>
          Worked out from the ingredients, not measured. Treat it as a guide.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 14,
    marginHorizontal: 16, marginTop: 12,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  cardFlush: { marginHorizontal: 0, marginTop: 0, marginBottom: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.navy },
  badge: {
    fontSize: 10, fontWeight: '700', color: '#8A4B1E',
    backgroundColor: '#FFF3E9', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center' },
  value: { fontSize: 17, fontWeight: '800', color: COLORS.navy },
  label: { fontSize: 11, color: COLORS.warmGray, marginTop: 2 },
  note: { fontSize: 11.5, color: COLORS.warmGray, lineHeight: 16, marginTop: 10 },
});
