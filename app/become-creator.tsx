// Applying to be a creator.
//
// Deliberately a form with a person on the other end, not a switch. A creator
// publishes recipes into everyone's app, charges for them and takes a payout;
// the app cannot tell whether that should be allowed, and pretending it can is
// how a marketplace fills up with things nobody wants to have published.
//
// So: say who you are, and somebody decides. The screen is honest that a human
// is involved and that it takes time.
import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { applyToBeCreator, myApplication, type MyApplication } from '../lib/creatorApplications';
import { COLORS, FONTS } from '../lib/theme';
import { HEADER_TOP } from '../lib/layout';
import { goBackOr } from '../lib/nav';

export default function BecomeCreatorScreen() {
  const [pitch, setPitch] = useState('');
  const [links, setLinks] = useState('');
  const [sending, setSending] = useState(false);
  const [existing, setExisting] = useState<MyApplication>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      myApplication()
        .then(a => { if (active) { setExisting(a); setLoading(false); } })
        .catch(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, []),
  );

  const send = async () => {
    if (pitch.trim().length < 40) {
      Alert.alert(
        'Tell us a bit more',
        'A few sentences about what you cook and who you cook for. It is the only thing we have to go on.',
      );
      return;
    }
    setSending(true);
    const r = await applyToBeCreator(pitch.trim(), links.trim() || undefined);
    setSending(false);
    if (r.error) {
      Alert.alert('Not sent', r.error);
      return;
    }
    setExisting({ status: 'pending', applied_at: new Date().toISOString(), note: null });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/profile')} style={styles.hBtn}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Become a creator</Text>
        <View style={styles.hBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.orange} /></View>
      ) : existing?.status === 'pending' ? (
        <View style={styles.center}>
          <Text style={styles.bigIcon}>⏳</Text>
          <Text style={styles.stateTitle}>With us since {new Date(existing.applied_at).toLocaleDateString()}</Text>
          <Text style={styles.stateText}>
            A person reads every application, so this takes a few days rather than a few seconds.
            You will see the Studio appear here when it is approved.
          </Text>
        </View>
      ) : existing?.status === 'approved' ? (
        <View style={styles.center}>
          <Text style={styles.bigIcon}>🎬</Text>
          <Text style={styles.stateTitle}>You're a creator</Text>
          <Text style={styles.stateText}>
            Sign out and back in if the Studio tab has not appeared yet — your role is read when
            you sign in.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {existing?.status === 'rejected' && (
            <View style={styles.rejected}>
              <Text style={styles.rejectedTitle}>Not this time</Text>
              <Text style={styles.rejectedText}>
                {existing.note || 'You are welcome to apply again — tell us what has changed.'}
              </Text>
            </View>
          )}

          <Text style={styles.lede}>What a creator account gives you</Text>
          <Text style={styles.para}>
            Publish recipes into SpoonDrop, sell them individually or by subscription, and get
            paid for what people cook. You keep 75% of what you charge, after the app store's cut.
          </Text>

          <Text style={styles.label}>Who are you, and what do you cook?</Text>
          <Text style={styles.hint}>
            A few sentences. This is the whole application — there is no form behind it.
          </Text>
          <TextInput
            style={[styles.input, styles.area]}
            value={pitch}
            onChangeText={setPitch}
            placeholder="I cook Sichuan food for people who think it is too hard to make at home…"
            placeholderTextColor="#AAA"
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />

          <Text style={styles.label}>Where can we see your cooking?</Text>
          <Text style={styles.hint}>Instagram, TikTok, a blog — whatever you have. Optional.</Text>
          <TextInput
            style={styles.input}
            value={links}
            onChangeText={setLinks}
            placeholder="instagram.com/…"
            placeholderTextColor="#AAA"
            autoCapitalize="none"
            maxLength={500}
          />

          <TouchableOpacity style={styles.cta} onPress={send} disabled={sending}>
            <Text style={styles.ctaText}>{sending ? 'Sending…' : 'Send application'}</Text>
          </TouchableOpacity>
          <Text style={styles.foot}>
            A person reads it. Expect a few days, not a few seconds.
          </Text>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
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
  hBtn: { width: 64 },
  back: { fontSize: 16, color: COLORS.orange, fontWeight: '600' },
  headerTitle: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.navy },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36 },
  bigIcon: { fontSize: 48, marginBottom: 14 },
  stateTitle: { fontSize: 19, fontWeight: '700', color: COLORS.navy, marginBottom: 10, textAlign: 'center' },
  stateText: { fontSize: 14.5, color: COLORS.warmGray, textAlign: 'center', lineHeight: 21 },

  body: { padding: 20 },
  lede: { fontFamily: FONTS.semibold, fontSize: 17, color: COLORS.navy, marginBottom: 8 },
  para: { fontSize: 14.5, color: COLORS.warmGray, lineHeight: 21, marginBottom: 26 },
  label: { fontSize: 14.5, fontWeight: '700', color: COLORS.navy, marginBottom: 4 },
  hint: { fontSize: 12.5, color: COLORS.warmGray, marginBottom: 10, lineHeight: 18 },
  input: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, fontSize: 15,
    borderWidth: 1, borderColor: '#EFE7DC', color: COLORS.charcoal, marginBottom: 22,
  },
  area: { minHeight: 150 },
  cta: {
    backgroundColor: COLORS.orange, borderRadius: 14, paddingVertical: 17, alignItems: 'center',
  },
  ctaText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  foot: { fontSize: 12.5, color: COLORS.warmGray, textAlign: 'center', marginTop: 12 },

  rejected: {
    backgroundColor: '#FFF3E9', borderRadius: 14, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: '#F5D9C2',
  },
  rejectedTitle: { fontSize: 15, fontWeight: '700', color: '#8A4B1E', marginBottom: 6 },
  rejectedText: { fontSize: 13.5, color: '#8A4B1E', lineHeight: 19 },
});
