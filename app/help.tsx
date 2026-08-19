// Answers to what people actually ask, plus a way to reach a person.
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { COLORS, FONTS } from '../lib/theme';
import { HEADER_TOP } from '../lib/layout';
import { goBackOr } from '../lib/nav';
import { PREMIUM_EXCLUDES } from '../lib/pricing';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What does Premium include?',
    a: 'Fridge Scan, recipe import, meal planning, family portions, and editing creator recipes to suit your kitchen. ' + PREMIUM_EXCLUDES,
  },
  {
    q: 'I bought a recipe and the creator deleted it. Is it gone?',
    a: 'No. Anything you paid for is copied to your account at the moment of purchase and stays in your cookbook, marked as removed by the creator. Recipes you only saved for free follow the original — if it is unpublished, it leaves your cookbook.',
  },
  {
    q: 'How does Fridge Scan decide what I can cook?',
    a: 'It reads your photos, lists the ingredients it recognises, and ranks recipes by how few things you would still have to buy. Salt, pepper and water are ignored rather than assumed — nothing else is counted unless it was actually seen.',
  },
  {
    q: 'Why does the same ingredient not appear twice on my shopping list?',
    a: 'Ingredients merge by name and unit, so adding a recipe twice doubles the amount rather than adding a second line. That is why the confirmation sometimes says amounts increased instead of items added.',
  },
  {
    q: 'Can I trust the allergy settings?',
    a: 'Treat them as a filter, not a guarantee. Recipes are written by people and ingredient lists can be incomplete. Always check the ingredients yourself before cooking for someone with an allergy.',
  },
  {
    q: 'How do I cancel Premium?',
    a: 'Through the App Store or Google Play, under your subscriptions — we cannot cancel it for you. Settings has a shortcut that takes you straight there.',
  },
];

export default function HelpScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/profile')} style={styles.hBtn}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.hTitle}>Help & Support</Text>
        <View style={styles.hBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {FAQ.map(item => (
          <View key={item.q} style={styles.card}>
            <Text style={styles.q}>{item.q}</Text>
            <Text style={styles.a}>{item.a}</Text>
          </View>
        ))}

        <Text style={styles.section}>Still stuck?</Text>
        <TouchableOpacity
          style={styles.contact}
          onPress={() => Linking.openURL('mailto:support@spoondrop.app?subject=SpoonDrop%20support')}
        >
          <Text style={styles.contactText}>✉️  Email support</Text>
        </TouchableOpacity>
        <Text style={styles.note}>
          Tell us what you were doing and what happened — a screenshot helps more than anything else.
        </Text>

        <View style={styles.links}>
          <TouchableOpacity onPress={() => goBackOr('/privacy')}>
            <Text style={styles.link}>Privacy</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => goBackOr('/terms')}>
            <Text style={styles.link}>Terms</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
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
  hBtn: { width: 60 },
  back: { fontSize: 16, color: COLORS.orange, fontWeight: '600' },
  hTitle: { fontFamily: 'Anton_400Regular', fontSize: 19, color: COLORS.navy },

  body: { padding: 20 },
  card: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  q: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  a: { fontSize: 14, color: COLORS.warmGray, lineHeight: 21 },

  section: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.navy, marginTop: 24, marginBottom: 10 },
  contact: {
    backgroundColor: COLORS.orange, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  contactText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  note: { fontSize: 12.5, color: COLORS.warmGray, marginTop: 10, lineHeight: 18 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 26 },
  link: { fontSize: 13, color: COLORS.orange, fontWeight: '600' },
});
