// Home answers one question: what am I cooking tonight.
//
// It used to open on a search bar and a grid of shortcuts, which is a menu,
// not an answer. Now it makes a suggestion, gives you one tap to cook it and
// one to see another, and keeps the shortcuts underneath where they belong.
//
// Everything on the card is measured, not invented. The match badge only
// appears when there is a fridge scan to measure against — a percentage with
// nothing behind it is how "POPULAR THIS WEEK" ended up describing the
// catalogue in catalogue order.
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { RECIPES, Recipe } from '../../data/recipes';
import { useAuth } from '../../lib/auth';
import { fetchMyProfile } from '../../lib/profile';
import { buildRecipePool, shuffled } from '../../lib/planner';
import { fetchMyRecipes, myRecipeToRecipe } from '../../lib/myRecipes';
import { fetchCookbookCreatorRecipes } from '../../lib/recipes';
import { loadScan, matchRecipes } from '../../lib/fridge';
import { COLORS, FONTS } from '../../lib/theme';
import { HEADER_TOP } from '../../lib/layout';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_ACTIONS: { icon: IoniconName; label: string; route: string }[] = [
  { icon: 'scan-outline', label: 'Scan Fridge', route: '/fridge' },
  { icon: 'calendar-outline', label: 'Meal Planner', route: '/budget' },
  { icon: 'cart-outline', label: 'Groceries', route: '/shopping' },
  { icon: 'book-outline', label: 'My Recipes', route: '/cookbook' },
];

