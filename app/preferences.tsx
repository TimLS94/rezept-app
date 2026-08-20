// Editing what onboarding asked.
//
// Onboarding tells people "everything editable later in Profile". This is
// that screen — without it that sentence is a promise the app does not keep,
// which is worse than never having made it.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { COLORS, FONTS } from '../lib/theme';
import { HEADER_TOP } from '../lib/layout';
import { goBackOr } from '../lib/nav';
import FamilyMembers from '../components/FamilyMembers';
import {
  Preferences, loadPreferences, savePreferences,
  DIETS, AVOID, TIME_BUDGET, CUISINES,
} from '../lib/preferences';
import { loadConsent, saveConsent, Consent, MARKETING_EMAIL_NOTE, PUSH_NOTE } from '../lib/consent';

export default function PreferencesScreen() {
  const [prefs, setPrefs] = useState<Preferences>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [consent, setConsent] = useState<Consent>({ push: false, marketingEmail: false });

  useEffect(() => {
    loadPreferences().then(r => { setPrefs(r.prefs); setLoading(false); });
    loadConsent().then(setConsent).catch(() => {});
  }, []);

  // Saved the moment it is switched, not on the Save button. Withdrawing
  // consent must take effect even if the person then backs out of the screen
  // — leaving it pending behind a button they did not press is exactly the
  // failure CAN-SPAM's opt-out rule exists to prevent.
  const setPush = async (on: boolean) => {
    setConsent(c => ({ ...c, push: on }));
    await saveConsent(on, null);
  };
  const setEmail = async (on: boolean) => {
    setConsent(c => ({ ...c, marketingEmail: on }));
    await saveConsent(null, on);
  };

  const toggleIn = (key: 'diets' | 'avoid' | 'cuisines', id: string) =>
    setPrefs(p => {
      const list = p[key] ?? [];
      return { ...p, [key]: list.includes(id) ? list.filter(x => x !== id) : [...list, id] };
    });

  const save = async () => {
    setSaving(true);
    const r = await savePreferences(prefs);
    setSaving(false);
    if (!r.error) goBackOr('/profile');
  };

  const Chips = ({ group, options }: { group: 'diets' | 'avoid' | 'cuisines'; options: readonly { id: string; label: string; icon?: string }[] }) => (
    <View style={styles.chips}>
      {options.map(o => {
        const on = (prefs[group] ?? []).includes(o.id);
        return (
          <TouchableOpacity key={o.id} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleIn(group, o.id)}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>
              {o.icon ? `${o.icon} ` : ''}{o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator color={COLORS.orange} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/profile')} style={styles.headerBtn}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preferences</Text>
        <TouchableOpacity onPress={save} style={styles.headerBtnRight} disabled={saving}>
          <Text style={styles.save}>{saving ? '…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* The band selector and the kids toggle used to sit here. Both were
            saying, less precisely, what the list below says exactly — and
            having both on one screen meant two answers to the same question
            that could disagree. The list wins: it knows who eats how much. */}
        <Text style={styles.label}>Who you cook for</Text>
        <FamilyMembers />

        <Text style={styles.label}>Dietary preferences</Text>
        <Chips group="diets" options={DIETS} />

        <Text style={styles.label}>Allergies and foods to avoid</Text>
        <Text style={styles.note}>
          Always check the ingredients yourself — recipes are written by people, not by us.
        </Text>
        <Chips group="avoid" options={AVOID} />

        <Text style={styles.label}>Time you usually have</Text>
        {TIME_BUDGET.map(o => (
          <TouchableOpacity
            key={o.id}
            style={[styles.row, prefs.timeBudget === o.id && styles.rowOn]}
            onPress={() => setPrefs(p => ({ ...p, timeBudget: o.id }))}
          >
            <Text style={[styles.rowText, prefs.timeBudget === o.id && styles.rowTextOn]}>{o.label}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Cuisines you enjoy</Text>
        <Chips group="cuisines" options={CUISINES} />

        <Text style={styles.label}>Getting in touch</Text>
        <View style={styles.consentCard}>
          <View style={styles.consentHead}>
            <Text style={styles.consentIcon}>🔔</Text>
            <Text style={styles.consentTitle}>Notifications on your phone</Text>
            <Switch value={consent.push} onValueChange={setPush}
              trackColor={{ true: COLORS.orange, false: '#DDD3C4' }} />
          </View>
          <Text style={styles.consentText}>{PUSH_NOTE}</Text>
        </View>
        <View style={styles.consentCard}>
          <View style={styles.consentHead}>
            <Text style={styles.consentIcon}>✉️</Text>
            <Text style={styles.consentTitle}>Email about what's new</Text>
            <Switch value={consent.marketingEmail} onValueChange={setEmail}
              trackColor={{ true: COLORS.orange, false: '#DDD3C4' }} />
          </View>
          <Text style={styles.consentText}>{MARKETING_EMAIL_NOTE}</Text>
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  consentCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  consentHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  consentIcon: { fontSize: 20 },
  consentTitle: { flex: 1, fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.navy },
  consentText: { fontSize: 12.5, color: COLORS.warmGray, lineHeight: 18, marginTop: 10 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: HEADER_TOP, paddingBottom: 16,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  headerBtn: { width: 60 },
  headerBtnRight: { width: 60, alignItems: 'flex-end' },
  back: { fontSize: 16, color: COLORS.orange, fontWeight: '600' },
  save: { fontSize: 16, color: COLORS.orange, fontWeight: '700' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: COLORS.navy },

  body: { padding: 20 },
  label: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.navy, marginTop: 22, marginBottom: 10 },
  note: { fontSize: 12.5, color: COLORS.warmGray, marginTop: -4, marginBottom: 10, lineHeight: 18 },

  row: {
    backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: '#EFE7DC', marginBottom: 8,
  },
  rowOn: { borderColor: COLORS.orange, backgroundColor: '#FFF6EE' },
  rowText: { fontSize: 15, color: COLORS.navy, fontWeight: '600' },
  rowTextOn: { color: COLORS.orange },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderRadius: 12, padding: 16,
    borderWidth: 1.5, borderColor: '#EFE7DC',
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: {
    backgroundColor: '#FFF', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: '#EFE7DC',
  },
  chipOn: { borderColor: COLORS.orange, backgroundColor: '#FFF6EE' },
  chipText: { fontSize: 14, color: COLORS.navy, fontWeight: '600' },
  chipTextOn: { color: COLORS.orange },
});
