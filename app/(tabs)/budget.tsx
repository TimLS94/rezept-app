import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  ActivityIndicator,
  Alert
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Recipe, DietaryTag, DIETARY_TAGS } from '../../data/recipes';
import { addRecipesToShoppingList, describeAdd } from '../../lib/shopping';
import { FEATURES } from '../../lib/features';
import { useMealPlan, PlannedMeal } from '../../lib/mealPlan';
import { fetchMyRecipes, myRecipeToRecipe, MyRecipe } from '../../lib/myRecipes';
import { fetchCookbookCreatorRecipes, CookbookCreatorRecipe } from '../../lib/recipes';
import { buildRecipePool, filterByDietary, shuffled, withIngredients } from '../../lib/planner';
import { WEEKDAYS, startOfWeek, addDays, weekKey, fmtDay } from '../../lib/week';
import WeekPlanBoard from '../../components/WeekPlanBoard';
import { Modal } from 'react-native';
import { useCallback } from 'react';
import { HEADER_TOP } from '../../lib/layout';

// A week of meals from whatever the pool offers. Fewer than seven recipes means
// a shorter week rather than the same meal repeated — planning Monday's dinner
// again on Wednesday is not a plan.
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const buildPlan = (pool: Recipe[]): PlannedMeal[] =>
  pool.slice(0, 7).map((recipe, i) => ({ id: `m${i}-${Date.now()}`, recipe }));

