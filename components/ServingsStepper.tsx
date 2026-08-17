// Portion count on a recipe card, remembered per recipe.
//
// It has to sit on the card rather than only inside cook mode, because the
// number feeds both the shopping list and cook mode — deciding "six tonight"
// after the list is already written is too late.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../lib/theme';

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

export default function ServingsStepper({
  value,
  onChange,
  familyServings,
}: {
  value: number;
  onChange: (n: number) => void;
  /** The household size from Settings, offered as one tap. Null = not set. */
  familyServings?: number | null;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name="people-outline" size={13} color={COLORS.warmGray} />
      <TouchableOpacity style={styles.btn} onPress={() => onChange(Math.max(1, value - 1))} hitSlop={HIT}>
        <Ionicons name="remove" size={14} color={COLORS.navy} />
      </TouchableOpacity>
      <Text style={styles.val}>{value}</Text>
      <TouchableOpacity style={styles.btn} onPress={() => onChange(value + 1)} hitSlop={HIT}>
        <Ionicons name="add" size={14} color={COLORS.navy} />
      </TouchableOpacity>
      {familyServings != null && (
        <TouchableOpacity
          style={[styles.family, value === familyServings && styles.familyActive]}
          onPress={() => onChange(familyServings)}
          hitSlop={HIT}
        >
          <Text style={[styles.familyText, value === familyServings && styles.familyTextActive]}>
            👨‍👩‍👧 Family
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  btn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F4F1EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  val: { fontSize: 13, fontWeight: '700', color: COLORS.navy, minWidth: 16, textAlign: 'center' },
  family: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: '#F4F1EC',
    marginLeft: 2,
  },
  familyActive: { backgroundColor: COLORS.orange },
  familyText: { fontSize: 11, color: COLORS.warmGray, fontWeight: '600' },
  familyTextActive: { color: '#FFF' },
});