export default function HomeScreen() {
  const { isGuest } = useAuth();
  const [name, setName] = useState<string>('');
  const [avatar, setAvatar] = useState<string>(DEFAULT_AVATAR);
  const [picks, setPicks] = useState<Recipe[]>([]);
  const [cursor, setCursor] = useState(0);
  // recipe id → share of its ingredients your last fridge scan covered.
  const [coverage, setCoverage] = useState<Record<string, number>>({});

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const profile = await fetchMyProfile();
        if (active && profile) {
          setName((profile.full_name || '').split(' ')[0]);
          if (profile.avatar_url) setAvatar(profile.avatar_url);
        }

        // Suggestions come from what the user actually has: their cookbook
        // first, then free creator recipes, and the bundled catalogue only as
        // a floor so a brand-new account still sees something.
        const [mine, creators] = await Promise.all([
          fetchMyRecipes(),
          fetchCookbookCreatorRecipes(),
        ]);
        const owned = [...mine.map(myRecipeToRecipe), ...creators];
        const pool = await buildRecipePool(owned);
        const usable = (pool.length ? pool : RECIPES).filter(r => r.steps.length > 0);
        if (!active) return;
        setPicks(shuffled(usable).slice(0, 8));

        // A real number or none at all.
        const scan = await loadScan();
        if (active && scan?.items.length) {
          const matched = matchRecipes(usable, scan.items);
          setCoverage(Object.fromEntries(matched.map(m => [m.recipe.id, m.coverage])));
        }
      })();
      return () => { active = false; };
    }, [])
  );

  const hero = picks[cursor % (picks.length || 1)];
  const others = picks.filter((_, i) => i !== cursor % (picks.length || 1)).slice(0, 6);

  const matchOf = (r: Recipe) =>
    coverage[r.id] != null ? Math.round(coverage[r.id] * 100) : null;

  const perServing = (r: Recipe) =>
    r.cost > 0 && r.servings > 0 ? `$${(r.cost / r.servings).toFixed(2)} per serving` : null;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.topBar}>
          <Text style={styles.wordmark}>SPOON<Text style={styles.wordmarkAccent}>DROP</Text></Text>
          <View style={styles.topRight}>
            <TouchableOpacity onPress={() => router.push('/search')} style={styles.iconBtn}>
              <Ionicons name="search-outline" size={22} color={COLORS.navy} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/profile')}>
              <Image source={{ uri: avatar }} style={styles.avatar} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.greeting}>
          {greeting()}{name ? `, ${name}` : ''} 👋
        </Text>
        <Text style={styles.headline}>What's for dinner?</Text>
        <Text style={styles.sub}>
          {Object.keys(coverage).length
            ? 'Based on your cookbook and what your last scan found.'
            : 'Picked from your cookbook and the creators you follow.'}
        </Text>

        {hero ? (
          <>
            <TouchableOpacity
              style={styles.hero}
              activeOpacity={0.92}
              onPress={() => router.push(hero.source === 'mine' ? `/cookbook/${hero.id}` : `/recipe/${hero.id}`)}
            >
              <Image source={{ uri: hero.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={styles.heroShade} />

              <View style={styles.badgeRow}>
                {matchOf(hero) != null && (
                  <View style={styles.matchBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#FFF" />
                    <Text style={styles.matchText}>{matchOf(hero)}% in your fridge</Text>
                  </View>
                )}
                <View style={styles.timeBadge}>
                  <Ionicons name="time-outline" size={13} color={COLORS.navy} />
                  <Text style={styles.timeText}>{hero.prepTime + hero.cookTime} min</Text>
                </View>
              </View>

              <View style={styles.heroFoot}>
                <Text style={styles.heroTitle} numberOfLines={2}>{hero.title}</Text>
                <Text style={styles.heroMeta}>
                  {[
                    `${hero.prepTime + hero.cookTime} min`,
                    hero.difficulty,
                    perServing(hero),
                  ].filter(Boolean).join('  ·  ')}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.makeBtn}
                onPress={() =>
                  router.push(`/cook/${hero.id}?source=${hero.source === 'mine' ? 'mine' : 'creator'}&servings=${hero.servings}`)
                }
              >
                <Text style={styles.makeText}>Make This</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.swapBtn} onPress={() => setCursor(c => c + 1)}>
                <Text style={styles.swapText}>Swap</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.emptyHero}>
            <Text style={styles.emptyTitle}>Nothing to suggest yet</Text>
            <Text style={styles.emptyText}>
              Save a few recipes to your cookbook and they will show up here.
            </Text>
            <TouchableOpacity style={styles.makeBtn} onPress={() => router.push('/discover')}>
              <Text style={styles.makeText}>Browse recipes</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.quickRow}>
          {QUICK_ACTIONS.map(a => (
            <TouchableOpacity key={a.route} style={styles.quickTile} onPress={() => router.push(a.route as never)}>
              <Ionicons name={a.icon} size={22} color={COLORS.navy} />
              <Text style={styles.quickLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {others.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>More ideas for you</Text>
              <TouchableOpacity onPress={() => router.push('/discover')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ideaRow}>
              {others.map(r => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.idea}
                  activeOpacity={0.9}
                  onPress={() => router.push(r.source === 'mine' ? `/cookbook/${r.id}` : `/recipe/${r.id}`)}
                >
                  <Image source={{ uri: r.image }} style={styles.ideaImage} contentFit="cover" />
                  <View style={styles.ideaShade} />
                  <View style={styles.ideaBadges}>
                    {matchOf(r) != null && (
                      <View style={styles.ideaMatch}>
                        <Text style={styles.ideaMatchText}>{matchOf(r)}%</Text>
                      </View>
                    )}
                    <View style={styles.ideaTime}>
                      <Text style={styles.ideaTimeText}>{r.prepTime + r.cookTime} min</Text>
                    </View>
                  </View>
                  <Text style={styles.ideaTitle} numberOfLines={2}>{r.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  scroll: { paddingTop: HEADER_TOP, paddingHorizontal: 20 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontFamily: FONTS.display, fontSize: 19, color: COLORS.navy, letterSpacing: 0.5 },
  wordmarkAccent: { color: COLORS.orange },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { padding: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEE' },

  greeting: { fontSize: 14, color: COLORS.warmGray, marginTop: 18 },
  headline: { fontFamily: FONTS.display, fontSize: 30, color: COLORS.navy, marginTop: 4 },
  sub: { fontSize: 14, color: COLORS.warmGray, marginTop: 6, lineHeight: 20 },

  hero: {
    height: 250,
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 18,
    justifyContent: 'space-between',
  },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  matchBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.green, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
  },
  matchText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  timeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
  },
  timeText: { color: COLORS.navy, fontSize: 12, fontWeight: '700' },
  heroFoot: { padding: 16 },
  heroTitle: { fontFamily: FONTS.display, fontSize: 24, color: '#FFF' },
  heroMeta: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 6 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  makeBtn: { flex: 1.6, backgroundColor: COLORS.orange, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  makeText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  swapBtn: {
    flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#E4DACA', backgroundColor: '#FFF',
  },
  swapText: { color: COLORS.navy, fontSize: 16, fontWeight: '600' },

  emptyHero: {
    marginTop: 18, padding: 24, borderRadius: 18, backgroundColor: '#FFF',
    alignItems: 'center', borderWidth: 1, borderColor: '#EFE7DC',
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.navy },
  emptyText: { fontSize: 13, color: COLORS.warmGray, textAlign: 'center', marginTop: 6, marginBottom: 16 },

  sectionTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.navy, marginTop: 26 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  seeAll: { color: COLORS.orange, fontSize: 13, fontWeight: '700', marginTop: 26 },

  quickRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  quickTile: {
    flex: 1, aspectRatio: 0.95, backgroundColor: '#FFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#EFE7DC',
    alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 4,
  },
  quickLabel: { fontSize: 11, color: COLORS.navy, fontWeight: '600', textAlign: 'center' },

  ideaRow: { gap: 12, paddingTop: 12, paddingRight: 20 },
  idea: { width: 150, height: 130, borderRadius: 14, overflow: 'hidden', justifyContent: 'space-between' },
  ideaImage: { ...StyleSheet.absoluteFillObject },
  ideaShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  ideaBadges: { flexDirection: 'row', justifyContent: 'space-between', padding: 7 },
  ideaMatch: { backgroundColor: COLORS.green, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  ideaMatchText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  ideaTime: { backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  ideaTimeText: { color: COLORS.navy, fontSize: 10, fontWeight: '700' },
  ideaTitle: { color: '#FFF', fontSize: 13, fontWeight: '700', padding: 9 },
});
