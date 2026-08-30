import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../lib/theme';
import {
  getPremiumPriceStrings, purchasePremium, restorePurchases, syncEntitlements,
  grantPlatformEntitlement, purchasesAvailable, type PremiumPlan,
} from '../lib/purchases';
import {
  PREMIUM_INCLUDES, PREMIUM_EXCLUDES, PREMIUM_MONTHLY_CENTS, PREMIUM_YEARLY_CENTS,
  FOUNDING_OFFER_OPEN, FOUNDING_HEADLINE, FOUNDING_SUB, renewalNote, usd,
} from '../lib/pricing';
import { useAuth } from '../lib/auth';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubscribed?: () => void; // called after a successful purchase/restore
  creatorName?: string;      // optional: whose premium recipe triggered the paywall
};

// Shown until the store returns the real localized prices. The launch offer is
// what someone is actually charged first, so that is the number that stands in
// — quoting the standard price here would overstate it.
const FALLBACK: Record<PremiumPlan, string> = {
  annual: usd(PREMIUM_YEARLY_CENTS),
  monthly: usd(PREMIUM_MONTHLY_CENTS),
};

// What the yearly plan saves against paying monthly. A real comparison
// between two prices we actually charge, computed rather than typed — unlike
// a struck-through "regular price" nobody has ever paid.
const SAVING_PERCENT = Math.round(
  (1 - PREMIUM_YEARLY_CENTS / (PREMIUM_MONTHLY_CENTS * 12)) * 100,
);

