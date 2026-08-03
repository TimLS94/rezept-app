import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../lib/theme';
import { getPremiumPriceString, purchasePremium, restorePurchases, syncEntitlements, grantPlatformEntitlement } from '../lib/purchases';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubscribed?: () => void; // called after a successful purchase/restore
  creatorName?: string;      // optional: whose premium recipe triggered the paywall
};

const BENEFITS = [
  'Access all premium recipes',
  'Support creators directly',
  'Cancel anytime',
];

// Shown until the store returns the real localized price.
const FALLBACK_PRICE = '$9.99';

export default function Paywall({ visible, onClose, onSubscribed, creatorName }: Props) {
  const [price, setPrice] = useState<string>(FALLBACK_PRICE);
  const [busy, setBusy] = useState(false);

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
      Alert.alert('Coming soon', "In-app purchases aren't active in this version yet. They work in a store/dev build once RevenueCat is set up.");
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
    if (r === 'success') { await afterPurchase('You now have access to all premium recipes.'); return; }
    setBusy(false);
    handleResult(r, 'You now have access to all premium recipes.');
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

          <View style={styles.badge}><Ionicons name="lock-open" size={26} color="#FFF" /></View>
          <Text style={styles.title}>Unlock Premium</Text>
          <Text style={styles.subtitle}>
            {creatorName ? `Unlock premium recipes from ${creatorName} and all creators.` : 'Unlock all premium recipes.'}
          </Text>

          <View style={styles.benefits}>
            {BENEFITS.map(b => (
              <View key={b} style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.green} />
                <Text style={styles.benefitText}>{b}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.price}>{price}<Text style={styles.priceUnit}> / month</Text></Text>

          <TouchableOpacity style={styles.cta} onPress={subscribe} disabled={busy} activeOpacity={0.9}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.ctaText}>Subscribe now</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={restore} disabled={busy} style={styles.restore}>
            <Text style={styles.restoreText}>Restore purchases</Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            The subscription renews automatically until you cancel. Manage & cancel in your store settings.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(13,43,99,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 26, paddingBottom: 40, alignItems: 'center' },
  close: { position: 'absolute', top: 16, right: 16, zIndex: 2 },
  badge: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.orange, justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  title: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.navy, marginTop: 14, letterSpacing: 0.3 },
  subtitle: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.warmGray, textAlign: 'center', marginTop: 6, lineHeight: 20, paddingHorizontal: 10 },
  benefits: { alignSelf: 'stretch', marginTop: 22, gap: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.charcoal },
  price: { fontFamily: FONTS.display, fontSize: 34, color: COLORS.navy, marginTop: 24 },
  priceUnit: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.warmGray },
  cta: { alignSelf: 'stretch', backgroundColor: COLORS.orange, borderRadius: RADIUS.md, paddingVertical: 17, alignItems: 'center', marginTop: 18 },
  ctaText: { fontFamily: FONTS.bold, fontSize: 16, color: '#FFF', letterSpacing: 0.5 },
  restore: { marginTop: 14, paddingVertical: 6 },
  restoreText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.navy },
  legal: { fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.warmGray, textAlign: 'center', marginTop: 16, lineHeight: 16, paddingHorizontal: 6 },
});
