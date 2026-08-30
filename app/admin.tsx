// The dashboard, as a screen.
//
// It started as a web page, which is where a dashboard belongs — until the
// platform said otherwise: Supabase serves edge-function HTML as text/plain
// with a sandbox CSP, deliberately, so it cannot be used to put pages on a
// supabase.co address. Everything else about that page worked; it was
// unreadable for a reason no amount of code changes.
//
// Hosting it properly needs the website that does not exist yet. In the
// meantime this is the same information with no hosting at all, and it
// arrives with one advantage the page never had: no token to copy, because
// the app is already signed in.
//
// Admin only, and the check that matters is in the database — admin_health()
// refuses anyone without the role. This screen hiding itself is a courtesy,
// not the lock.
import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  listApplications, decideApplication, type PendingApplication,
} from '../lib/creatorApplications';
import { COLORS, FONTS } from '../lib/theme';
import { HEADER_TOP } from '../lib/layout';
import { goBackOr } from '../lib/nav';

const RANGES = [
  { hours: 24, label: '24h' },
  { hours: 72, label: '3d' },
  { hours: 168, label: '7d' },
  { hours: 720, label: '30d' },
];

export default function AdminScreen() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<any>(null);
  const [apps, setApps] = useState<PendingApplication[]>([]);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: d, error: e } = await supabase.rpc('admin_health', { p_hours: hours });
    if (e) {
      // Names the two things it can be, because they have different fixes.
      setError(
        /admin_health/.test(e.message)
          ? 'monitoring.sql has not been run yet.'
          : e.message,
      );
    } else if (!d?.ok) {
      setError(d?.error === 'not_admin'
        ? 'This account does not have the admin role.'
        : String(d?.error ?? 'unknown'));
    } else {
      setError(null);
      setData(d);
    }
    // Applications are the one thing here that is a queue rather than a
    // reading: somebody is waiting on the other end of each row.
    setApps(await listApplications('pending'));
    setLoading(false);
  }, [hours]);

  const decide = (app: PendingApplication, approve: boolean) => {
    Alert.alert(
      approve ? 'Approve as creator?' : 'Reject application?',
      approve
        ? `${app.name || app.email} will be able to publish recipes, set prices and take payouts.`
        : `${app.name || app.email} can apply again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Approve' : 'Reject',
          style: approve ? 'default' : 'destructive',
          onPress: async () => {
            setDeciding(app.user_id);
            const r = await decideApplication(app.user_id, approve);
            setDeciding(null);
            if (r.error) {
              Alert.alert('Could not save', r.error);
              return;
            }
            setApps(prev => prev.filter(a => a.user_id !== app.user_id));
          },
        },
      ],
    );
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const money = (c: number) => `$${((c ?? 0) / 100).toFixed(2)}`;
  const u = data?.usage ?? {};
  const m = data?.money ?? {};

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/settings')} style={styles.hBtn}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <View style={styles.hBtn} />
      </View>

      <View style={styles.ranges}>
        {RANGES.map(r => (
          <TouchableOpacity
            key={r.hours}
            style={[styles.range, hours === r.hours && styles.rangeOn]}
            onPress={() => setHours(r.hours)}
          >
            <Text style={[styles.rangeText, hours === r.hours && styles.rangeTextOn]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.orange} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Nothing to show</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={COLORS.orange} />}
        >
          <View style={styles.cards}>
            <Stat n={u.total_users} l="users" />
            <Stat n={u.signups} l="new sign-ups" />
            <Stat n={u.cooks} l="meals cooked" />
            <Stat n={u.imports} l="imports" />
            <Stat n={u.fridge_scans} l="fridge scans" />
            <Stat n={m.active_premium} l="premium active" />
            <Stat n={money(m.gross_cents)} l="gross taken" />
            <Stat n={m.payouts_pending} l="payouts pending" />
          </View>

          <Text style={styles.section}>
            Creator applications{apps.length ? ` (${apps.length})` : ''}
          </Text>
          {apps.length === 0 ? (
            <Text style={styles.empty}>Nobody waiting.</Text>
          ) : (
            apps.map(a => (
              <View key={a.user_id} style={styles.appCard}>
                <Text style={styles.rowTitle}>{a.name || a.email}</Text>
                <Text style={styles.rowMeta}>
                  {a.email}{a.username ? ` · @${a.username}` : ''} ·{' '}
                  {new Date(a.applied_at).toLocaleDateString()}
                </Text>
                {a.pitch ? <Text style={styles.pitch}>{a.pitch}</Text> : null}
                {a.links ? <Text style={styles.links}>{a.links}</Text> : null}
                <View style={styles.appActions}>
                  <TouchableOpacity
                    style={[styles.appBtn, styles.reject]}
                    onPress={() => decide(a, false)}
                    disabled={deciding === a.user_id}
                  >
                    <Text style={styles.rejectText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.appBtn, styles.approve]}
                    onPress={() => decide(a, true)}
                    disabled={deciding === a.user_id}
                  >
                    <Text style={styles.approveText}>
                      {deciding === a.user_id ? '…' : 'Approve'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <Text style={styles.section}>AI gateway</Text>
          {(data.ops ?? []).length === 0 ? (
            <Text style={styles.empty}>
              No calls in this window. If that is a surprise, it is the finding.
            </Text>
          ) : (
            data.ops.map((o: any) => (
              <View key={o.op} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{o.op}</Text>
                  <Text style={styles.rowMeta}>
                    {o.calls} calls · p50 {o.p50_ms ?? '—'}ms · p95 {o.p95_ms ?? '—'}ms
                    {o.top_error ? ` · ${o.top_error}` : ''}
                  </Text>
                </View>
                <Text style={[styles.rate, Number(o.failure_rate) > 10 ? styles.bad : styles.good]}>
                  {o.failure_rate}%
                </Text>
              </View>
            ))
          )}

          <Text style={styles.section}>App errors</Text>
          {(data.errors ?? []).length === 0 ? (
            <Text style={styles.empty}>
              Nothing reported. Either it is quiet, or app_errors.sql has not been run.
            </Text>
          ) : (
            data.errors.map((e: any, i: number) => (
              <View key={i} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{e.message}</Text>
                  <Text style={styles.rowMeta}>
                    {e.kind} · {e.users} {e.users === 1 ? 'person' : 'people'} ·{' '}
                    {String(e.update_id ?? '').slice(0, 8)}
                  </Text>
                </View>
                <Text style={[styles.rate, styles.bad]}>{e.count}</Text>
              </View>
            ))
          )}

          {m.comped > 0 && (
            <Text style={styles.warn}>
              {m.comped} comped account{m.comped === 1 ? '' : 's'} still active — clear these
              before launch.
            </Text>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ n, l }: { n: unknown; l: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardN}>{String(n ?? 0)}</Text>
      <Text style={styles.cardL}>{l}</Text>
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
  hBtn: { width: 64 },
  back: { fontSize: 16, color: COLORS.orange, fontWeight: '600' },
  headerTitle: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.navy },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorTitle: { fontSize: 17, fontWeight: '700', color: COLORS.navy, marginBottom: 8 },
  errorText: { fontSize: 13.5, color: COLORS.warmGray, textAlign: 'center', lineHeight: 20 },

  ranges: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  range: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFE7DC',
  },
  rangeOn: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  rangeText: { fontSize: 13, fontWeight: '700', color: COLORS.warmGray },
  rangeTextOn: { color: '#FFF' },

  body: { paddingHorizontal: 20, paddingBottom: 20 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    flexBasis: '47%', flexGrow: 1, backgroundColor: '#FFF', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: '#EFE7DC',
  },
  cardN: { fontSize: 22, fontWeight: '800', color: COLORS.navy },
  cardL: { fontSize: 12, color: COLORS.warmGray, marginTop: 2 },

  section: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.navy, marginTop: 26, marginBottom: 10 },
  empty: { fontSize: 13, color: COLORS.warmGray, lineHeight: 19 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  rowTitle: { fontSize: 13.5, fontWeight: '700', color: COLORS.navy },
  rowMeta: { fontSize: 11.5, color: COLORS.warmGray, marginTop: 3 },
  appCard: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  pitch: { fontSize: 13.5, color: COLORS.charcoal, lineHeight: 19, marginTop: 8 },
  links: { fontSize: 12.5, color: COLORS.orange, marginTop: 6 },
  appActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  appBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  reject: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFE7DC' },
  rejectText: { fontSize: 14, fontWeight: '700', color: '#B0402A' },
  approve: { backgroundColor: COLORS.green },
  approveText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  rate: { fontSize: 15, fontWeight: '800' },
  good: { color: COLORS.green },
  bad: { color: '#B0402A' },
  warn: {
    fontSize: 12.5, color: '#8A4B1E', backgroundColor: '#FFF3E9',
    padding: 12, borderRadius: 12, marginTop: 22, lineHeight: 18,
  },
});
