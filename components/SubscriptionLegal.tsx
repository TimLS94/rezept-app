// The two links guideline 3.1.2 wants wherever a subscription is sold.
//
// Not a style choice: the first submission was rejected under 3.1.2 because
// the Terms of Use were missing from the App Store listing. The same rule
// asks for them on the screen where someone decides to pay, and there are two
// such screens — the Premium paywall and a creator's membership card.
//
// One component so the EULA address exists once. A dead link here is the
// rejection this was written to prevent, and two copies is how one of them
// goes stale.
import { View, Text, StyleSheet, Linking } from 'react-native';
import { COLORS } from '../lib/theme';

/** Apple's standard end-user licence — the one this app ships under. */
export const APPLE_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export const PRIVACY_URL = 'https://spoondrop.app/privacy';

export default function SubscriptionLegal({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Text style={styles.link} onPress={() => Linking.openURL(APPLE_EULA_URL)}>
        Terms of Use
      </Text>
      <Text style={styles.dot}>·</Text>
      <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>
        Privacy Policy
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  rowCompact: { marginTop: 8 },
  link: { fontSize: 12, color: COLORS.orange, fontWeight: '600', textDecorationLine: 'underline' },
  dot: { fontSize: 12, color: COLORS.warmGray, marginHorizontal: 8 },
});
