import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../lib/theme';
import { getPremiumPriceString, purchasePremium, restorePurchases, syncEntitlements, grantPlatformEntitlement, purchasesAvailable } from '../lib/purchases';
import { PREMIUM_INCLUDES, PREMIUM_EXCLUDES, PREMIUM_MONTHLY_CENTS, usd } from '../lib/pricing';
import { useAuth } from '../lib/auth';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubscribed?: () => void; // called after a successful purchase/restore
  creatorName?: string;      // optional: whose premium recipe triggered the paywall
};

// Shown until the store returns the real localized price.
const FALLBACK_PRICE = usd(PREMIUM_MONTHLY_CENTS);

export default function Paywall({ visible, onClose, onSubscribed, creatorName }: Props) {
  const [price, setPrice] = useState<string>(FALLBACK_PRICE);
  const [busy, setBusy] = useState(false);
  // Reloading the auth context is the paywall's own job. Leaving it to each
  // caller's onSubscribed meant a screen that forgot it (fridge.tsx did) would
  // unlock the account server-side and still render its locked state — the user
  // taps unlock, nothing visibly changes, and they tap again forever.
  const { refresh } = useAuth();

  useEffect(() => {
    if (!visible) return;
    getPremiumPriceString().then(p => { if (p) setPrice(p); });
  }, [visible]);

  const handleResult = (result: string, successMsg: string) => {
    if (result === 'success') {
      onSubscribed?.();
      onClose();
      Alert.alert('Unlocked 🎉', successMsg);
    } else if (result === 'unavailable') {
      // In a dev build, put the testing shortcut straight into the alert. The
      // button further down the sheet is easy to miss — this is the moment the
      // tester actually wants it.
      Alert.alert(
        'Not available here',
        'Expo Go has no in-app purchase module, so buying only works in a dev or store build.',
        __DEV__
          ? [{ text: 'OK', style: 'cancel' }, { text: 'Unlock anyway (dev)', onPress: devUnlock }]
          : [{ text: 'OK' }],
      );
    } else if (result === 'error') {
      Alert.alert('Error', 'The purchase could not be completed. Please try again later.');
    }
    // 'cancelled' → silent
  };

  // After a successful RevenueCat purchase we must sync to Supabase (server gate).
  // If that sync doesn't confirm access, surface exactly why (for debugging).
  const afterPurchase = async (successMsg: string) => {
    // RevenueCat already validated the receipt, so write the entitlement via the
    // SQL RPC (reliable, no edge function). syncEntitlements is a best-effort
    // extra if the edge function happens to be deployed.
    const g = await grantPlatformEntitlement('premium_monthly');
    await syncEntitlements();
    await refresh();
    setBusy(false);
    if (!g.ok) {
      Alert.alert(
        'Almost there',
        `Purchase succeeded, but unlocking failed: ${g.error ?? 'unknown'}.\n\nMake sure payments.sql (incl. grant_platform_entitlement) has been run in Supabase.`
      );
      return;
    }
    onSubscribed?.();
    onClose();
    Alert.alert('Unlocked 🎉', successMsg);
  };

  const subscribe = async () => {
    setBusy(true);
    const r = await purchasePremium();
    if (r === 'success') { await afterPurchase('Premium features are now unlocked.'); return; }
    setBusy(false);
    handleResult(r, 'Premium features are now unlocked.');
  };

  // Testing shortcut. The store can't charge anything in Expo Go, so the normal
  // button dead-ends there — this writes the entitlement directly, exactly like
  // the debug row in Settings.
  //
  // __DEV__ is false in any release build, so this cannot reach users. That
  // guard is the only thing standing between this button and free Premium for
  // everyone: grant_platform_entitlement verifies no receipt (see
  // supabase/harden_profiles.sql), so it must never render in production.
  const devUnlock = async () => {
    setBusy(true);
    const g = await grantPlatformEntitlement('premium_monthly');
    if (g.ok) await refresh();
    setBusy(false);
    if (!g.ok) {
      Alert.alert('Failed', `${g.error ?? 'unknown'}\n\nHas payments.sql been run in Supabase?`);
      return;
    }
    onSubscribed?.();
    onClose();
    Alert.alert('Unlocked (dev) ✓', 'Premium features are on for this account. Turn it back off in Settings.');
  };

  const restore = async () => {
    setBusy(true);
    const r = await restorePurchases();
    if (r === 'success') { await afterPurchase('Your subscription has been restored.'); return; }
    setBusy(false);
    if (r === 'error') { Alert.alert('No purchases found', "We couldn't restore an active subscription."); return; }
    handleResult(r, 'Your subscription has been restored.');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={COLORS.warmGray} />
          </TouchableOpacity>
          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>

          <View style={styles.badge}><Ionicons name="lock-open" size={26} color="#FFF" /></View>
          <Text style={styles.title}>SpoonDrop Premium</Text>
          <Text style={styles.subtitle}>The tools that make cooking with the app easier.</Text>

          <View style={styles.benefits}>
            {PREMIUM_INCLUDES.map(b => (
              <View key={b.title} style={styles.benefitRow}>
                <Text style={styles.benefitIcon}>{b.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.benefitTitle}>{b.title}</Text>
                  <Text style={styles.benefitText}>{b.text}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Stated up front, not buried in the legal line. Someone arriving
              here from a locked creator recipe must not believe this buys it. */}
          <View style={styles.exclusion}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.warmGray} />
            <Text style={styles.exclusionText}>{PREMIUM_EXCLUDES}</Text>
          </View>

          <Text style={styles.price}>{price}<Text style={styles.priceUnit}> / month</Text></Text>

          <TouchableOpacity style={styles.cta} onPress={subscribe} disabled={busy} activeOpacity={0.9}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.ctaText}>Subscribe now</Text>}
          </TouchableOpacity>

          {__DEV__ && !purchasesAvailable() && (
            <TouchableOpacity onPress={devUnlock} disabled={busy} style={styles.devUnlock}>
              <Text style={styles.devUnlockText}>Unlock without paying (dev build only)</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={restore} disabled={busy} style={styles.restore}>
            <Text style={styles.restoreText}>Restore purchases</Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            The subscription renews automatically until you cancel. Manage & cancel in your store settings.
          </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(13,43,99,0.45)', justifyContent: 'flex-end' },
  // maxHeight + ScrollView: the sheet is bottom-anchored, so without a bound it
  // overflows off the TOP of the screen on smaller phones and the title is gone.
  sheet: { backgroundColor: COLORS.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '92%' },
  sheetContent: { padding: 26, paddingBottom: 40, alignItems: 'center' },
  close: { position: 'absolute', top: 16, right: 16, zIndex: 2 },
  badge: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.orange, justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  title: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.navy, marginTop: 14, letterSpacing: 0.3 },
  subtitle: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.warmGray, textAlign: 'center', marginTop: 6, lineHeight: 20, paddingHorizontal: 10 },
  benefits: { alignSelf: 'stretch', marginTop: 20, gap: 14 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  benefitIcon: { fontSize: 20, width: 24, textAlign: 'center' },
  benefitTitle: { fontFamily: FONTS.semibold, fontSize: 14.5, color: COLORS.navy },
  benefitText: { fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.warmGray, lineHeight: 18, marginTop: 1 },
  devUnlock: {
    alignSelf: 'stretch', marginTop: 10, paddingVertical: 11, borderRadius: 12,
    borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.border, alignItems: 'center',
  },
  devUnlockText: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.warmGray },
  exclusion: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, alignSelf: 'stretch',
    backgroundColor: COLORS.cream, borderRadius: 12, padding: 12, marginTop: 18,
  },
  exclusionText: { flex: 1, fontFamily: FONTS.body, fontSize: 12, color: COLORS.warmGray, lineHeight: 17 },
  price: { fontFamily: FONTS.display, fontSize: 34, color: COLORS.navy, marginTop: 24 },
  priceUnit: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.warmGray },
  cta: { alignSelf: 'stretch', backgroundColor: COLORS.orange, borderRadius: RADIUS.md, paddingVertical: 17, alignItems: 'center', marginTop: 18 },
  ctaText: { fontFamily: FONTS.bold, fontSize: 16, color: '#FFF', letterSpacing: 0.5 },
  restore: { marginTop: 14, paddingVertical: 6 },
  restoreText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.navy },
  legal: { fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.warmGray, textAlign: 'center', marginTop: 16, lineHeight: 16, paddingHorizontal: 6 },
});
