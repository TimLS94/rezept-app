import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { HEADER_TOP } from '../lib/layout';

export default function TermsOfServiceScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Last updated: July 27, 2026</Text>

        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>
          By downloading, installing, or using SpoonDrop ("the App"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the App.
        </Text>

        <Text style={styles.sectionTitle}>2. Description of Service</Text>
        <Text style={styles.paragraph}>
          SpoonDrop is a recipe discovery and meal planning application that allows users to:{'\n\n'}
          • Browse and save recipes{'\n'}
          • Create shopping lists{'\n'}
          • Plan weekly meals{'\n'}
          • Import recipes using AI{'\n'}
          • Follow recipe creators
        </Text>

        <Text style={styles.sectionTitle}>3. User Accounts</Text>
        <Text style={styles.paragraph}>
          • You must provide accurate information when creating an account{'\n'}
          • You are responsible for maintaining the security of your account{'\n'}
          • You must be at least 13 years old to use the App{'\n'}
          • One person may not maintain more than one account
        </Text>

        <Text style={styles.sectionTitle}>4. User Content</Text>
        <Text style={styles.paragraph}>
          When you upload recipes, photos, or other content:{'\n\n'}
          • You retain ownership of your content{'\n'}
          • You grant us a license to display and distribute your content within the App{'\n'}
          • You are responsible for ensuring you have rights to the content you upload{'\n'}
          • We may remove content that violates these terms
        </Text>

        <Text style={styles.sectionTitle}>5. Creator Accounts</Text>
        <Text style={styles.paragraph}>
          Creator accounts are granted at our discretion. Creators agree to:{'\n\n'}
          • Only upload original content or content they have rights to share{'\n'}
          • Not upload misleading or harmful content{'\n'}
          • Comply with all applicable food safety guidelines{'\n'}
          • Not use the platform for spam or unauthorized advertising
        </Text>

        <Text style={styles.sectionTitle}>6. Prohibited Uses</Text>
        <Text style={styles.paragraph}>
          You may not:{'\n\n'}
          • Use the App for any illegal purpose{'\n'}
          • Upload malicious content or attempt to hack the App{'\n'}
          • Impersonate others or misrepresent your affiliation{'\n'}
          • Scrape or collect data from the App without permission{'\n'}
          • Interfere with the proper functioning of the App
        </Text>

        <Text style={styles.sectionTitle}>7. AI-Generated Content</Text>
        <Text style={styles.paragraph}>
          The App uses AI to help extract and format recipes. While we strive for accuracy:{'\n\n'}
          • AI-generated content may contain errors{'\n'}
          • Always verify ingredients and cooking instructions{'\n'}
          • We are not responsible for outcomes from following AI-extracted recipes{'\n'}
          • Check for allergens and dietary restrictions manually
        </Text>

        <Text style={styles.sectionTitle}>8. Intellectual Property</Text>
        <Text style={styles.paragraph}>
          • The App and its original content are owned by SpoonDrop{'\n'}
          • Our trademarks may not be used without permission{'\n'}
          • Recipe content uploaded by creators remains their property
        </Text>

        <Text style={styles.sectionTitle}>9. Disclaimer of Warranties</Text>
        <Text style={styles.paragraph}>
          THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE THAT:{'\n\n'}
          • The App will be uninterrupted or error-free{'\n'}
          • Recipes are accurate or suitable for your dietary needs{'\n'}
          • Nutritional information is accurate{'\n'}
          • The App will meet your specific requirements
        </Text>

        <Text style={styles.sectionTitle}>10. Limitation of Liability</Text>
        <Text style={styles.paragraph}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, FEEDFAMILY SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO PERSONAL INJURY, ALLERGIC REACTIONS, OR FOOD-RELATED ILLNESS.
        </Text>

        <Text style={styles.sectionTitle}>11. Termination</Text>
        <Text style={styles.paragraph}>
          We may terminate or suspend your account at any time for violations of these terms. You may delete your account at any time through the App settings.
        </Text>

        <Text style={styles.sectionTitle}>12. Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We reserve the right to modify these terms at any time. Continued use of the App after changes constitutes acceptance of the new terms.
        </Text>

        <Text style={styles.sectionTitle}>13. Governing Law</Text>
        <Text style={styles.paragraph}>
          These terms shall be governed by the laws of [Your State/Country], without regard to conflict of law principles.
        </Text>

        <Text style={styles.sectionTitle}>14. Contact</Text>
        <Text style={styles.paragraph}>
          For questions about these Terms, contact us at:{'\n\n'}
          Email: legal@spoondrop.app{'\n'}
          Address: [Your Business Address]
        </Text>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  paragraph: { fontSize: 15, color: '#444', lineHeight: 24 },
});
