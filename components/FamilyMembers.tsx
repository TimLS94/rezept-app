// Who you cook for, as people rather than as a number.
//
// It used to live inline in the profile screen, which meant "3–4 people" from
// onboarding and the actual list of names sat on two different screens saying
// related things. They belong together: the household size is a shortcut for
// this list, and portion scaling reads whichever is more specific.
import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getCurrentUser } from '../lib/supabase';
import { invalidateFamilyServings } from '../lib/family';
import { COLORS, FONTS } from '../lib/theme';

export type Member = {
  id: string;
  name: string;
  age: string;
  gender: 'male' | 'female';
  weight: string;
};

// Roughly how much of an adult portion someone eats, from age and weight.
// Deliberately crude: it decides whether the shopping list says 400g or 600g
// of pasta, not anything that matters medically.
export function portionFor(m: { age: string; gender: string; weight: string }): number {
  const weightKg = (parseFloat(m.weight) || 150) * 0.453592;
  const age = parseInt(m.age) || 30;
  const bmr = m.gender === 'male'
    ? 10 * weightKg + 6.25 * 170 - 5 * age + 5
    : 10 * weightKg + 6.25 * 160 - 5 * age - 161;
  return Math.round(((bmr * 1.5) / 2000) * 100) / 100;
}

export default function FamilyMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Member | null>(null);

  const load = async () => {
    const user = await getCurrentUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('family_members')
      .select('id, name, age, gender, weight')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: true });
    setMembers(
      (data ?? []).map((d: any) => ({
        id: d.id,
        name: d.name ?? '',
        age: d.age?.toString() ?? '',
        gender: (d.gender as 'male' | 'female') ?? 'male',
        weight: d.weight?.toString() ?? '',
      })),
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!draft?.name.trim()) {
      Alert.alert('Name needed', 'Give this person a name so you can tell the portions apart.');
      return;
    }
    const user = await getCurrentUser();
    if (!user) return;
    setAdding(true);

    const row = {
      profile_id: user.id,
      name: draft.name.trim(),
      age: parseInt(draft.age) || null,
      gender: draft.gender,
      weight: parseFloat(draft.weight) || null,
      portion_multiplier: portionFor(draft),
      dietary_restrictions: [],
    };

    const { data, error } = await supabase.from('family_members').insert(row).select().single();
    setAdding(false);

    if (error || !data) {
      Alert.alert('Could not save', error?.message ?? 'Please try again.');
      return;
    }
    setMembers(prev => [...prev, { ...draft, id: data.id }]);
    setDraft(null);
    // Portion scaling caches the household size; without this the next recipe
    // still uses the old number.
    invalidateFamilyServings();
  };

  const remove = (m: Member) => {
    Alert.alert('Remove person', `Remove ${m.name} from your household?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setMembers(prev => prev.filter(x => x.id !== m.id));
          await supabase.from('family_members').delete().eq('id', m.id);
          invalidateFamilyServings();
        },
      },
    ]);
  };

  if (loading) return <ActivityIndicator color={COLORS.orange} style={{ marginVertical: 20 }} />;

  return (
    <View>
      {members.map(m => (
        <View key={m.id} style={styles.row}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{m.name.charAt(0).toUpperCase() || '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{m.name}</Text>
            <Text style={styles.detail}>
              {[m.age && `${m.age} yrs`, m.weight && `${m.weight} lb`, `${portionFor(m)}× portion`]
                .filter(Boolean).join('  ·  ')}
            </Text>
          </View>
          <TouchableOpacity onPress={() => remove(m)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={18} color={COLORS.warmGray} />
          </TouchableOpacity>
        </View>
      ))}

      {draft ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={draft.name}
            onChangeText={t => setDraft({ ...draft, name: t })}
            placeholder="Name"
            placeholderTextColor="#BBB"
            autoFocus
          />
          <View style={styles.formRow}>
            <TextInput
              style={[styles.input, styles.small]}
              value={draft.age}
              onChangeText={t => setDraft({ ...draft, age: t.replace(/[^0-9]/g, '') })}
              placeholder="Age"
              placeholderTextColor="#BBB"
              keyboardType="number-pad"
            />
            <TextInput
              style={[styles.input, styles.small]}
              value={draft.weight}
              onChangeText={t => setDraft({ ...draft, weight: t.replace(/[^0-9.]/g, '') })}
              placeholder="Weight (lb)"
              placeholderTextColor="#BBB"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.formRow}>
            {(['male', 'female'] as const).map(g => (
              <TouchableOpacity
                key={g}
                style={[styles.gender, draft.gender === g && styles.genderOn]}
                onPress={() => setDraft({ ...draft, gender: g })}
              >
                <Text style={[styles.genderText, draft.gender === g && styles.genderTextOn]}>
                  {g === 'male' ? 'Male' : 'Female'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.formRow}>
            <TouchableOpacity style={styles.cancel} onPress={() => setDraft(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirm} onPress={save} disabled={adding}>
              <Text style={styles.confirmText}>{adding ? '…' : 'Add'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.add}
          onPress={() => setDraft({ id: '', name: '', age: '', gender: 'male', weight: '' })}
        >
          <Ionicons name="add" size={17} color={COLORS.orange} />
          <Text style={styles.addText}>Add someone</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.note}>
        Portions scale from these people when you add any; the household size above is used
        when you have not.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF', borderRadius: 12, padding: 13, marginBottom: 8,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFE9DC',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: COLORS.orange },
  name: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  detail: { fontSize: 12, color: COLORS.warmGray, marginTop: 2 },

  add: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#E4DACA',
  },
  addText: { fontSize: 14, color: COLORS.orange, fontWeight: '600' },

  form: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 13, gap: 9,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  formRow: { flexDirection: 'row', gap: 9 },
  input: {
    backgroundColor: '#FAF8F4', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, color: '#1A1A1A', borderWidth: 1, borderColor: '#EFE7DC',
  },
  small: { flex: 1 },
  gender: {
    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#EFE7DC',
  },
  genderOn: { borderColor: COLORS.orange, backgroundColor: '#FFF6EE' },
  genderText: { fontSize: 14, color: COLORS.navy, fontWeight: '600' },
  genderTextOn: { color: COLORS.orange },
  cancel: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: COLORS.warmGray, fontWeight: '600' },
  confirm: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.orange, alignItems: 'center' },
  confirmText: { color: '#FFF', fontWeight: '700' },

  note: { fontSize: 12, color: COLORS.warmGray, lineHeight: 18, marginTop: 12 },
});
