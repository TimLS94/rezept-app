import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { getRecipeById, Recipe } from '../../data/recipes';
import { fetchDbRecipeById } from '../../lib/recipes';
import { incrementCooked, awardFor, nextAward, logCook, saveCookRating } from '../../lib/cookStats';
import { COLORS, FONTS } from '../../lib/theme';
import ImageViewer from '../../components/ImageViewer';

type Phase = 'intro' | 'cooking';

export default function CookModeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | undefined>(getRecipeById(id || ''));
  const [loading, setLoading] = useState(!recipe);
  const [phase, setPhase] = useState<Phase>('intro');
  const [done, setDone] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState(false);
  const [cookedCount, setCookedCount] = useState(0);
  const [rating, setRating] = useState(0);
  const [logId, setLogId] = useState<string | null>(null);
  const [timer, setTimer] = useState<{ step: number; left: number } | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const counted = useRef(false);
  const beep = useAudioPlayer(require('../../assets/sounds/timer-done.wav'));

  // Let the timer beep sound even when the phone is on silent.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Per-step countdown. Buzzes (haptic) when it reaches zero.
  useEffect(() => {
    if (!timer || timer.left <= 0) return;
    const id = setInterval(() => {
      setTimer(t => {
        if (!t) return t;
        if (t.left <= 1) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          try { beep.seekTo(0); beep.play(); } catch {}
          return { ...t, left: 0 };
        }
        return { ...t, left: t.left - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timer?.step, timer ? timer.left > 0 : false]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Animations
  const introFade = useRef(new Animated.Value(0)).current;
  const introLift = useRef(new Animated.Value(30)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const awardPop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (recipe) return;
    (async () => {
      const r = await fetchDbRecipeById(id || '');
      setRecipe(r);
      setLoading(false);
    })();
  }, [id]);

  // Intro reveal + looping pulse behind the "start" badge.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(introFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(introLift, { toValue: 0, duration: 500, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Bounce the award in when the finish screen appears.
  useEffect(() => {
    if (finished) {
      awardPop.setValue(0);
      Animated.spring(awardPop, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
    }
  }, [finished]);

  const total = recipe?.steps.length ?? 0;

  const startCooking = () => setPhase('cooking');

  // Toggle a step done/undone — checking collapses it, tapping again re-opens it.
  const toggleStep = (index: number) => {
    setDone(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Explicit finish (shown once all steps are checked) so nothing auto-jumps
  // and you can still go back and re-open steps.
  const finishCooking = () => {
    if (counted.current) return;
    counted.current = true;
    incrementCooked().then(setCookedCount);
    if (recipe) logCook(recipe).then(setLogId); // persist to DB (aggregatable)
    setFinished(true);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.orange} />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={styles.container}>
        <Header title="Cook" />
        <View style={styles.center}><Text style={styles.muted}>Recipe not found</Text></View>
      </View>
    );
  }

  // ── Completion / rewards ──────────────────────────────────────────────────
  if (finished) {
    const award = awardFor(cookedCount);
    const next = nextAward(cookedCount);
    return (
      <View style={[styles.container, styles.center, { padding: 30 }]}>
        <Animated.View style={{ alignItems: 'center', transform: [{ scale: awardPop }], opacity: awardPop }}>
          <Text style={styles.doneEmoji}>🎉</Text>
          <Text style={styles.doneTitle}>NICE WORK!</Text>
          <Text style={styles.doneSub}>You cooked {recipe.title}</Text>
          <Text style={styles.doneCount}>That's your {cookedCount}. recipe cooked</Text>

          {award && (
            <View style={styles.awardCard}>
              <Text style={styles.awardIcon}>{award.icon}</Text>
              <Text style={styles.awardTitle}>{award.title}</Text>
              {next && (
                <View style={styles.awardProgressWrap}>
                  <View style={styles.awardTrack}>
                    <View style={[styles.awardFill, { width: `${Math.min((cookedCount / next.threshold) * 100, 100)}%` }]} />
                  </View>
                  <Text style={styles.awardNext}>{next.threshold - cookedCount} more → {next.icon} {next.title}</Text>
                </View>
              )}
            </View>
          )}

          <Text style={styles.feedbackLabel}>How was it?</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => { setRating(n); if (logId) saveCookRating(logId, n); }}>
                <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={32} color={COLORS.orange} />
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>FINISH</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Intro ─────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <View style={styles.container}>
        <Image source={{ uri: recipe.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.introOverlay} />
        <TouchableOpacity style={styles.introClose} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color="#FFF" />
        </TouchableOpacity>
        <Animated.View style={[styles.introContent, { opacity: introFade, transform: [{ translateY: introLift }] }]}>
          <Animated.View style={[styles.introBadge, { transform: [{ scale: pulse }] }]}>
            <Ionicons name="restaurant" size={40} color="#FFF" />
          </Animated.View>
          <Text style={styles.introKicker}>COOK MODE</Text>
          <Text style={styles.introTitle}>{recipe.title}</Text>
          <View style={styles.introMeta}>
            <View style={styles.introMetaItem}><Ionicons name="time-outline" size={16} color="#FFF" /><Text style={styles.introMetaText}>{recipe.prepTime + recipe.cookTime} min</Text></View>
            <View style={styles.introMetaItem}><Ionicons name="list-outline" size={16} color="#FFF" /><Text style={styles.introMetaText}>{recipe.steps.length} steps</Text></View>
            <View style={styles.introMetaItem}><Ionicons name="people-outline" size={16} color="#FFF" /><Text style={styles.introMetaText}>{recipe.servings}</Text></View>
          </View>
          <TouchableOpacity style={styles.startBtn} onPress={startCooking} activeOpacity={0.9}>
            <Ionicons name="flame" size={20} color="#FFF" />
            <Text style={styles.startBtnText}>START COOKING</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // ── Cooking ───────────────────────────────────────────────────────────────
  const currentIndex = recipe.steps.findIndex((_, i) => !done.has(i));
  const allDone = total > 0 && done.size === total;

  return (
    <View style={styles.container}>
      <Header title="Cook Mode" />
      <View style={styles.progressWrap}>
        <Text style={styles.progressText}>{done.size} / {total} steps done</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: total ? `${(done.size / total) * 100}%` : '0%' }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.stepsWrap} showsVerticalScrollIndicator={false}>
        <Text style={styles.recipeTitle}>{recipe.title}</Text>

        {recipe.ingredients.length > 0 && (
          <View style={styles.ingredientsCard}>
            <Text style={styles.cardHeader}>INGREDIENTS</Text>
            {recipe.ingredients.map((ing, i) => (
              <Text key={i} style={styles.ingredientLine}>• {ing.amount ? `${ing.amount} ${ing.unit} ` : ''}{ing.name}</Text>
            ))}
          </View>
        )}

        <Text style={styles.cardHeader}>STEPS</Text>
        {recipe.steps.map((text, i) => {
          const isDone = done.has(i);
          const isCurrent = !isDone && i === currentIndex;
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={0.85}
              onPress={() => toggleStep(i)}
              style={[styles.stepCard, isCurrent && styles.stepCardCurrent, isDone && styles.stepCardDone]}
            >
              <View style={styles.stepRowInner}>
                <View style={[styles.checkCircle, isDone && styles.checkCircleDone]}>
                  {isDone ? <Ionicons name="checkmark" size={16} color="#FFF" /> : <Text style={styles.checkNum}>{i + 1}</Text>}
                </View>
                <Text style={[styles.stepText, isDone && styles.stepTextDone]} numberOfLines={isDone ? 1 : undefined}>
                  {text}
                </Text>
                {isDone && <Ionicons name="chevron-down" size={16} color={COLORS.warmGray} style={{ marginLeft: 8 }} />}
              </View>
              {!isDone && recipe.stepImages?.[i] ? (
                <TouchableOpacity activeOpacity={0.9} onPress={() => setViewerUri(recipe.stepImages![i]!)}>
                  <Image source={{ uri: recipe.stepImages[i]! }} style={styles.stepImg} contentFit="cover" />
                </TouchableOpacity>
              ) : null}
              {!isDone && recipe.stepTimers?.[i] ? (
                timer?.step === i ? (
                  <TouchableOpacity
                    style={[styles.timerActive, timer.left === 0 && styles.timerDone]}
                    onPress={() => setTimer(null)}
                  >
                    <Ionicons name={timer.left === 0 ? 'alarm' : 'timer-outline'} size={16} color="#FFF" />
                    <Text style={styles.timerActiveText}>
                      {timer.left === 0 ? "TIME'S UP! · tap to clear" : `${fmtTime(timer.left)} · tap to stop`}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.timerStart}
                    onPress={() => setTimer({ step: i, left: recipe.stepTimers![i]! })}
                  >
                    <Ionicons name="timer-outline" size={16} color={COLORS.orange} />
                    <Text style={styles.timerStartText}>Start timer · {fmtTime(recipe.stepTimers[i]!)}</Text>
                  </TouchableOpacity>
                )
              ) : null}
            </TouchableOpacity>
          );
        })}

        {allDone && (
          <TouchableOpacity style={styles.finishBtn} onPress={finishCooking}>
            <Ionicons name="trophy" size={18} color="#FFF" />
            <Text style={styles.finishBtnText}>FINISH & GET REWARD</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      <ImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </View>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
        <Ionicons name="close" size={24} color={COLORS.navy} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { fontSize: 16, color: COLORS.warmGray },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 14,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerBtn: { width: 40 },
  headerTitle: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.navy, letterSpacing: 0.3 },

  // Intro
  introOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,43,99,0.72)' },
  introClose: { position: 'absolute', top: 58, right: 20, zIndex: 5, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  introContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  introBadge: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.orange, justifyContent: 'center', alignItems: 'center', marginBottom: 22 },
  introKicker: { fontFamily: FONTS.semibold, color: COLORS.orange, fontSize: 13, letterSpacing: 2 },
  introTitle: { fontFamily: FONTS.display, color: '#FFF', fontSize: 34, textAlign: 'center', marginTop: 6, lineHeight: 42, paddingTop: 2 },
  introMeta: { flexDirection: 'row', gap: 18, marginTop: 18 },
  introMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  introMetaText: { fontFamily: FONTS.medium, color: 'rgba(255,255,255,0.92)', fontSize: 13 },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.orange, paddingHorizontal: 30, paddingVertical: 16, borderRadius: 30, marginTop: 34 },
  startBtnText: { fontFamily: FONTS.bold, color: '#FFF', fontSize: 15, letterSpacing: 0.5 },

  // Countdown
  countText: { fontFamily: FONTS.display, fontSize: 120, color: '#FFF' },

  // Cooking
  progressWrap: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  progressText: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.warmGray, marginBottom: 8 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#EDE4D6', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.orange, borderRadius: 4 },
  stepsWrap: { padding: 20 },
  recipeTitle: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.navy, marginBottom: 16 },
  cardHeader: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.orange, letterSpacing: 1.2, marginBottom: 10 },
  ingredientsCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 22, borderWidth: 1, borderColor: COLORS.border },
  ingredientLine: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.charcoal, lineHeight: 23 },
  stepCard: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  stepRowInner: { flexDirection: 'row', alignItems: 'center' },
  stepImg: { width: '100%', height: 160, borderRadius: 10, marginTop: 12 },
  timerStart: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 12, marginLeft: 42, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#FFD3C2', backgroundColor: '#FFF3EC' },
  timerStartText: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.orange },
  timerActive: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 12, marginLeft: 42, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, backgroundColor: COLORS.navy },
  timerDone: { backgroundColor: COLORS.orange },
  timerActiveText: { fontFamily: FONTS.bold, fontSize: 14, color: '#FFF' },
  stepCardCurrent: { borderColor: COLORS.orange, borderWidth: 2 },
  stepCardDone: { backgroundColor: '#F6F1EA', borderColor: COLORS.border },
  checkCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: COLORS.navy, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  checkCircleDone: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  checkNum: { fontFamily: FONTS.bold, fontSize: 14, color: COLORS.navy },
  stepText: { flex: 1, fontFamily: FONTS.body, fontSize: 15, color: COLORS.charcoal, lineHeight: 22 },
  stepTextDone: { color: COLORS.warmGray, textDecorationLine: 'line-through' },
  finishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.orange, borderRadius: 16, paddingVertical: 16, marginTop: 8 },
  finishBtnText: { fontFamily: FONTS.bold, color: '#FFF', fontSize: 15, letterSpacing: 0.5 },

  // Completion
  doneEmoji: { fontSize: 72 },
  doneTitle: { fontFamily: FONTS.display, fontSize: 34, color: COLORS.navy, marginTop: 8 },
  doneSub: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.charcoal, marginTop: 4, textAlign: 'center' },
  doneCount: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.warmGray, marginTop: 6 },
  awardCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 22, alignItems: 'center', marginTop: 22, alignSelf: 'stretch', borderWidth: 1, borderColor: COLORS.border },
  awardIcon: { fontSize: 52 },
  awardTitle: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.navy, marginTop: 6 },
  awardProgressWrap: { alignSelf: 'stretch', marginTop: 14 },
  awardTrack: { height: 8, borderRadius: 4, backgroundColor: '#EDE4D6', overflow: 'hidden' },
  awardFill: { height: '100%', backgroundColor: COLORS.orange, borderRadius: 4 },
  awardNext: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.warmGray, marginTop: 8, textAlign: 'center' },
  feedbackLabel: { fontFamily: FONTS.semibold, fontSize: 15, color: COLORS.charcoal, marginTop: 26 },
  starsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  primaryBtn: { backgroundColor: COLORS.orange, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 56, marginTop: 30 },
  primaryBtnText: { fontFamily: FONTS.bold, color: '#FFF', fontSize: 15, letterSpacing: 0.5 },
});
