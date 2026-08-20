// What you ate, by day or by week.
//
// Built entirely from meals you marked as cooked. That makes it true and
// incomplete at the same time, and the screen says which — a total presented
// as "your day" when it only knows about SpoonDrop meals would be a quiet lie.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../lib/theme';
import { HEADER_TOP } from '../../lib/layout';
import { goBackOr } from '../../lib/nav';
import { loadPreferences, Preferences } from '../../lib/preferences';
import {
  fetchLoggedMeals, sumMeals, LoggedMeal, DayTotals,
  startOfDay, addDays, startOfWeek,
} from '../../lib/nutritionLog';
import MacroRing from '../../components/MacroRing';

type Mode = 'today' | 'week';

/** What to print on the right of a meal row: calories if we have them, the
 *  macros if that is all the recipe carries, nothing if it carries neither. */
function mealFigure(m: { nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number } }): string | null {
  const n = m.nutrition;
  if (!n) return null;
  if (n.calories) return `${Math.round(n.calories)} cal`;
  const macros = [
    n.protein != null ? `${Math.round(n.protein)}P` : null,
    n.carbs != null ? `${Math.round(n.carbs)}C` : null,
    n.fat != null ? `${Math.round(n.fat)}F` : null,
  ].filter(Boolean);
  return macros.length ? macros.join(' · ') : null;
}

