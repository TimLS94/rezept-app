import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../lib/theme';
import { getPremiumPriceString, purchasePremium, restorePurchases } from '../lib/purchases';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubscribed?: () => void; // called after a successful purchase/restore
  creatorName?: string;      // optional: whose premium recipe triggered the paywall
};

const BENEFITS = [
  'Zugriff auf alle Premium-Rezepte',
  'Unterstützt die Creator direkt',
  'Jederzeit kündbar',
];

// Shown until the store returns the real localized price.
const FALLBACK_PRICE = '€9,99';

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
      Alert.alert('Freigeschaltet 🎉', successMsg);
    } else if (result === 'unavailable') {
      Alert.alert('Bald verfügbar', 'In-App-Käufe sind in dieser Version noch nicht aktiv. Sie funktionieren im Store-/Dev-Build, sobald RevenueCat eingerichtet ist.');
    } else if (result === 'error') {
      Alert.alert('Fehler', 'Der Kauf konnte nicht abgeschlossen werden. Bitte später erneut versuchen.');
    }
    // 'cancelled' → silent
  };

  const subscribe = async () => {
    setBusy(true);
    const r = await purchasePremium();
    setBusy(false);
    handleResult(r, 'Du hast jetzt Zugriff auf alle Premium-Rezepte.');
  };

  const restore = async () => {
    setBusy(true);
    const r = await restorePurchases();
    setBusy(false);
    if (r === 'error') { Alert.alert('Keine Käufe gefunden', 'Wir konnten kein aktives Abo wiederherstellen.'); return; }
    handleResult(r, 'Dein Abo wurde wiederhergestellt.');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={COLORS.warmGray} />
          </TouchableOpacity>

          <View style={styles.badge}><Ionicons name="lock-open" size={26} color="#FFF" /></View>
          <Text style={styles.title}>Premium freischalten</Text>
          <Text style={styles.subtitle}>
            {creatorName ? `Schalte die Premium-Rezepte von ${creatorName} und allen Creators frei.` : 'Schalte alle Premium-Rezepte frei.'}
          </Text>

          <View style={styles.benefits}>
            {BENEFITS.map(b => (
              <View key={b} style={styles.benefitRow}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.green} />
                <Text style={styles.benefitText}>{b}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.price}>{price}<Text style={styles.priceUnit}> / Monat</Text></Text>

          <TouchableOpacity style={styles.cta} onPress={subscribe} disabled={busy} activeOpacity={0.9}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.ctaText}>Jetzt abonnieren</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={restore} disabled={busy} style={styles.restore}>
            <Text style={styles.restoreText}>Käufe wiederherstellen</Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            Das Abo verlängert sich automatisch, bis du kündigst. Verwaltung & Kündigung in den Store-Einstellungen.
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
