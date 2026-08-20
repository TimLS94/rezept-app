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
import { RECIPES, Recipe, DIETARY_TAGS } from '../../data/recipes';
import { useAuth } from '../../lib/auth';
import { fetchMyProfile } from '../../lib/profile';
import { buildRecipePool, shuffled } from '../../lib/planner';
import { fetchMyRecipes, myRecipeToRecipe } from '../../lib/myRecipes';
import { fetchCookbookCreatorRecipes } from '../../lib/recipes';
import { loadScan, matchRecipes } from '../../lib/fridge';
import { fetchPopularThisWeek, isPopular, Popularity } from '../../lib/popular';
import { loadPreferences, Preferences } from '../../lib/preferences';
import { matchRecipe, warningText, Match } from '../../lib/matching';
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

const CATEGORY_LABELS: Record<string, string> = {
  quick: 'Quick', kids: 'Kid-friendly', healthy: 'Healthy', budget: 'Budget',
};

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
  // recipe id → the ingredients you would still have to buy, by name. A
  // percentage answers "how close am I"; this answers "what does it cost me
  // to say yes", which is the question someone standing in their kitchen is
  // actually asking — and naming the three items answers it properly.
  const [toBuy, setToBuy] = useState<Record<string, string[]>>({});
  // recipe id → how many people cooked it in the last seven days.
  const [popular, setPopular] = useState<Record<string, Popularity>>({});
  // What the user told us during onboarding, for the fit score.
  const [prefs, setPrefs] = useState<Preferences | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        loadPreferences().then(({ prefs }) => active && setPrefs(prefs)).catch(() => {});

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

        // What everyone else cooked this week, so the first suggestion can be
        // something people are actually making. It still comes out of this
        // user's own pool — their cookbook and their filters decide what is
        // eligible, popularity only decides the order within it.
        const trending = await fetchPopularThisWeek();
        if (!active) return;
        setPopular(trending);

        const shuffledPool = shuffled(usable);
        const hot = shuffledPool.filter(r => isPopular(trending[r.id]));
        const rest = shuffledPool.filter(r => !isPopular(trending[r.id]));
        setPicks([...hot, ...rest].slice(0, 12));

        // A real number or none at all.
        const scan = await loadScan();
        if (active && scan?.items.length) {
          const matched = matchRecipes(usable, scan.items);
          setCoverage(Object.fromEntries(matched.map(m => [m.recipe.id, m.coverage])));
          setToBuy(Object.fromEntries(matched.map(m => [m.recipe.id, m.missing.map(i => i.name)])));
        }
      })();
      return () => { active = false; };
    }, [])
  );

  // Fit reorders what popularity already ordered, and an allergen conflict
  // sinks a recipe rather than removing it — you may well be cooking for
  // yourself tonight, and a cookbook that quietly hides things leaves you
  // wondering what happened to them.
  const ranked = prefs
    ? [...picks].sort((a, b) => {
        const ma = matchRecipe(a, { prefs });
        const mb = matchRecipe(b, { prefs });
        const safe = (m: Match | null) => (m?.warnings.length ? 0 : 1);
        return (
          safe(mb) - safe(ma) ||
          Number(isPopular(popular[b.id])) - Number(isPopular(popular[a.id])) ||
          (mb?.score ?? 0) - (ma?.score ?? 0)
        );
      })
    : picks;

  const hero = ranked[cursor % (ranked.length || 1)];
  const others = ranked.filter((_, i) => i !== cursor % (ranked.length || 1)).slice(0, 6);
  const heroMatch = hero && prefs ? matchRecipe(hero, { prefs }) : null;
  const heroWarning = warningText(heroMatch?.warnings ?? []);

  const matchOf = (r: Recipe) =>
    coverage[r.id] != null ? Math.round(coverage[r.id] * 100) : null;

  const perServing = (r: Recipe) =>
    r.cost > 0 && r.servings > 0 ? `$${(r.cost / r.servings).toFixed(2)} per serving` : null;

  /** What is still missing, or null when the scan had nothing to say about it. */
  const missingOf = (r: Recipe) => toBuy[r.id] ?? null;

  const shoppingLine = (r: Recipe) => {
    const missing = missingOf(r);
    if (missing == null) return null;
    return missing.length === 0 ? 'nothing to buy' : `${missing.length} to buy`;
  };

  /** The same, but naming names — worth the room on the big card. */
  const shoppingDetail = (r: Recipe) => {
    const missing = missingOf(r);
    if (!missing?.length) return null;
    const named = missing.slice(0, 3).join(', ');
    return missing.length > 3 ? `${named} +${missing.length - 3} more` : named;
  };

  // Only scored against answers the user actually gave. No preferences, no
  // badge — a fit score for a profile nobody filled in is decoration.
  const matchFor = (r: Recipe): Match | null =>
    prefs ? matchRecipe(r, { prefs }) : null;

  /** What kind of dish this is, in words. Categories and dietary tags overlap
   *  ("healthy" is in both), so they are merged and capped — three labels read
   *  as a description, six read as noise. */
  const chipsFor = (r: Recipe): string[] => {
    const labels = [
      ...r.categories.map(c => CATEGORY_LABELS[c] ?? c),
      ...r.dietary.map(d => DIETARY_TAGS.find(t => t.id === d)?.label ?? d),
    ];
    return [...new Set(labels)].slice(0, 3);
  };

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
        {/* Say what the suggestion is actually based on, and only claim the
            parts that are true right now. */}
        <Text style={styles.sub}>
          {[
            'From your cookbook',
            prefs && Object.keys(prefs).length ? 'what you told us you like' : null,
            Object.keys(coverage).length ? 'and what your last scan found' : null,
          ].filter(Boolean).join(', ').replace(', and', ' and')}
          .
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
                {matchOf(hero) != null ? (
                  <View style={styles.matchBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#FFF" />
                    <Text style={styles.matchText}>
                      {matchOf(hero)}% in your fridge
                      {shoppingLine(hero) ? ` · ${shoppingLine(hero)}` : ''}
                    </Text>
                  </View>
                ) : (
                  <View />
                )}
                <View style={styles.timeBadge}>
                  <Ionicons name="time-outline" size={13} color={COLORS.navy} />
                  <Text style={styles.timeText}>{hero.prepTime + hero.cookTime} min</Text>
                </View>
              </View>

              <View style={styles.heroFoot}>
                {/* Only when there are people behind it. A "popular" badge on
                    a recipe one person cooked is your own cook log read back
                    to you, which is not a thing the home screen should say. */}
                {isPopular(popular[hero.id]) && (
                  <View style={styles.hotChip}>
                    <Text style={styles.hotText}>
                      🔥 Popular this week · {popular[hero.id].people} people cooked it
                    </Text>
                  </View>
                )}
                <Text style={styles.heroTitle} numberOfLines={2}>{hero.title}</Text>

                {/* What we know about the fit, and what it would cost — both
                    only when there is something real behind them. */}
                {heroMatch && (
                  <Text style={styles.heroFit}>
                    <Text style={styles.heroFitScore}>{heroMatch.score}% for you</Text>
                    {heroMatch.reasons.length ? ` · ${heroMatch.reasons.join(' · ')}` : ''}
                  </Text>
                )}
                {shoppingDetail(hero) && (
                  <Text style={styles.heroShop}>🛒 Still need: {shoppingDetail(hero)}</Text>
                )}
                {heroWarning && (
                  <View style={styles.warnRow}>
                    <Ionicons name="alert-circle" size={13} color="#FFD9C7" />
                    <Text style={styles.warnText}>{heroWarning}</Text>
                  </View>
                )}

                {/* Time is on the badge above; repeating it here spent a line
                    on something already answered. */}
                <Text style={styles.heroMeta}>
                  {[
                    hero.difficulty,
                    `${hero.servings} servings`,
                    perServing(hero),
                  ].filter(Boolean).join('  ·  ')}
                </Text>
                {chipsFor(hero).length > 0 && (
                  <View style={styles.chipRow}>
                    {chipsFor(hero).map(c => (
                      <View key={c} style={styles.chip}>
                        <Text style={styles.chipText}>{c}</Text>
                      </View>
                    ))}
                  </View>
                )}
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
                    {matchOf(r) != null ? (
                      <View style={styles.ideaMatch}>
                        <Text style={styles.ideaMatchText}>{matchOf(r)}%</Text>
                      </View>
                    ) : (
                      <View />
                    )}
                    <View style={styles.ideaTime}>
                      <Text style={styles.ideaTimeText}>{r.prepTime + r.cookTime} min</Text>
                    </View>
                  </View>
                  <View style={styles.ideaFoot}>
                    <Text style={styles.ideaTitle} numberOfLines={2}>{r.title}</Text>
                    <Text style={styles.ideaSub} numberOfLines={1}>
                      {(() => {
                        const m = matchFor(r);
                        return [
                          // An allergen is the one thing that has to be
                          // readable before anything else on the card.
                          m?.warnings.length ? `⚠︎ ${m.warnings[0]}` : null,
                          isPopular(popular[r.id]) ? '🔥 popular' : null,
                          m && !m.warnings.length ? `${m.score}% for you` : null,
                          shoppingLine(r),
                          chipsFor(r)[0],
                        ].filter(Boolean).join('  ·  ');
                      })()}
                    </Text>
                  </View>
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
  heroFit: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, marginTop: 8 },
  heroFitScore: { fontWeight: '800' },
  heroShop: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 4 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  warnText: { color: '#FFD9C7', fontSize: 11.5, fontWeight: '700' },
  hotChip: {
    alignSelf: 'flex-start', backgroundColor: COLORS.orange,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, marginBottom: 8,
  },
  hotText: { color: '#FFF', fontSize: 11.5, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 11,
  },
  chipText: { color: '#FFF', fontSize: 11, fontWeight: '600' },

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
  ideaFoot: { padding: 9, gap: 2 },
  ideaTitle: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  ideaSub: { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '600' },
});
