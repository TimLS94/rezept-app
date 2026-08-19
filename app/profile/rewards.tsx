// Badges, and how far off the next one is.
//
// The awards already existed — cook mode has shown one at the end of every
// recipe since the beginning — but there was nowhere to see the collection,
// so a badge appeared once and then vanished for good.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { COLORS, FONTS } from '../../lib/theme';
import { HEADER_TOP } from '../../lib/layout';
import { goBackOr } from '../../lib/nav';
import { AWARDS, nextAward } from '../../lib/cookStats';
import { fetchCookingHistory, currentStreak } from '../../lib/profileStats';

export default function RewardsScreen() {
  const [count, setCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Counted from the log rather than the local counter: the log is what
    // survives a reinstall and a second device, and a badge that disappears
    // when you change phone is worse than no badge.
    fetchCookingHistory(500).then(entries => {
      setCount(entries.length);
      setStreak(currentStreak(entries));
      setLoading(false);
    });
  }, []);

  const next = nextAward(count);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/profile')} style={styles.hBtn}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.hTitle}>Rewards</Text>
        <View style={styles.hBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.orange} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.top}>
            <Text style={styles.bigNum}>{count}</Text>
            <Text style={styles.bigLabel}>{count === 1 ? 'meal cooked' : 'meals cooked'}</Text>
            {streak > 0 && <Text style={styles.streak}>🔥 {streak}-day streak</Text>}
          </View>

          {next && (
            <View style={styles.nextCard}>
              <Text style={styles.nextIcon}>{next.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.nextTitle}>{next.threshold - count} more to {next.title}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(100, (count / next.threshold) * 100)}%` }]} />
                </View>
              </View>
            </View>
          )}

          <Text style={styles.section}>All badges</Text>
          {AWARDS.map(a => {
            const earned = count >= a.threshold;
            return (
              <View key={a.threshold} style={[styles.badge, !earned && styles.badgeLocked]}>
                <Text style={[styles.badgeIcon, !earned && styles.lockedIcon]}>{a.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.badgeTitle, !earned && styles.lockedText]}>{a.title}</Text>
                  <Text style={styles.badgeSub}>
                    {earned ? 'Earned' : `Cook ${a.threshold} meals`}
                  </Text>
                </View>
                {earned && <Text style={styles.tick}>✓</Text>}
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
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
  hBtn: { width: 60 },
  back: { fontSize: 16, color: COLORS.orange, fontWeight: '600' },
  hTitle: { fontFamily: 'Anton_400Regular', fontSize: 19, color: COLORS.navy },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  body: { padding: 20 },
  top: { alignItems: 'center', paddingVertical: 18 },
  bigNum: { fontFamily: FONTS.display, fontSize: 52, color: COLORS.orange },
  bigLabel: { fontSize: 14, color: COLORS.warmGray, marginTop: -2 },
  streak: { fontSize: 14, color: COLORS.navy, fontWeight: '700', marginTop: 10 },

  nextCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFF', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  nextIcon: { fontSize: 30 },
  nextTitle: { fontSize: 14, fontWeight: '700', color: COLORS.navy, marginBottom: 8 },
  track: { height: 6, backgroundColor: '#EFE7DC', borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: COLORS.orange, borderRadius: 3 },

  section: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.navy, marginTop: 26, marginBottom: 10 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  badgeLocked: { backgroundColor: '#FAF8F4' },
  badgeIcon: { fontSize: 26 },
  lockedIcon: { opacity: 0.32 },
  badgeTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  lockedText: { color: '#A9A093' },
  badgeSub: { fontSize: 12, color: COLORS.warmGray, marginTop: 2 },
  tick: { color: COLORS.green, fontSize: 18, fontWeight: '700' },
});
