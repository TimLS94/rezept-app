import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { HEADER_TOP } from '../lib/layout';

export default function PrivacyPolicyScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Last updated: July 27, 2026</Text>

        <Text style={styles.sectionTitle}>1. Introduction</Text>
        <Text style={styles.paragraph}>
          SpoonDrop ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.
        </Text>

        <Text style={styles.sectionTitle}>2. Information We Collect</Text>
        <Text style={styles.subTitle}>Account Information</Text>
        <Text style={styles.paragraph}>
          • Email address (for authentication){'\n'}
          • Name (optional, for profile display){'\n'}
          • Profile photo (optional)
        </Text>

        <Text style={styles.subTitle}>Usage Data</Text>
        <Text style={styles.paragraph}>
          • Recipes you save and create{'\n'}
          • Shopping lists{'\n'}
          • Meal plans{'\n'}
          • Family member information (stored locally and in your account)
        </Text>

        <Text style={styles.subTitle}>Photos and Media</Text>
        <Text style={styles.paragraph}>
          When you upload recipe photos, they are stored securely in our cloud storage. We do not access or use your photos for any purpose other than displaying them in the app.
        </Text>

        <Text style={styles.sectionTitle}>3. How We Use Your Information</Text>
        <Text style={styles.paragraph}>
          • To provide and maintain our service{'\n'}
          • To personalize your experience{'\n'}
          • To process recipe imports using AI (text/images are sent to AI providers){'\n'}
          • To communicate with you about your account{'\n'}
          • To improve our app
        </Text>

        <Text style={styles.sectionTitle}>4. Third-Party Services</Text>
        <Text style={styles.paragraph}>
          We use the following third-party services:{'\n\n'}
          • <Text style={styles.bold}>Supabase</Text> - Authentication and data storage{'\n'}
          • <Text style={styles.bold}>Google</Text> - OAuth sign-in, Gemini AI for recipe extraction{'\n'}
          • <Text style={styles.bold}>Groq/OpenAI</Text> - AI recipe extraction (optional){'\n\n'}
          Each service has its own privacy policy governing their use of your data.
        </Text>

        <Text style={styles.sectionTitle}>5. Data Security</Text>
        <Text style={styles.paragraph}>
          We implement industry-standard security measures including:{'\n\n'}
          • HTTPS encryption for all data transmission{'\n'}
          • Secure authentication with JWT tokens{'\n'}
          • Row-level security in our database{'\n'}
          • No storage of payment information (handled by app stores)
        </Text>

        <Text style={styles.sectionTitle}>6. Your Rights</Text>
        <Text style={styles.paragraph}>
          You have the right to:{'\n\n'}
          • Access your personal data{'\n'}
          • Correct inaccurate data{'\n'}
          • Delete your account and all associated data{'\n'}
          • Export your data{'\n'}
          • Opt out of marketing communications
        </Text>

        <Text style={styles.sectionTitle}>7. California Privacy Rights (CCPA)</Text>
        <Text style={styles.paragraph}>
          If you are a California resident, you have additional rights:{'\n\n'}
          • Right to know what personal information is collected{'\n'}
          • Right to delete personal information{'\n'}
          • Right to opt-out of the sale of personal information{'\n\n'}
          <Text style={styles.bold}>We do not sell your personal information.</Text>
        </Text>

        <Text style={styles.sectionTitle}>8. Children's Privacy</Text>
        <Text style={styles.paragraph}>
          Our app is not intended for children under 13. We do not knowingly collect personal information from children under 13. If you believe we have collected such information, please contact us.
        </Text>

        <Text style={styles.sectionTitle}>9. Changes to This Policy</Text>
        <Text style={styles.paragraph}>
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
        </Text>

        <Text style={styles.sectionTitle}>10. Contact Us</Text>
        <Text style={styles.paragraph}>
          If you have questions about this Privacy Policy, please contact us at:{'\n\n'}
          Email: privacy@spoondrop.app{'\n'}
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
  subTitle: { fontSize: 15, fontWeight: '600', color: '#444', marginTop: 12, marginBottom: 8 },
  paragraph: { fontSize: 15, color: '#444', lineHeight: 24 },
  bold: { fontWeight: '600' },
});
