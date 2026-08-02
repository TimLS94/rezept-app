import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, RADIUS } from '../../lib/theme';

type Estimate = {
  period_start: string;
  period_end: string;
  currency: string;
  pool_net_cents: number;
  creator_pool_cents: number;
  platform_fee_pct: number;
  my_cooks: number;
  total_cooks: number;
  my_share_pct: number;
  estimated_cents: number;
};

type Breakdown = { recipe_id: string; title: string; cooks: number };

type Payout = {
  id: string;
  period_start: string;
  period_end: string;
  net_cents: number;
  gross_cents: number;
  platform_fee_cents: number;
  status: 'pending' | 'paid' | 'failed';
  breakdown: any;
};

const euro = (cents: number) => `€ ${((cents || 0) / 100).toFixed(2).replace('.', ',')}`;

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const monthLabel = (iso: string) => {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export default function EarningsScreen() {
  const [loading, setLoading] = useState(true);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [showFormula, setShowFormula] = useState(false);
  const [openPayout, setOpenPayout] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        const [est, brk, pay] = await Promise.all([
          supabase.rpc('creator_earnings_estimate'),
          supabase.rpc('creator_engagement_breakdown'),
          supabase.from('creator_payouts').select('*').order('period_start', { ascending: false }),
        ]);
        if (!active) return;
        if (est.data) setEstimate(est.data as Estimate);
        if (brk.data) setBreakdown(brk.data as Breakdown[]);
        if (pay.data) setPayouts(pay.data as Payout[]);
        setLoading(false);
      })();
      return () => { active = false; };
    }, [])
  );

  const statusChip = (s: Payout['status']) => {
    const map = {
      paid: { bg: '#E8F5E9', fg: COLORS.green, label: 'Ausgezahlt' },
      pending: { bg: '#FFF3EC', fg: COLORS.orange, label: 'Ausstehend' },
      failed: { bg: '#FFEBEE', fg: '#E53935', label: 'Fehlgeschlagen' },
    }[s];
    return (
      <View style={[styles.chip, { backgroundColor: map.bg }]}>
        <Text style={[styles.chipText, { color: map.fg }]}>{map.label}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Earnings</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.orange} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* This month */}
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>DIESEN MONAT{estimate ? ` · ${monthLabel(estimate.period_start)}` : ''}</Text>
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>läuft noch</Text>
              </View>
            </View>
            <Text style={styles.heroAmount}>{euro(estimate?.estimated_cents ?? 0)}</Text>
            <Text style={styles.heroSub}>Geschätzt · wird am Monatsende final berechnet</Text>

            <View style={styles.heroStats}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{estimate?.my_cooks ?? 0}</Text>
                <Text style={styles.statLabel}>deine Cooks</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statNum}>{estimate?.my_share_pct ?? 0}%</Text>
                <Text style={styles.statLabel}>dein Anteil</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statNum}>{estimate?.total_cooks ?? 0}</Text>
                <Text style={styles.statLabel}>Cooks gesamt</Text>
              </View>
            </View>

            {(estimate?.pool_net_cents ?? 0) === 0 && (
              <Text style={styles.poolHint}>
                Sobald Premium-Abos laufen, erscheint hier dein Anteil am Umsatz. Deine Cooks werden schon gezählt.
              </Text>
            )}
          </View>

          {/* How it's calculated */}
          <TouchableOpacity style={styles.formulaToggle} onPress={() => setShowFormula(v => !v)} activeOpacity={0.8}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.navy} />
            <Text style={styles.formulaToggleText}>So wird berechnet</Text>
            <Ionicons name={showFormula ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.warmGray} />
          </TouchableOpacity>
          {showFormula && (
            <View style={styles.formulaCard}>
              <Text style={styles.formulaText}>
                Creator teilen sich <Text style={styles.bold}>75 %</Text> des Netto-Umsatzes eines Monats
                (die Plattform behält 25 %). Verteilt wird nach <Text style={styles.bold}>gekochten Rezepten</Text>.
                {'\n\n'}
                <Text style={styles.bold}>Dein Anteil</Text> = deine Cooks ÷ alle Cooks × Creator-Topf.
                {'\n\n'}
                „Netto" ist das, was Apple/Google nach Abzug von Provision (15–30 %) und Umsatzsteuer auszahlen —
                der Store-Abzug ist der größte Posten, nicht die Plattform-Gebühr.
              </Text>
              {estimate && (estimate.creator_pool_cents > 0) && (
                <Text style={styles.formulaExample}>
                  Diesen Monat: Creator-Topf {euro(estimate.creator_pool_cents)} × {estimate.my_share_pct}% = {euro(estimate.estimated_cents)}
                </Text>
              )}
            </View>
          )}

          {/* Per-recipe breakdown */}
          <Text style={styles.sectionTitle}>Deine Rezepte diesen Monat</Text>
          {breakdown.length === 0 ? (
            <Text style={styles.emptyText}>Noch keine gekochten Rezepte in diesem Monat.</Text>
          ) : (
            <View style={styles.card}>
              {breakdown.map((b, i) => (
                <View key={b.recipe_id} style={[styles.rowLine, i > 0 && styles.rowBorderTop]}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{b.title}</Text>
                  <Text style={styles.rowCooks}>{b.cooks}× gekocht</Text>
                </View>
              ))}
            </View>
          )}

          {/* Payout history */}
          <Text style={styles.sectionTitle}>Auszahlungen</Text>
          {payouts.length === 0 ? (
            <Text style={styles.emptyText}>Noch keine abgeschlossenen Auszahlungen.</Text>
          ) : (
            payouts.map(p => {
              const open = openPayout === p.id;
              return (
                <View key={p.id} style={styles.card}>
                  <TouchableOpacity style={styles.payoutHead} onPress={() => setOpenPayout(open ? null : p.id)} activeOpacity={0.8}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payoutMonth}>{monthLabel(p.period_start)}</Text>
                      <Text style={styles.payoutAmount}>{euro(p.net_cents)}</Text>
                    </View>
                    {statusChip(p.status)}
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.warmGray} style={{ marginLeft: 10 }} />
                  </TouchableOpacity>
                  {open && (
                    <View style={styles.payoutDetail}>
                      <DetailRow label="Dein Bruttoanteil" value={euro(p.gross_cents)} />
                      <DetailRow label="Plattform-Gebühr (25 %)" value={`− ${euro(p.platform_fee_cents)}`} />
                      <DetailRow label="Netto-Auszahlung" value={euro(p.net_cents)} strong />
                      {p.breakdown?.my_cooks != null && (
                        <DetailRow label="Cooks (du / gesamt)" value={`${p.breakdown.my_cooks} / ${p.breakdown.total_cooks}`} />
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}

          {/* Payout account */}
          <Text style={styles.sectionTitle}>Auszahlungskonto</Text>
          <TouchableOpacity style={styles.connectBtn} activeOpacity={0.85} disabled>
            <Ionicons name="card-outline" size={18} color={COLORS.warmGray} />
            <Text style={styles.connectText}>Auszahlung einrichten (bald verfügbar)</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function DetailRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, strong && styles.bold]}>{label}</Text>
      <Text style={[styles.detailValue, strong && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 60, paddingBottom: 14,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.navy, letterSpacing: 0.3 },
  body: { padding: 20 },

  heroCard: { backgroundColor: COLORS.navy, borderRadius: RADIUS.lg, padding: 22 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { fontFamily: FONTS.semibold, fontSize: 11, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
  liveBadge: { backgroundColor: 'rgba(245,124,0,0.9)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveBadgeText: { fontFamily: FONTS.semibold, fontSize: 11, color: '#FFF' },
  heroAmount: { fontFamily: FONTS.display, fontSize: 44, color: '#FFF', marginTop: 10 },
  heroSub: { fontFamily: FONTS.body, fontSize: 12.5, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  heroStats: { flexDirection: 'row', marginTop: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontFamily: FONTS.bold, fontSize: 20, color: '#FFF' },
  statLabel: { fontFamily: FONTS.body, fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.14)' },
  poolHint: { fontFamily: FONTS.body, fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 16, lineHeight: 18 },

  formulaToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingVertical: 4 },
  formulaToggleText: { flex: 1, fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.navy },
  formulaCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 16, marginTop: 8, borderWidth: 1, borderColor: COLORS.border },
  formulaText: { fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.charcoal, lineHeight: 21 },
  formulaExample: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.orange, marginTop: 12 },
  bold: { fontFamily: FONTS.bold },

  sectionTitle: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.warmGray, letterSpacing: 0.5, marginTop: 26, marginBottom: 10, textTransform: 'uppercase' },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  rowLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  rowBorderTop: { borderTopWidth: 1, borderTopColor: COLORS.border },
  rowTitle: { flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: COLORS.charcoal, marginRight: 12 },
  rowCooks: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.orange },
  emptyText: { fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.warmGray, paddingVertical: 4 },

  payoutHead: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  payoutMonth: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.warmGray },
  payoutAmount: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.navy, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  chipText: { fontFamily: FONTS.semibold, fontSize: 11.5 },
  payoutDetail: { padding: 16, paddingTop: 0 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.border },
  detailLabel: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.warmGray },
  detailValue: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.charcoal },

  connectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', paddingVertical: 15 },
  connectText: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.warmGray },
});
