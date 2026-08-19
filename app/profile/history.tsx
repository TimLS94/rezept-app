// What you have actually cooked.
//
// The one screen in the app made of facts rather than intentions: every row
// is something that happened, with the rating you gave it at the time.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../lib/theme';
import { HEADER_TOP } from '../../lib/layout';
import { goBackOr } from '../../lib/nav';
import { fetchCookingHistory, currentStreak, CookedEntry } from '../../lib/profileStats';

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function CookingHistoryScreen() {
  const [entries, setEntries] = useState<CookedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCookingHistory().then(e => { setEntries(e); setLoading(false); });
  }, []);

  // Grouped by day, so the list reads as a diary rather than as a log file.
  const groups: { day: string; items: CookedEntry[] }[] = [];
  for (const e of entries) {
    const day = dayLabel(e.created_at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }

  const streak = currentStreak(entries);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/profile')} style={styles.hBtn}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.hTitle}>Cooking History</Text>
        <View style={styles.hBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.orange} /></View>
      ) : entries.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🍳</Text>
          <Text style={styles.emptyTitle}>Nothing cooked yet</Text>
          <Text style={styles.emptyText}>
            Finish a recipe in cook mode and it lands here, with the rating you gave it.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.summary}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryNum}>{entries.length}</Text>
              <Text style={styles.summaryLabel}>meals cooked</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCell}>
              <Text style={styles.summaryNum}>{streak}</Text>
              <Text style={styles.summaryLabel}>day streak</Text>
            </View>
          </View>

          {groups.map(g => (
            <View key={g.day}>
              <Text style={styles.day}>{g.day}</Text>
              {g.items.map(e => (
                <TouchableOpacity
                  key={e.id}
                  style={styles.row}
                  onPress={() => router.push(`/recipe/${e.recipe_id}`)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {e.recipe_title || 'Recipe'}
                    </Text>
                    <Text style={styles.rowTime}>
                      {new Date(e.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  {e.rating ? (
                    <View style={styles.stars}>
                      {Array.from({ length: e.rating }, (_, i) => (
                        <Ionicons key={i} name="star" size={13} color={COLORS.orange} />
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.unrated}>not rated</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 54, marginBottom: 14 },
  emptyTitle: { fontSize: 19, fontWeight: '700', color: COLORS.navy },
  emptyText: { fontSize: 14, color: COLORS.warmGray, textAlign: 'center', marginTop: 6, lineHeight: 20 },

  body: { padding: 20 },
  summary: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 18,
    borderWidth: 1, borderColor: '#EFE7DC', marginBottom: 8,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: '#EFE7DC' },
  summaryNum: { fontFamily: FONTS.display, fontSize: 26, color: COLORS.orange },
  summaryLabel: { fontSize: 12, color: COLORS.warmGray, marginTop: 2 },

  day: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.navy, marginTop: 22, marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#EFE7DC',
  },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  rowTime: { fontSize: 12, color: COLORS.warmGray, marginTop: 3 },
  stars: { flexDirection: 'row', gap: 1 },
  unrated: { fontSize: 12, color: '#C9C0AE' },
});
