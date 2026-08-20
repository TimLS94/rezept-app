// Seven questions, asked once, all of them skippable.
//
// The point is not to collect data — it is that the first Home screen after
// this has something to work with. An app that opens on "no suggestions yet"
// has to be figured out before it is useful; one that already knows you cook
// for four and avoid shellfish is useful immediately.
//
// Every step can be skipped, and a skipped step stores nothing. That matters
// downstream: "no dietary preferences given" and "explicitly eats everything"
// must not look the same to whatever reads this later.
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../lib/theme';
import { HEADER_TOP } from '../lib/layout';
import {
  Preferences, savePreferences,
  HOUSEHOLD, DIETS, AVOID, TIME_BUDGET, CUISINES,
} from '../lib/preferences';
import { saveConsent, MARKETING_EMAIL_NOTE, PUSH_NOTE } from '../lib/consent';

const STEPS = 8;

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<Preferences>({});
  const [saving, setSaving] = useState(false);
  // Both start off. Consent that was never given must not look like consent,
  // and a pre-ticked box is the difference between asking and assuming.
  const [pushOk, setPushOk] = useState(false);
  const [emailOk, setEmailOk] = useState(false);

  const set = (patch: Partial<Preferences>) => setPrefs(p => ({ ...p, ...patch }));

  const toggleIn = (key: 'diets' | 'avoid' | 'cuisines', id: string) =>
    setPrefs(p => {
      const list = p[key] ?? [];
      return { ...p, [key]: list.includes(id) ? list.filter(x => x !== id) : [...list, id] };
    });

  const next = () => setStep(s => Math.min(s + 1, STEPS - 1));

  const finish = async () => {
    setSaving(true);
    // A failure here is not worth blocking on: the answers are a convenience,
    // and refusing to let someone into the app because a preference did not
    // save would be the wrong trade.
    await savePreferences(prefs);
    // Recorded separately from the preferences, and always — including when
    // both answers are no. "Asked and declined" is a fact worth having.
    await saveConsent(pushOk, emailOk);
    setSaving(false);
    router.replace('/home');
  };

  const Chip = ({ id, label, icon, group }: { id: string; label: string; icon?: string; group: 'diets' | 'avoid' | 'cuisines' }) => {
    const on = (prefs[group] ?? []).includes(id);
    return (
      <TouchableOpacity style={[styles.chip, on && styles.chipOn]} onPress={() => toggleIn(group, id)}>
        {icon ? <Text style={styles.chipIcon}>{icon}</Text> : null}
        <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const Row = ({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: string }) => (
    <TouchableOpacity style={[styles.row, selected && styles.rowOn]} onPress={onPress}>
      {icon ? <Text style={styles.rowIcon}>{icon}</Text> : null}
      <Text style={[styles.rowText, selected && styles.rowTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Progress. Seven segments, so "how much is left" is answered by
          looking rather than by counting. */}
      <View style={styles.progress}>
        {Array.from({ length: STEPS }, (_, i) => (
          <View key={i} style={[styles.seg, i <= step && styles.segOn]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <View style={styles.welcome}>
            <Text style={styles.wordmark}>SPOON<Text style={styles.wordmarkAccent}>DROP</Text></Text>
            <View style={styles.welcomeArt}>
              <Text style={styles.welcomeEmoji}>🍲</Text>
            </View>
            <Text style={styles.title}>Dinner made simple.</Text>
            <Text style={styles.lead}>
              Recipes that fit your week, your kitchen and what you already have in the fridge.
            </Text>
          </View>
        )}

        {step === 1 && (
          <>
            <Text style={styles.title}>Who are you cooking for?</Text>
            <Text style={styles.lead}>So portions and shopping lists come out the right size.</Text>
            {HOUSEHOLD.map(o => (
              <Row key={o.id} label={o.label} icon="👥"
                selected={prefs.household === o.id}
                onPress={() => set({ household: o.id })} />
            ))}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>I have kids</Text>
              <Switch
                value={!!prefs.hasKids}
                onValueChange={v => set({ hasKids: v })}
                trackColor={{ true: COLORS.green, false: '#DDD' }}
              />
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>Any dietary preferences?</Text>
            <Text style={styles.lead}>Choose all that apply.</Text>
            <View style={styles.chips}>
              {DIETS.map(d => <Chip key={d.id} {...d} group="diets" />)}
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>Any allergies or foods to avoid?</Text>
            <Text style={styles.lead}>
              We will keep these out of what we suggest. Always check the ingredients yourself —
              recipes are written by people, not by us.
            </Text>
            <View style={styles.chips}>
              {AVOID.map(a => <Chip key={a.id} {...a} group="avoid" />)}
            </View>
            <TouchableOpacity
              style={[styles.row, (prefs.avoid?.length ?? 0) === 0 && styles.rowOn]}
              onPress={() => set({ avoid: [] })}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.green} />
              <Text style={styles.rowText}>None of these</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.title}>How much time do you usually have?</Text>
            <Text style={styles.lead}>We will lead with recipes that fit.</Text>
            {TIME_BUDGET.map(t => (
              <Row key={t.id} label={t.label}
                selected={prefs.timeBudget === t.id}
                onPress={() => set({ timeBudget: t.id })} />
            ))}
          </>
        )}

        {step === 5 && (
          <>
            <Text style={styles.title}>What cuisines do you enjoy?</Text>
            <Text style={styles.lead}>Choose your favourites.</Text>
            <View style={styles.chips}>
              {CUISINES.map(c => <Chip key={c.id} {...c} group="cuisines" />)}
            </View>
          </>
        )}

        {step === 6 && (
          <>
            <Text style={styles.title}>May we get in touch?</Text>
            <Text style={styles.lead}>
              Both are off unless you turn them on, and neither is needed to use SpoonDrop.
            </Text>

            <View style={styles.consentCard}>
              <View style={styles.consentHead}>
                <Text style={styles.consentIcon}>🔔</Text>
                <Text style={styles.consentTitle}>Notifications on your phone</Text>
                <Switch
                  value={pushOk}
                  onValueChange={setPushOk}
                  trackColor={{ true: COLORS.orange, false: '#DDD3C4' }}
                />
              </View>
              <Text style={styles.consentText}>{PUSH_NOTE}</Text>
            </View>

            <View style={styles.consentCard}>
              <View style={styles.consentHead}>
                <Text style={styles.consentIcon}>✉️</Text>
                <Text style={styles.consentTitle}>Email about what's new</Text>
                <Switch
                  value={emailOk}
                  onValueChange={setEmailOk}
                  trackColor={{ true: COLORS.orange, false: '#DDD3C4' }}
                />
              </View>
              <Text style={styles.consentText}>{MARKETING_EMAIL_NOTE}</Text>
            </View>

            <Text style={styles.legal}>
              SpoonDrop, and the address printed at the bottom of every email we send.
              Changing your mind takes one tap in Profile → Preferences.
            </Text>
          </>
        )}

        {step === 7 && (
          <View style={styles.welcome}>
            <View style={styles.doneMark}>
              <Ionicons name="checkmark" size={44} color={COLORS.orange} />
            </View>
            <Text style={styles.title}>You're all set!</Text>
            <Text style={styles.lead}>
              We will keep learning from what you cook, save and rate.
            </Text>
            <View style={styles.summary}>
              {[
                'Suggestions that fit your household',
                'Recipes built around what you have',
                'Shopping lists that add up correctly',
                'Everything editable later in Profile',
              ].map(line => (
                <View key={line} style={styles.summaryRow}>
                  <Ionicons name="checkmark-circle" size={17} color={COLORS.green} />
                  <Text style={styles.summaryText}>{line}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primary}
          onPress={step === STEPS - 1 ? finish : next}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryText}>
              {step === 0 ? 'Get Started' : step === STEPS - 1 ? 'Show My Matches' : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={step === STEPS - 1 ? finish : next} disabled={saving}>
          <Text style={styles.skip}>{step === STEPS - 1 ? 'Skip for now' : 'Skip'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  consentCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  consentHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  consentIcon: { fontSize: 20 },
  consentTitle: { flex: 1, fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.navy },
  consentText: { fontSize: 12.5, color: COLORS.warmGray, lineHeight: 18, marginTop: 10 },
  legal: { fontSize: 11.5, color: COLORS.warmGray, lineHeight: 17, marginTop: 4 },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingTop: HEADER_TOP },
  seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E7DFD1' },
  segOn: { backgroundColor: COLORS.orange },

  body: { paddingHorizontal: 24, paddingTop: 28 },

  welcome: { alignItems: 'center' },
  wordmark: { fontFamily: FONTS.display, fontSize: 26, color: COLORS.navy, letterSpacing: 0.5 },
  wordmarkAccent: { color: COLORS.orange },
  welcomeArt: {
    width: 200, height: 160, borderRadius: 18, backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center', marginVertical: 26,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  welcomeEmoji: { fontSize: 72 },
  doneMark: {
    width: 92, height: 92, borderRadius: 46, borderWidth: 3, borderColor: COLORS.orange,
    alignItems: 'center', justifyContent: 'center', marginBottom: 22,
  },

  title: { fontFamily: FONTS.display, fontSize: 27, color: COLORS.navy, textAlign: 'left' },
  lead: { fontSize: 14, color: COLORS.warmGray, lineHeight: 20, marginTop: 8, marginBottom: 20 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: '#EFE7DC', marginBottom: 10,
  },
  rowOn: { borderColor: COLORS.orange, backgroundColor: '#FFF6EE' },
  rowIcon: { fontSize: 16 },
  rowText: { fontSize: 15, color: COLORS.navy, fontWeight: '600' },
  rowTextOn: { color: COLORS.orange },

  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFF', borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: '#EFE7DC', marginTop: 6,
  },
  switchLabel: { fontSize: 15, color: COLORS.navy, fontWeight: '600' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#FFF', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 15,
    borderWidth: 1.5, borderColor: '#EFE7DC', minWidth: '46%',
  },
  chipOn: { borderColor: COLORS.orange, backgroundColor: '#FFF6EE' },
  chipIcon: { fontSize: 15 },
  chipText: { fontSize: 14, color: COLORS.navy, fontWeight: '600' },
  chipTextOn: { color: COLORS.orange },

  summary: { alignSelf: 'stretch', marginTop: 22, gap: 12 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryText: { fontSize: 14, color: COLORS.navy },

  footer: { paddingHorizontal: 24, paddingBottom: 34, gap: 14, alignItems: 'center' },
  primary: {
    alignSelf: 'stretch', backgroundColor: COLORS.orange,
    paddingVertical: 17, borderRadius: 14, alignItems: 'center',
  },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  skip: { color: COLORS.warmGray, fontSize: 14, fontWeight: '600' },
});