export default function NutritionLogScreen() {
  const [mode, setMode] = useState<Mode>('today');
  const [offset, setOffset] = useState(0);       // days or weeks back
  const [meals, setMeals] = useState<LoggedMeal[]>([]);
  const [prefs, setPrefs] = useState<Preferences>({});
  const [loading, setLoading] = useState(true);

  const from = mode === 'today'
    ? addDays(startOfDay(), -offset)
    : addDays(startOfWeek(), -offset * 7);
  const to = mode === 'today' ? addDays(from, 1) : addDays(from, 7);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      Promise.all([fetchLoggedMeals(from, to), loadPreferences()]).then(([m, p]) => {
        if (!active) return;
        setMeals(m);
        setPrefs(p.prefs);
        setLoading(false);
      });
      return () => { active = false; };
    }, [mode, offset]),
  );

  const goals = prefs.nutrition ?? {};
  const totals = sumMeals(meals);
  const days = mode === 'week' ? 7 : 1;

  // Per-day averages for the week view, so the goal comparison means the same
  // thing in both modes.
  const shown: DayTotals = mode === 'week'
    ? { ...totals,
        calories: Math.round(totals.calories / days),
        protein: Math.round(totals.protein / days),
        carbs: Math.round(totals.carbs / days),
        fat: Math.round(totals.fat / days) }
    : totals;

  const byDay = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(from, i);
    const dayMeals = meals.filter(m => new Date(m.at).toDateString() === d.toDateString());
    return { date: d, total: sumMeals(dayMeals).calories, count: dayMeals.length };
  });
  const peak = Math.max(1, ...byDay.map(d => d.total));

  const title = mode === 'today'
    ? offset === 0 ? 'Today' : from.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
    : `${from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${addDays(from, 6).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  // Number plus a slim track. Three bare figures next to a ring left the
  // right-hand half of the card with nothing to read at a glance.
  const Macro = ({ label, value, goal }: { label: string; value: number; goal?: number }) => {
    const pct = goal && goal > 0 ? Math.min(value / goal, 1) : 0;
    return (
      <View style={styles.macro}>
        <View style={styles.macroRow}>
          <Text style={styles.macroLabel}>{label}</Text>
          <Text style={styles.macroValue}>
            {Math.round(value)}{goal ? ` / ${goal}` : ''}<Text style={styles.macroUnit}>g</Text>
          </Text>
        </View>
        <View style={styles.macroTrack}>
          <View style={[styles.macroFill, { width: `${pct * 100}%` }]} />
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/profile')} style={styles.hBtn}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.hTitle}>Nutrition</Text>
        <View style={styles.hBtn} />
      </View>

      <View style={styles.modes}>
        {(['today', 'week'] as const).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.mode, mode === m && styles.modeOn]}
            onPress={() => { setMode(m); setOffset(0); }}
          >
            <Text style={[styles.modeText, mode === m && styles.modeTextOn]}>
              {m === 'today' ? 'Day' : 'Week'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.nav}>
        <TouchableOpacity onPress={() => setOffset(o => o + 1)} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={18} color={COLORS.navy} />
        </TouchableOpacity>
        <Text style={styles.navLabel}>{title}</Text>
        <TouchableOpacity
          onPress={() => setOffset(o => Math.max(0, o - 1))}
          style={[styles.navBtn, offset === 0 && styles.navBtnOff]}
          disabled={offset === 0}
        >
          <Ionicons name="chevron-forward" size={18} color={offset === 0 ? '#D6CEC0' : COLORS.navy} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.orange} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.summary}>
            <MacroRing
              value={shown.calories}
              goal={goals.calories}
              label={goals.calories ? `of ${goals.calories}\ncalories` : mode === 'week' ? 'cal / day' : 'calories'}
            />
            <View style={styles.macros}>
              <Macro label="Protein" value={shown.protein} goal={goals.protein} />
              <Macro label="Carbs" value={shown.carbs} goal={goals.carbs} />
              <Macro label="Fat" value={shown.fat} goal={goals.fat} />
            </View>
          </View>

          {/* Said plainly and permanently, not buried in a settings page. */}
          <Text style={styles.disclaimer}>
            Counts meals you cooked or ticked off in SpoonDrop. Anything you ate elsewhere is
            not in here, and figures marked as estimates were worked out from ingredients.
          </Text>

          {totals.unknown > 0 && (
            <Text style={styles.unknownNote}>
              {totals.unknown} {totals.unknown === 1 ? 'meal has' : 'meals have'} no nutrition on
              the recipe, so {totals.unknown === 1 ? 'it is' : 'they are'} not included above.
              Open the recipe and tap Estimate to fill it in.
            </Text>
          )}

          {mode === 'week' && (
            <View style={styles.chartCard}>
              <Text style={styles.section}>Calories by day</Text>
              <View style={styles.chart}>
                {byDay.map((d, i) => (
                  <View key={i} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { height: `${(d.total / peak) * 100}%` }]} />
                    </View>
                    <Text style={styles.barLabel}>
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={styles.weekStats}>
                <View style={styles.weekStat}>
                  <Text style={styles.weekNum}>{meals.length}</Text>
                  <Text style={styles.weekLabel}>meals cooked</Text>
                </View>
                <View style={styles.weekStat}>
                  <Text style={styles.weekNum}>{byDay.filter(d => d.count > 0).length}/7</Text>
                  <Text style={styles.weekLabel}>days cooked</Text>
                </View>
              </View>
            </View>
          )}

          <Text style={styles.section}>{mode === 'today' ? 'Meals' : 'Everything this week'}</Text>
          {meals.length === 0 ? (
            <Text style={styles.empty}>
              Nothing logged {mode === 'today' ? 'for this day' : 'this week'} yet. Finish a recipe
              in cook mode, or tick one off in the planner.
            </Text>
          ) : (
            meals.map(m => (
              <View key={m.id} style={styles.mealRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mealTitle} numberOfLines={1}>{m.title}</Text>
                  <Text style={styles.mealTime}>
                    {new Date(m.at).toLocaleString(undefined, {
                      weekday: mode === 'week' ? 'short' : undefined,
                      hour: '2-digit', minute: '2-digit',
                    })}
                    {m.nutrition?.estimated ? ' · estimated' : ''}
                  </Text>
                </View>
                {/* A meal with macros but no calories is not "no data" — the
                    totals above count it, and saying otherwise on the same
                    screen made the two contradict each other. */}
                <Text style={mealFigure(m) ? styles.mealCal : styles.mealNoCal}>
                  {mealFigure(m) ?? 'no data'}
                </Text>
              </View>
            ))
          )}
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
    paddingHorizontal: 20, paddingTop: HEADER_TOP, paddingBottom: 14,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  hBtn: { width: 60 },
  back: { fontSize: 16, color: COLORS.orange, fontWeight: '600' },
  hTitle: { fontFamily: 'Anton_400Regular', fontSize: 19, color: COLORS.navy },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  modes: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14 },
  mode: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFE7DC',
  },
  modeOn: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  modeText: { fontSize: 14, fontWeight: '700', color: COLORS.navy },
  modeTextOn: { color: '#FFF' },

  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  navBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#EFE7DC' },
  navBtnOff: { opacity: 0.45 },
  navLabel: { fontSize: 15, fontWeight: '700', color: COLORS.navy },

  body: { paddingHorizontal: 20 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#FFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#EFE7DC' },
  macros: { flex: 1, gap: 14 },
  macro: { gap: 6 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  macroLabel: { fontSize: 13.5, color: COLORS.navy, fontWeight: '600' },
  macroValue: { fontSize: 13.5, color: COLORS.warmGray, fontWeight: '700' },
  macroUnit: { fontSize: 11.5, color: COLORS.warmGray },
  macroTrack: { height: 5, borderRadius: 3, backgroundColor: '#F3EDE4', overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 3, backgroundColor: COLORS.orange },

  disclaimer: { fontSize: 12, color: COLORS.warmGray, lineHeight: 17, marginTop: 12 },
  unknownNote: { fontSize: 12.5, color: '#8A4B1E', lineHeight: 18, marginTop: 10, backgroundColor: '#FFF3E9', padding: 12, borderRadius: 12 },

  chartCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginTop: 16, borderWidth: 1, borderColor: '#EFE7DC' },
  chart: { flexDirection: 'row', height: 120, alignItems: 'flex-end', gap: 8, marginTop: 6 },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: COLORS.orange, borderRadius: 6, minHeight: 3 },
  barLabel: { fontSize: 11, color: COLORS.warmGray, marginTop: 6 },
  weekStats: { flexDirection: 'row', marginTop: 16, borderTopWidth: 1, borderTopColor: '#F2EDE5', paddingTop: 14 },
  weekStat: { flex: 1, alignItems: 'center' },
  weekNum: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.navy },
  weekLabel: { fontSize: 11, color: COLORS.warmGray, marginTop: 2 },

  section: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.navy, marginTop: 22, marginBottom: 10 },
  empty: { fontSize: 14, color: COLORS.warmGray, lineHeight: 20 },
  mealRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#EFE7DC' },
  mealTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  mealTime: { fontSize: 12, color: COLORS.warmGray, marginTop: 3 },
  mealCal: { fontSize: 14, fontWeight: '700', color: COLORS.orange },
  mealNoCal: { fontSize: 12, color: '#C9C0AE' },
});