export default function Paywall({ visible, onClose, onSubscribed, creatorName }: Props) {
  const [prices, setPrices] = useState<Record<PremiumPlan, string>>(FALLBACK);
  // Yearly first: it is the better deal and the one most people want, and a
  // screen that pre-selects nothing makes everyone do work to say so.
  const [plan, setPlan] = useState<PremiumPlan>('annual');
  const [busy, setBusy] = useState(false);
  // Reloading the auth context is the paywall's own job. Leaving it to each
  // caller's onSubscribed meant a screen that forgot it (fridge.tsx did) would
  // unlock the account server-side and still render its locked state — the user
  // taps unlock, nothing visibly changes, and they tap again forever.
  const { refresh } = useAuth();

  useEffect(() => {
    if (!visible) return;
    getPremiumPriceStrings().then(p =>
      setPrices(prev => ({
        annual: p.annual ?? prev.annual,
        monthly: p.monthly ?? prev.monthly,
      })),
    );
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
        `Purchase succeeded, but unlocking failed: ${g.error ?? 'unknown'}.\n\nYour payment went through — the store has it. Restore Purchases in Settings once you're online again.`
      );
      return;
    }
    onSubscribed?.();
    onClose();
    Alert.alert('Unlocked 🎉', successMsg);
  };

  const subscribe = async () => {
    setBusy(true);
    const r = await purchasePremium(plan);
    if (r === 'success') { await afterPurchase('Premium features are now unlocked.'); return; }
    setBusy(false);
    handleResult(r, 'Premium features are now unlocked.');
  };

  // Testing shortcut. The store can't charge anything in Expo Go, so the normal
  // button dead-ends there — this writes the entitlement directly, exactly like
  // the debug row in Settings.
  //
  // __DEV__ is false in any release build, so this cannot reach users.
  //
  // It is no longer the only guard: unlocking now goes through
  // verify-purchase, which asks RevenueCat what the account actually bought
  // and refuses when there is no receipt. In Expo Go there is no receipt, so
  // this button will correctly fail there too once the function is deployed —
  // use the Settings debug row against a real dev build instead.
  const devUnlock = async () => {
    setBusy(true);
    const g = await grantPlatformEntitlement('premium_monthly');
    if (g.ok) await refresh();
    setBusy(false);
    if (!g.ok) {
      Alert.alert('Failed', `${g.error ?? 'unknown'}\n\nverify-purchase needs to be deployed with REVENUECAT_SECRET_KEY set.`);
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

          {FOUNDING_OFFER_OPEN && (
            <View style={styles.founding}>
              <Text style={styles.foundingTitle}>{FOUNDING_HEADLINE}</Text>
              <Text style={styles.foundingSub}>{FOUNDING_SUB}</Text>
            </View>
          )}

          {/* Both terms, both selectable. Whichever is chosen is what the
              button buys and what the line underneath describes, so the price
              on screen and the price charged can never disagree. */}
          <View style={styles.plans}>
            <PlanCard
              selected={plan === 'annual'}
              onPress={() => setPlan('annual')}
              title="Yearly"
              price={prices.annual}
              unit="a year"
              badge={SAVING_PERCENT > 0 ? `Save ${SAVING_PERCENT}%` : undefined}
              after={`${usd(Math.round(PREMIUM_YEARLY_CENTS / 12))} a month`}
            />
            <PlanCard
              selected={plan === 'monthly'}
              onPress={() => setPlan('monthly')}
              title="Monthly"
              price={prices.monthly}
              unit="a month"
              after="billed monthly"
            />
          </View>

          {/* What it costs afterwards, in the same breath as what it costs
              now. A launch price shown on its own is the thing both the app
              stores and the FTC treat as deceptive, and it is how someone
              finds out what they signed up for from a bank statement. */}
          <Text style={styles.renewal}>{renewalNote(plan === 'annual' ? 'year' : 'month')}</Text>

          <TouchableOpacity style={styles.cta} onPress={subscribe} disabled={busy} activeOpacity={0.9}>
            {busy ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              // Names the term being bought. "Subscribe now" next to two
              // prices leaves the user to remember which one they tapped.
              <Text style={styles.ctaText}>
                Start {plan === 'annual' ? 'yearly' : 'monthly'} · {prices[plan]}
              </Text>
            )}
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

/** One selectable term. Kept dumb: the paywall owns which one is chosen. */
function PlanCard({
  selected, onPress, title, price, unit, after, badge,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  price: string;
  unit: string;
  after: string;
  badge?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.plan, selected && styles.planOn]}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      {badge ? (
        <View style={styles.planBadge}><Text style={styles.planBadgeText}>{badge}</Text></View>
      ) : null}
      <Text style={[styles.planTitle, selected && styles.planTitleOn]}>{title}</Text>
      <Text style={styles.planPrice}>{price}</Text>
      <Text style={styles.planUnit}>{unit}</Text>
      <Text style={styles.planAfter}>{after}</Text>
    </TouchableOpacity>
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
  plans: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 18 },
  plan: {
    flex: 1, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: '#EFE7DC', backgroundColor: '#FFF',
    alignItems: 'center',
  },
  planOn: { borderColor: COLORS.orange, backgroundColor: '#FFF7F0' },
  planTitle: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.warmGray },
  planTitleOn: { color: COLORS.orange },
  planPrice: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.navy, marginTop: 6 },
  planUnit: { fontSize: 11.5, color: COLORS.warmGray, marginTop: 1 },
  planAfter: { fontSize: 11, color: COLORS.warmGray, marginTop: 6, textAlign: 'center' },
  planBadge: {
    position: 'absolute', top: -9, backgroundColor: COLORS.green,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9,
  },
  planBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },

  founding: {
    alignSelf: 'stretch', backgroundColor: '#FFF3E9', borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16, marginTop: 22,
    borderWidth: 1, borderColor: '#F5D9C2',
  },
  foundingTitle: { fontFamily: FONTS.semibold, fontSize: 14, color: '#8A4B1E', textAlign: 'center' },
  foundingSub: { fontSize: 12.5, color: '#8A4B1E', textAlign: 'center', marginTop: 3 },
  renewal: { fontSize: 12.5, color: COLORS.warmGray, textAlign: 'center', marginTop: 8, lineHeight: 18, paddingHorizontal: 8 },
  renewalAlt: { fontSize: 12.5, color: COLORS.warmGray, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  price: { fontFamily: FONTS.display, fontSize: 34, color: COLORS.navy, marginTop: 14 },
  priceUnit: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.warmGray },
  cta: { alignSelf: 'stretch', backgroundColor: COLORS.orange, borderRadius: RADIUS.md, paddingVertical: 17, alignItems: 'center', marginTop: 18 },
  ctaText: { fontFamily: FONTS.bold, fontSize: 16, color: '#FFF', letterSpacing: 0.5 },
  restore: { marginTop: 14, paddingVertical: 6 },
  restoreText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.navy },
  legal: { fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.warmGray, textAlign: 'center', marginTop: 16, lineHeight: 16, paddingHorizontal: 6 },
});
