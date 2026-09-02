// Pick several from a fixed list.
//
// Both cuisine and equipment were free text first, and free text is where the
// same thing arrives under four names: "Italian", "italienisch", "Italy",
// "italian ". Nothing can group or filter across that, which is the entire
// point of having the field. So the values are chosen, not spelled.
//
// Multi-select for both, and for the same reason in each case: a dish can come
// out of two kitchens — fusion is a shelf, not an edge case — and a recipe can
// want both an air fryer and a blender.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type ChipOption = { id: string; label: string; icon?: string };

export default function ChipMultiSelect({
  options,
  value,
  onChange,
}: {
  options: readonly ChipOption[];
  value?: string[] | null;
  onChange: (next: string[]) => void;
}) {
  const selected = value ?? [];

  // Tapping a selected chip removes it. No separate clear control: an empty
  // selection is the default, and both fields are optional.
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  return (
    <View style={s.wrap}>
      {options.map(o => {
        const active = selected.includes(o.id);
        return (
          <TouchableOpacity
            key={o.id}
            style={[s.chip, active && s.chipActive]}
            onPress={() => toggle(o.id)}
          >
            <Text style={[s.chipText, active && s.chipTextActive]}>
              {o.icon ? `${o.icon} ` : ''}{o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: '#F3F3F3', borderWidth: 1, borderColor: '#E6E6E6',
  },
  chipActive: { backgroundColor: '#FFF0E4', borderColor: '#F2701E' },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActive: { color: '#B84B08', fontWeight: '700' },
});