export default function BudgetScreen() {
  const { plansByWeek, setWeekPlan, updateWeekPlan } = useMealPlan();
  const [weeklyBudget] = useState(150);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showCookbookPicker, setShowCookbookPicker] = useState(false);
  const [pendingDay, setPendingDay] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pickerTab, setPickerTab] = useState<'mine' | 'creators'>('mine');
  // Search and dietary filters belong here rather than over the week: this is
  // where you are looking for one particular recipe among everything you own.
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerFilters, setPickerFilters] = useState<DietaryTag[]>([]);

  // Description is searched as well as title, because a note's whole content
  // is its description.
  const pickerMatches = (r: { title: string; description: string; dietary: DietaryTag[] }) => {
    const q = pickerQuery.trim().toLowerCase();
    const hitsQuery =
      q === '' || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    return hitsQuery && pickerFilters.every(tag => r.dietary.includes(tag));
  };

  const togglePickerFilter = (tag: DietaryTag) =>
    setPickerFilters(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));

  
  // Cookbook recipes for the picker
  const [myRecipes, setMyRecipes] = useState<MyRecipe[]>([]);
  const [creatorRecipes, setCreatorRecipes] = useState<CookbookCreatorRecipe[]>([]);
  const [loadingCookbook, setLoadingCookbook] = useState(false);
  const shownMine = myRecipes.filter(pickerMatches);
  const shownCreators = creatorRecipes.filter(pickerMatches);

  // Load cookbook when picker opens
  const loadCookbook = async () => {
    setLoadingCookbook(true);
    const [mine, creators] = await Promise.all([
      fetchMyRecipes(),
      fetchCookbookCreatorRecipes(),
    ]);
    setMyRecipes(mine);
    setCreatorRecipes(creators);
    setLoadingCookbook(false);
  };

  useFocusEffect(
    useCallback(() => {
      // Pre-load cookbook for faster picker
      loadCookbook();
    }, [])
  );

  const key = weekKey(weekStart);
  const mealPlan = plansByWeek[key] ?? [];
  const isThisWeek = key === weekKey(new Date());

  // The planner starts empty — the user fills it via "Generate", "Add a meal",
  // or the favorites picker. (No auto-seeding.)

  const goToWeek = (offset: number) => setWeekStart(startOfWeek(addDays(weekStart, offset * 7)));
  const goToToday = () => setWeekStart(startOfWeek(new Date()));

  const setPlan = (updater: (plan: PlannedMeal[]) => PlannedMeal[]) => updateWeekPlan(key, updater);

  const totalCost = mealPlan.reduce((sum, meal) => sum + meal.recipe.cost, 0);
  const remaining = weeklyBudget - totalCost;
  const avgPerMeal = mealPlan.length ? totalCost / mealPlan.length : 0;
  // Only meals you still need count towards the shopping list.
  const openMeals = mealPlan.filter(m => !m.done);
  const doneCount = mealPlan.length - openMeals.length;
  const allDone = mealPlan.length > 0 && openMeals.length === 0;
  const totalIngredients = openMeals.reduce((sum, meal) => sum + meal.recipe.ingredients.length, 0);

  // The pool is fetched once and reused for Generate and swaps, so neither
  // waits on the network twice.
  const [pool, setPool] = useState<Recipe[] | null>(null);

  // Convert cookbook recipes to Recipe format for the pool
  const getCookbookAsRecipes = (): Recipe[] => {
    const mine = myRecipes.map(myRecipeToRecipe);
    // CookbookCreatorRecipe extends Recipe, so it's already the right type
    const creators: Recipe[] = creatorRecipes;
    return [...mine, ...creators];
  };

  const loadPool = async (): Promise<Recipe[]> => {
    if (pool) return pool;
    const cookbookRecipes = getCookbookAsRecipes();
    const fresh = await buildRecipePool(cookbookRecipes);
    setPool(fresh);
    return fresh;
  };

  // Cookbook changes invalidate the pool
  useEffect(() => {
    setPool(null);
  }, [myRecipes, creatorRecipes]);

  const regeneratePlan = async () => {
    setGenerating(true);
    try {
      const options = await loadPool();
      if (options.length === 0) {
        Alert.alert(
          'Nothing to plan with yet',
          'Add recipes to your cookbook first — import from photos, write your own, or save creator recipes.',
        );
        return;
      }
      // Ingredients are fetched only for the seven that made it into the plan,
      // not for the whole pool.
      setWeekPlan(key, buildPlan(await withIngredients(shuffled(options).slice(0, 7))));
    } finally {
      setGenerating(false);
    }
  };

  const swapMeal = async (id: string) => {
    const all = await loadPool();
    const current = mealPlan.find(m => m.id === id)?.recipe.id;
    const used = mealPlan.map(m => m.recipe.id);

    // Prefer something not already in the week. Once everything is in there,
    // fall back to anything other than what this slot already holds — the
    // button used to filter out every candidate and then return silently,
    // which is indistinguishable from a broken button.
    const unused = all.filter(r => !used.includes(r.id));
    const others = all.filter(r => r.id !== current);
    const from = unused.length ? unused : others;

    if (!from.length) {
      Alert.alert(
        'Nothing to swap in',
        'Your cookbook has only this one recipe to offer. Add a few more and the swap will have something to reach for.'
      );
      return;
    }

    const [pick] = await withIngredients([from[Math.floor(Math.random() * from.length)]]);
    setPlan(plan => plan.map(m => (m.id === id ? { ...m, recipe: pick, done: false } : m)));
  };

  const toggleDone = (id: string) => {
    setPlan(plan => plan.map(m => (m.id === id ? { ...m, done: !m.done } : m)));
  };

  const removeMeal = (id: string) => {
    setPlan(plan => plan.filter(m => m.id !== id));
  };

  // Add a specific recipe from the user's cookbook. Duplicates are allowed.
  const addFromCookbook = (recipe: Recipe) => {
    setPlan(plan => {
      const day = pendingDay ?? firstFreeDay(plan);
      // No duplicate check at all. Twice on the same day is a real plan —
      // cooking a double batch, or lunch and dinner — and the shopping list
      // merges by ingredient, so two helpings of the same recipe correctly
      // become twice the flour rather than two lines of it.
      return [
            ...plan,
            {
              id: `m${Date.now()}-${recipe.id}`,
              recipe,
              done: false,
              // Opened from a day's "+" → land on that day. Opened from the
              // button under the week → the first day with nothing on it.
              day,
            },
          ];
    });
  };

  // The earliest day with nothing on it, so repeated adds fill the week out
  // rather than stacking on Monday.
  const firstFreeDay = (plan: PlannedMeal[]): number => {
    const used = new Set(plan.map((m, i) => m.day ?? i % 7));
    for (let d = 0; d < 7; d++) if (!used.has(d)) return d;
    return 0;
  };

  const addWeekToShoppingList = async () => {
    if (openMeals.length === 0) {
      Alert.alert('Nothing to add', 'All meals are checked off. Uncheck a meal or add one.');
      return;
    }
    setAdding(true);
    const result = await addRecipesToShoppingList(openMeals.map(m => ({ recipe: m.recipe })));
    setAdding(false);

    if ('error' in result) {
      Alert.alert('Sign in required', 'Sign in to save your shopping list.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/login') },
      ]);
      return;
    }

    Alert.alert(
      'Added to Shopping List! 🛒',
      `${openMeals.length} meals • ${describeAdd(result.added, result.merged, undefined, result)}` +
        (result.merged ? ` (${result.merged} merged)` : ''),
      [
        { text: 'Keep Planning', style: 'cancel' },
        { text: 'View List', onPress: () => router.push('/shopping') },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={!dragging}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.backButton} />
          <Text style={styles.headerTitle}>Meal Planner</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Week navigator */}
        <View style={styles.weekNav}>
          <TouchableOpacity style={styles.weekArrow} onPress={() => goToWeek(-1)}>
            <Text style={styles.weekArrowText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.weekLabelWrap} onPress={goToToday}>
            <Text style={styles.weekLabel}>
              {fmtDay(weekStart)} – {fmtDay(addDays(weekStart, 6))}
            </Text>
            <Text style={styles.weekSub}>{isThisWeek ? 'This week' : 'Tap to jump to today'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.weekArrow} onPress={() => goToWeek(1)}>
            <Text style={styles.weekArrowText}>›</Text>
          </TouchableOpacity>
        </View>

        {/* The week as seven days rather than a date range. "Aug 17 – Aug 23"
            tells you which week; this tells you where you are in it, which is
            the thing you actually look for. Each day carries how many meals
            are on it, so gaps are visible without scrolling. */}
        <View style={styles.dayStrip}>
          {WEEKDAY_SHORT.map((label, i) => {
            const date = addDays(weekStart, i);
            const isToday = date.toDateString() === new Date().toDateString();
            const count = mealPlan.filter((m, idx) => (m.day ?? idx % 7) === i).length;
            return (
              <View key={i} style={[styles.dayCell, isToday && styles.dayCellToday]}>
                <Text style={[styles.dayName, isToday && styles.dayNameToday]}>{label}</Text>
                <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>{date.getDate()}</Text>
                <View style={styles.dayDots}>
                  {count > 0 ? (
                    Array.from({ length: Math.min(count, 3) }, (_, d) => (
                      <View key={d} style={[styles.dot, isToday && styles.dotToday]} />
                    ))
                  ) : (
                    <View style={styles.dotEmpty} />
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Budget Overview — roadmap V2, hidden behind the budget feature flag */}
        {FEATURES.budget && (
          <View style={styles.budgetCard}>
            <View style={styles.budgetHeader}>
              <Text style={styles.budgetLabel}>Weekly Budget</Text>
              <Text style={styles.budgetAmount}>${weeklyBudget}</Text>
            </View>

            <View style={styles.budgetProgress}>
              <View style={[styles.budgetBar, { width: `${Math.min((totalCost / weeklyBudget) * 100, 100)}%` }]} />
            </View>

            <View style={styles.budgetStats}>
              <View style={styles.budgetStat}>
                <Text style={styles.budgetStatValue}>${totalCost.toFixed(2)}</Text>
                <Text style={styles.budgetStatLabel}>Planned</Text>
              </View>
              <View style={styles.budgetStat}>
                <Text style={[styles.budgetStatValue, { color: remaining >= 0 ? '#3C8D40' : '#E53935' }]}>
                  ${Math.abs(remaining).toFixed(2)}
                </Text>
                <Text style={styles.budgetStatLabel}>{remaining >= 0 ? 'Remaining' : 'Over Budget'}</Text>
              </View>
              <View style={styles.budgetStat}>
                <Text style={styles.budgetStatValue}>${avgPerMeal.toFixed(2)}</Text>
                <Text style={styles.budgetStatLabel}>Avg/Meal</Text>
              </View>
            </View>
          </View>
        )}




        {/* Meal Plan */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{isThisWeek ? "This Week's Meals" : 'Meals'}</Text>
            {mealPlan.length > 0 && (
              <Text style={styles.cookedCount}>{doneCount}/{mealPlan.length} cooked</Text>
            )}
          </View>

          <WeekPlanBoard
            weekStart={weekStart}
            meals={mealPlan}
            onChange={next => setWeekPlan(key, next)}
            onOpen={meal =>
              router.push(
                meal.recipe.source === 'mine'
                  ? `/cookbook/${meal.recipe.id}`
                  : `/recipe/${meal.recipe.id}`
              )
            }
            onCook={meal =>
              router.push(
                `/cook/${meal.recipe.id}?source=${meal.recipe.source === 'mine' ? 'mine' : 'creator'}&servings=${meal.recipe.servings}`
              )
            }
            onSwap={meal => swapMeal(meal.id)}
            onRemove={meal => removeMeal(meal.id)}
            onToggleDone={meal => toggleDone(meal.id)}
            onCart={async meal => {
              // One dish at a time. The week button is still there for the
              // whole shop, but planning rarely happens in one sitting — you
              // add Thursday on Tuesday and want just that on the list.
              const result = await addRecipesToShoppingList([{ recipe: meal.recipe }]);
              if ('error' in result) {
                Alert.alert('Sign in required', 'Sign in to save your shopping list.', [
                  { text: 'Not now', style: 'cancel' },
                  { text: 'Sign in', onPress: () => router.push('/login') },
                ]);
                return;
              }
              Alert.alert(
                'Added 🛒',
                describeAdd(result.added, result.merged, meal.recipe.title, result),
              );
            }}
            onAddToDay={day => { setPendingDay(day); setShowCookbookPicker(true); }}
            onDragStateChange={setDragging}
          />

          {allDone && (
            <TouchableOpacity style={styles.nextWeekButton} onPress={() => goToWeek(1)}>
              <Text style={styles.nextWeekButtonText}>✅ Week done — start next week →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* One button, and it says what it will add. The separate "shopping
            list preview" card that used to sit under it is gone: the Shopping
            tab is one tap away in the nav bar, so a second door to it was
            just another thing to read. */}
        <TouchableOpacity
          style={[styles.addWeekButton, adding && styles.addWeekButtonDisabled]}
          onPress={addWeekToShoppingList}
          disabled={adding || totalIngredients === 0}
        >
          {adding ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.addWeekButtonText}>
              🛒 Add to shopping list ({totalIngredients})
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Cookbook picker — add recipes from cookbook to the week */}
      <Modal visible={showCookbookPicker} animationType="slide" transparent onRequestClose={() => setShowCookbookPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add from cookbook</Text>
              <TouchableOpacity onPress={() => setShowCookbookPicker(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            
            {/* Tab toggle */}
            <View style={styles.pickerTabs}>
              <TouchableOpacity
                style={[styles.pickerTab, pickerTab === 'mine' && styles.pickerTabActive]}
                onPress={() => setPickerTab('mine')}
              >
                <Text style={[styles.pickerTabText, pickerTab === 'mine' && styles.pickerTabTextActive]}>
                  My recipes ({shownMine.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerTab, pickerTab === 'creators' && styles.pickerTabActive]}
                onPress={() => setPickerTab('creators')}
              >
                <Text style={[styles.pickerTabText, pickerTab === 'creators' && styles.pickerTabTextActive]}>
                  From creators ({shownCreators.length})
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pickerSearchBox}>
              <Text style={styles.pickerSearchIcon}>🔍</Text>
              <TextInput
                style={styles.pickerSearchInput}
                value={pickerQuery}
                onChangeText={setPickerQuery}
                placeholder="Search your cookbook"
                placeholderTextColor="#AAA"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pickerChips}
            >
              {DIETARY_TAGS.map(tag => {
                const active = pickerFilters.includes(tag.id);
                return (
                  <TouchableOpacity
                    key={tag.id}
                    style={[styles.pickerChip, active && styles.pickerChipActive]}
                    onPress={() => togglePickerFilter(tag.id)}
                  >
                    <Text style={[styles.pickerChipText, active && styles.pickerChipTextActive]}>
                      {tag.icon} {tag.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {loadingCookbook ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color="#F2701E" />
              </View>
            ) : pickerTab === 'mine' ? (
              myRecipes.length === 0 ? (
                <Text style={styles.modalEmpty}>No recipes yet. Import or write your own in the Cookbook.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 380 }}>
                  {shownMine.map(r => {
                    const recipe = myRecipeToRecipe(r);
                    const timesInWeek = mealPlan.filter(m => m.recipe.id === recipe.id).length;
                    return (
                      <View key={r.id} style={styles.favRow}>
                        {recipe.image ? (
                          <Image source={{ uri: recipe.image }} style={styles.favImage} />
                        ) : (
                          <View style={[styles.favImage, styles.favImageEmpty]}>
                            <Text style={styles.favImageEmptyText}>🍽️</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.favTitle} numberOfLines={1}>{recipe.title}</Text>
                          <Text style={styles.favMeta}>{recipe.prepTime + recipe.cookTime} min · {recipe.servings} servings</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.favAdd}
                          onPress={() => addFromCookbook(recipe)}
                        >
                          <Text style={styles.favAddText}>
                            {timesInWeek ? `+ Add (${timesInWeek}×)` : '+ Add'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              )
            ) : (
              creatorRecipes.length === 0 ? (
                <Text style={styles.modalEmpty}>No creator recipes saved. Browse creators to add recipes.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 380 }}>
                  {shownCreators.map(r => {
                    const timesInWeek = mealPlan.filter(m => m.recipe.id === r.id).length;
                    return (
                      <View key={r.id} style={styles.favRow}>
                        {r.image ? (
                          <Image source={{ uri: r.image }} style={styles.favImage} />
                        ) : (
                          <View style={[styles.favImage, styles.favImageEmpty]}>
                            <Text style={styles.favImageEmptyText}>🍽️</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.favTitle} numberOfLines={1}>{r.title}</Text>
                          <Text style={styles.favMeta}>{r.prepTime + r.cookTime} min · {r.calories} cal</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.favAdd}
                          onPress={() => addFromCookbook(r)}
                        >
                          <Text style={styles.favAddText}>
                            {timesInWeek ? `+ Add (${timesInWeek}×)` : '+ Add'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              )
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9F2',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: HEADER_TOP,
    paddingBottom: 20,
  },
  backButton: {
    width: 60,
  },
  backText: {
    fontSize: 16,
    color: '#F2701E',
    fontWeight: '600',
  },
  headerTitle: {
    fontFamily: 'Anton_400Regular',
    fontSize: 20,
    color: '#0D2B63',
    letterSpacing: 0.3,
  },
  budgetCard: {
    backgroundColor: '#F2701E',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  budgetLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  budgetAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFF',
  },
  budgetProgress: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    marginBottom: 16,
  },
  budgetBar: {
    height: '100%',
    backgroundColor: '#FFF',
    borderRadius: 4,
  },
  budgetStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  budgetStat: {
    alignItems: 'center',
  },
  budgetStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  budgetStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  dayStrip: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 14, gap: 4,
  },
  dayCell: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 12,
    backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EFE7DC',
  },
  dayCellToday: { backgroundColor: '#0D2B63', borderColor: '#0D2B63' },
  dayName: { fontSize: 10, color: '#8A8A8A', fontWeight: '600' },
  dayNameToday: { color: 'rgba(255,255,255,0.75)' },
  dayNum: { fontSize: 16, fontWeight: '800', color: '#0D2B63', marginTop: 2 },
  dayNumToday: { color: '#FFF' },
  dayDots: { flexDirection: 'row', gap: 2, height: 6, marginTop: 4, alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#F2701E' },
  dotToday: { backgroundColor: '#FFB27A' },
  dotEmpty: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },

  fromCookbookButton: {
    backgroundColor: '#0D2B63',
    marginHorizontal: 20,
    marginTop: 4,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  fromCookbookText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  generateButton: {
    marginHorizontal: 20,
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4DACA',
    backgroundColor: 'transparent',
  },
  generateButtonText: { color: '#0D2B63', fontSize: 15, fontWeight: '600' },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
  },
  weekArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  weekArrowText: {
    fontSize: 24,
    color: '#F2701E',
    fontWeight: '700',
    lineHeight: 26,
  },
  weekLabelWrap: {
    flex: 1,
    alignItems: 'center',
  },
  weekLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  weekSub: {
    fontSize: 12,
    color: '#F2701E',
    marginTop: 2,
    fontWeight: '600',
  },
  section: {
    padding: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  cookedCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3C8D40',
  },
  nextWeekButton: {
    backgroundColor: '#3C8D40',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  nextWeekButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  mealContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  mealDay: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F2701E',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  mealTitleDone: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  modalClose: { fontSize: 16, fontWeight: '700', color: '#F2701E' },
  modalEmpty: { fontSize: 14, color: '#888', textAlign: 'center', paddingVertical: 30, lineHeight: 20 },
  favRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  favImage: { width: 56, height: 56, borderRadius: 10 },
  favTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  favMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  favAdd: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: '#F2701E' },
  favAddText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  favImageEmpty: { backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  favImageEmptyText: { fontSize: 20 },
  addWeekButton: {
    backgroundColor: '#F2701E',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  addWeekButtonDisabled: {
    opacity: 0.7,
  },
  addWeekButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 40,
  },
  pickerTabs: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 4,
  },
  pickerTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  pickerTabActive: {
    backgroundColor: '#FFF',
  },
  pickerTabText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
  pickerTabTextActive: {
    color: '#1A1A1A',
    fontWeight: '600',
  },
  pickerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF9F2',
    borderWidth: 1,
    borderColor: '#EFE7DC',
  },
  pickerSearchIcon: { fontSize: 14 },
  pickerSearchInput: { flex: 1, fontSize: 15, color: '#1A1A1A', paddingVertical: 0 },
  pickerChips: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4, gap: 8 },
  pickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#F4F1EC',
  },
  pickerChipActive: { backgroundColor: '#0D2B63' },
  pickerChipText: { fontSize: 12, color: '#666', fontWeight: '600' },
  pickerChipTextActive: { color: '#FFF' },
  modalLoading: {
    padding: 40,
    alignItems: 'center',
  },
});
