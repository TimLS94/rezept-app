// The Impressum — a German legal requirement, not an Apple one.
//
// §5 DDG obliges anyone offering a commercial online service from Germany to
// name who is behind it, where they can be reached by post, and how to contact
// them electronically without delay. It applies to the provider, not to the
// audience, so an app written in English for the US market still needs it
// because the person providing it lives in Berlin.
//
// Written in English with the German reference kept, because the people
// reading it read English — an Impressum nobody can read satisfies the letter
// and misses the point.
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { router } from 'expo-router';
import { HEADER_TOP } from '../lib/layout';

export default function ImprintScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Legal Notice</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Impressum · §5 DDG</Text>

        <Text style={styles.sectionTitle}>Who provides SpoonDrop</Text>
        <Text style={styles.paragraph}>
          Tim Schäfer{'\n'}
          Husemannstr. 9{'\n'}
          10435 Berlin{'\n'}
          Germany
        </Text>

        <Text style={styles.sectionTitle}>Contact</Text>
        <Text style={styles.paragraph}>
          Email:{' '}
          <Text style={styles.link} onPress={() => Linking.openURL('mailto:legal@spoondrop.app')}>
            legal@spoondrop.app
          </Text>
          {'\n\n'}
          For support:{' '}
          <Text style={styles.link} onPress={() => Linking.openURL('mailto:support@spoondrop.app')}>
            support@spoondrop.app
          </Text>
        </Text>

        <Text style={styles.sectionTitle}>Responsible for the content</Text>
        <Text style={styles.paragraph}>
          Tim Schäfer, at the address above.
        </Text>

        <Text style={styles.sectionTitle}>Consumer dispute resolution</Text>
        <Text style={styles.paragraph}>
          We are not obliged to take part in dispute resolution proceedings before a consumer
          arbitration board, and we do not do so voluntarily (§36 VSBG).
        </Text>

        <Text style={styles.sectionTitle}>Recipes and content</Text>
        <Text style={styles.paragraph}>
          Recipes published by creators are their own work and their own responsibility. Recipes
          you import from elsewhere are stored privately in your own cookbook and are not
          published by us. Always check ingredients yourself — a recipe is written by a person,
          not verified by us, and that matters if you have an allergy.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { color: '#F2701E', fontWeight: '600' },
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: HEADER_TOP,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 18, color: '#0D2B63', letterSpacing: 0.3 },
  content: { flex: 1, padding: 20 },
  lastUpdated: { fontSize: 13, color: '#888', marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginTop: 24, marginBottom: 12 },
  subTitle: { fontSize: 15, fontWeight: '600', color: '#444', marginTop: 12, marginBottom: 8 },
  paragraph: { fontSize: 15, color: '#444', lineHeight: 24 },
  bold: { fontWeight: '600' },
});
