import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getRecipeById, Recipe } from '../../data/recipes';
import { fetchDbRecipeById } from '../../lib/recipes';
import { incrementCooked, awardFor, nextAward } from '../../lib/cookStats';

export default function CookModeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | undefined>(getRecipeById(id || ''));
  const [loading, setLoading] = useState(!recipe);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState(false);
  const [cookedCount, setCookedCount] = useState(0);
  const [rating, setRating] = useState(0);
  const counted = useRef(false);

  useEffect(() => {
    if (recipe) return;
    (async () => {
      const r = await fetchDbRecipeById(id || '');
      setRecipe(r);
      setLoading(false);
    })();
  }, [id]);

  const total = recipe?.steps.length ?? 0;

  const checkStep = (index: number) => {
    setDone(prev => {
      const next = new Set(prev);
      next.add(index);
      // Finished when every step is checked off.
      if (next.size === total && total > 0 && !counted.current) {
        counted.current = true;
        incrementCooked().then(setCookedCount);
        setFinished(true);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#F57C00" />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={styles.container}>
        <Header title="Cook" />
        <View style={styles.center}>
          <Text style={styles.emptyText}>Recipe not found</Text>
        </View>
      </View>
    );
  }

  // Completion screen with award + feedback.
  if (finished) {
    const award = awardFor(cookedCount);
    const next = nextAward(cookedCount);
    return (
      <View style={styles.container}>
        <Header title="Done!" />
        <ScrollView contentContainerStyle={styles.doneWrap}>
          <Text style={styles.doneEmoji}>🎉</Text>
          <Text style={styles.doneTitle}>You cooked {recipe.title}!</Text>
          <Text style={styles.doneCount}>That's your {cookedCount}. recipe cooked 🍽️</Text>

          {award && (
            <View style={styles.awardCard}>
              <Text style={styles.awardIcon}>{award.icon}</Text>
              <Text style={styles.awardTitle}>{award.title}</Text>
              {next && (
                <Text style={styles.awardNext}>
                  {next.threshold - cookedCount} more to unlock {next.icon} {next.title}
                </Text>
              )}
            </View>
          )}

          <Text style={styles.feedbackLabel}>How was it?</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <TouchableOpacity key={n} onPress={() => setRating(n)}>
                <Text style={styles.star}>{n <= rating ? '★' : '☆'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
            <Text style={styles.doneButtonText}>Finish</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  const remaining = recipe.steps
    .map((text, i) => ({ text, i }))
    .filter(s => !done.has(s.i));

  return (
    <View style={styles.container}>
      <Header title="Cook Mode" />

      {/* Progress */}
      <View style={styles.progressWrap}>
        <Text style={styles.progressText}>{done.size} / {total} steps done</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: total ? `${(done.size / total) * 100}%` : '0%' }]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.stepsWrap} showsVerticalScrollIndicator={false}>
        <Text style={styles.recipeTitle}>{recipe.title}</Text>

        {/* Ingredients quick reference */}
        {recipe.ingredients.length > 0 && (
          <View style={styles.ingredientsCard}>
            <Text style={styles.ingredientsHeader}>Ingredients</Text>
            {recipe.ingredients.map((ing, i) => (
              <Text key={i} style={styles.ingredientLine}>
                • {ing.amount ? `${ing.amount} ${ing.unit} ` : ''}{ing.name}
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.stepsHeader}>Steps</Text>
        {remaining.map((s, idx) => (
          <View key={s.i} style={[styles.stepCard, idx === 0 && styles.stepCardCurrent]}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{s.i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{s.text}</Text>
            <TouchableOpacity style={styles.stepCheck} onPress={() => checkStep(s.i)}>
              <Text style={styles.stepCheckText}>✓</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function Header({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
        <Text style={styles.headerBtnText}>Close</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 56 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#888' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 14,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  headerBtn: { minWidth: 56 },
  headerBtnText: { fontSize: 16, color: '#F57C00', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 18, color: '#0D2B63', letterSpacing: 0.3 },

  progressWrap: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 },
  progressText: { fontSize: 13, color: '#888', marginBottom: 8, fontWeight: '600' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#EEE', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#F57C00', borderRadius: 4 },

  stepsWrap: { padding: 20 },
  recipeTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', marginBottom: 16 },
  ingredientsCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#F0F0F0' },
  ingredientsHeader: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  ingredientLine: { fontSize: 14, color: '#555', lineHeight: 22 },
  stepsHeader: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  stepCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#F0F0F0' },
  stepCardCurrent: { borderColor: '#F57C00', borderWidth: 2 },
  stepNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFF0EA', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stepNumberText: { fontSize: 14, fontWeight: '700', color: '#F57C00' },
  stepText: { flex: 1, fontSize: 15, color: '#333', lineHeight: 22 },
  stepCheck: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F57C00', justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  stepCheckText: { color: '#FFF', fontSize: 18, fontWeight: '800' },

  doneWrap: { alignItems: 'center', padding: 30, paddingTop: 40 },
  doneEmoji: { fontSize: 72 },
  doneTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', marginTop: 12 },
  doneCount: { fontSize: 15, color: '#666', marginTop: 8 },
  awardCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 24, alignItems: 'center', marginTop: 24, alignSelf: 'stretch', borderWidth: 1, borderColor: '#FFE0D0' },
  awardIcon: { fontSize: 56 },
  awardTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginTop: 8 },
  awardNext: { fontSize: 13, color: '#888', marginTop: 8, textAlign: 'center' },
  feedbackLabel: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 28 },
  starsRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  star: { fontSize: 34, color: '#F57C00' },
  doneButton: { backgroundColor: '#F57C00', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48, marginTop: 32 },
  doneButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
