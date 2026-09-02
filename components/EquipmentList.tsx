// Equipment as a growing list of fields, one per item.
//
// It was a comma-separated line first, then a fixed set of chips. Both were
// wrong, for opposite reasons. The comma line asked people to know that commas
// were the separator; the chips imposed a closed list on something genuinely
// open — a tortilla press, a pizza stone, a sous-vide stick, a specific pan
// nobody owns.
//
// Cuisine stays a fixed list because search filters on it, and a filter cannot
// group "Italian" with "italienisch". Nothing filters on equipment: it is read,
// not matched. So the argument for constraining the values does not apply here,
// and a free field costs nothing.
//
// One input per item, an add button underneath, a remove on each row: the same
// shape as the ingredient and step lists, so it needs no explaining.
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export default function EquipmentList({
  value,
  onChange,
}: {
  value?: string[] | null;
  onChange: (next: string[]) => void;
}) {
  // Always one empty row to type into, so adding the first item does not
  // require finding the add button first.
  const items = value?.length ? value : [''];

  const update = (i: number, text: string) =>
    onChange(items.map((v, k) => (k === i ? text : v)));

  // Blanks are dropped on the way out rather than while typing — filtering as
  // someone types would delete the row from under them the moment they cleared
  // it to start over.
  const remove = (i: number) => onChange(items.filter((_, k) => k !== i));

  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={s.row}>
          <TextInput
            style={s.input}
            value={item}
            onChangeText={t => update(i, t)}
            placeholder="Air fryer, pizza stone, tortilla press…"
            placeholderTextColor="#BBB"
          />
          {items.length > 1 && (
            <TouchableOpacity style={s.remove} onPress={() => remove(i)}>
              <Text style={s.removeText}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <TouchableOpacity style={s.add} onPress={() => onChange([...items, ''])}>
        <Text style={s.addText}>+ Add equipment</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Drop the empty rows before saving. */
export const cleanEquipment = (v?: string[] | null): string[] =>
  (v ?? []).map(x => x.trim()).filter(Boolean);

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  input: {
    flex: 1, backgroundColor: '#FFF', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, color: '#1A1A1A',
    borderWidth: 1, borderColor: '#EEE',
  },
  remove: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center',
    justifyContent: 'center', backgroundColor: '#F5F5F5',
  },
  removeText: { fontSize: 20, color: '#999', lineHeight: 22 },
  add: { paddingVertical: 10 },
  addText: { fontSize: 14, fontWeight: '600', color: '#B84B08' },
});
