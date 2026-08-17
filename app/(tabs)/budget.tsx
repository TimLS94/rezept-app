import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Recipe, DietaryTag, DIETARY_TAGS } from '../../data/recipes';
import { addRecipesToShoppingList } from '../../lib/shopping';
import { FEATURES } from '../../lib/features';
import { useMealPlan, PlannedMeal } from '../../lib/mealPlan';
import { fetchMyRecipes, myRecipeToRecipe, MyRecipe } from '../../lib/myRecipes';
import { fetchCookbookCreatorRecipes, CookbookCreatorRecipe } from '../../lib/recipes';
import { buildRecipePool, filterByDietary, shuffled, withIngredients } from '../../lib/planner';
import { WEEKDAYS, startOfWeek, addDays, weekKey, fmtDay } from '../../lib/week';
import { Modal } from 'react-native';
import { useCallback } from 'react';
import { HEADER_TOP } from '../../lib/layout';

// A week of meals from whatever the pool offers. Fewer than seven recipes means
// a shorter week rather than the same meal repeated — planning Monday's dinner
// again on Wednesday is not a plan.
const buildPlan = (pool: Recipe[]): PlannedMeal[] =>
  pool.slice(0, 7).map((recipe, i) => ({ id: `m${i}-${Date.now()}`, recipe }));

export default function BudgetScreen() {
  const { plansByWeek, setWeekPlan, updateWeekPlan } = useMealPlan();
  const [weeklyBudget] = useState(150);
  const [activeFilters, setActiveFilters] = useState<DietaryTag[]>([]);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showCookbookPicker, setShowCookbookPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'mine' | 'creators'>('mine');
  
  // Cookbook recipes for the picker
  const [myRecipes, setMyRecipes] = useState<MyRecipe[]>([]);
  const [creatorRecipes, setCreatorRecipes] = useState<CookbookCreatorRecipe[]>([]);
  const [loadingCookbook, setLoadingCookbook] = useState(false);

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

  // Changing a filter only narrows what the next Generate may pick. It no
  // longer silently rebuilds the week — losing a plan you'd already adjusted
  // because you tapped "vegetarian" is not what that tap meant.
  const toggleFilter = (tag: DietaryTag) => {
    setActiveFilters(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

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
      const options = filterByDietary(await loadPool(), activeFilters);
      if (options.length === 0) {
        Alert.alert(
          'Nothing to plan with yet',
          activeFilters.length
            ? 'No recipe matches those filters. Try removing one, or add more recipes to your cookbook.'
            : 'Add recipes to your cookbook first — import from photos, write your own, or save creator recipes.'
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
    const used = mealPlan.map(m => m.recipe.id);
    const options = filterByDietary(await loadPool(), activeFilters).filter(
      r => !used.includes(r.id)
    );
    if (!options.length) return;
    const [pick] = await withIngredients([options[Math.floor(Math.random() * options.length)]]);
    setPlan(plan => plan.map(m => (m.id === id ? { ...m, recipe: pick, done: false } : m)));
  };

  const toggleDone = (id: string) => {
    setPlan(plan => plan.map(m => (m.id === id ? { ...m, done: !m.done } : m)));
  };

  const removeMeal = (id: string) => {
    setPlan(plan => plan.filter(m => m.id !== id));
  };

  const addMeal = async () => {
    const all = filterByDietary(await loadPool(), activeFilters);
    if (!all.length) {
      Alert.alert('Nothing to add yet', 'Add recipes to your cookbook first.');
      return;
    }
    const used = mealPlan.map(m => m.recipe.id);
    const unused = all.filter(r => !used.includes(r.id));
    const from = unused.length ? unused : all;
    const [pick] = await withIngredients([from[Math.floor(Math.random() * from.length)]]);
    setPlan(plan => [...plan, { id: `m${Date.now()}`, recipe: pick, done: false }]);
  };

  // Add a specific recipe from the user's cookbook, skipping duplicates.
  const addFromCookbook = (recipe: Recipe) => {
    setPlan(plan =>
      plan.some(m => m.recipe.id === recipe.id)
        ? plan
        : [...plan, { id: `m${Date.now()}-${recipe.id}`, recipe, done: false }]
    );
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
      `${openMeals.length} meals • ${result.added} new items` +
        (result.merged ? ` (${result.merged} merged)` : ''),
      [
        { text: 'Keep Planning', style: 'cancel' },
        { text: 'View List', onPress: () => router.push('/shopping') },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
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

        {/* Dietary Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {DIETARY_TAGS.map(tag => {
            const active = activeFilters.includes(tag.id);
            return (
              <TouchableOpacity
                key={tag.id}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => toggleFilter(tag.id)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {tag.icon} {tag.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Filters narrow the next Generate rather than rebuilding the week
            on the spot — tapping "vegetarian" should not discard a plan you
            already adjusted. Without saying so, the chips looked broken:
            they highlighted and nothing else happened. */}
        {activeFilters.length > 0 && (
          <Text style={styles.filterHint}>
            {activeFilters.length} filter{activeFilters.length > 1 ? 's' : ''} set — generate to apply
          </Text>
        )}

        {/* Generate Button */}
        <TouchableOpacity
          style={styles.generateButton}
          onPress={regeneratePlan}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.generateButtonText}>
              {activeFilters.length > 0 ? '🎲 Generate with filters' : '🎲 Generate New Plan'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Meal Plan */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{isThisWeek ? "This Week's Meals" : 'Meals'}</Text>
            {mealPlan.length > 0 && (
              <Text style={styles.cookedCount}>{doneCount}/{mealPlan.length} cooked</Text>
            )}
          </View>

          {mealPlan.length === 0 && (
            <Text style={styles.emptyPlanText}>
              Your week is empty. Tap 🎲 Generate for a full plan, or add meals below.
            </Text>
          )}

          {mealPlan.map((meal, i) => (
            <View key={meal.id} style={[styles.mealCard, meal.done && styles.mealCardDone]}>
              <TouchableOpacity
                style={styles.mealMain}
                activeOpacity={0.8}
                onPress={() =>
                  // Own recipes live on the cookbook screen; /recipe/[id] only
                  // knows about creator recipes and cannot resolve a
                  // my_recipes id at all.
                  router.push(
                    meal.recipe.source === 'mine'
                      ? `/cookbook/${meal.recipe.id}`
                      : `/recipe/${meal.recipe.id}`
                  )
                }
              >
                <Image source={{ uri: meal.recipe.image }} style={styles.mealImage} />
                <View style={styles.mealContent}>
                  <Text style={styles.mealDay}>
                    {WEEKDAYS[i % 7]} · {fmtDay(addDays(weekStart, i))}
                  </Text>
                  <Text
                    style={[styles.mealTitle, meal.done && styles.mealTitleDone]}
                    numberOfLines={2}
                  >
                    {meal.recipe.title}
                  </Text>
                  <View style={styles.mealMeta}>
                    <Text style={styles.mealMetaText}>⏱ {meal.recipe.prepTime + meal.recipe.cookTime}min</Text>
                    {FEATURES.budget && (
                      <Text style={styles.mealMetaText}>💰 ${meal.recipe.cost.toFixed(2)}</Text>
                    )}
                    <Text style={styles.mealMetaText}>🔥 {meal.recipe.calories}cal</Text>
                  </View>
                </View>
              </TouchableOpacity>
              <View style={styles.mealActions}>
                <TouchableOpacity
                  style={[styles.checkbox, meal.done && styles.checkboxChecked]}
                  onPress={() => toggleDone(meal.id)}
                >
                  {meal.done && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => swapMeal(meal.id)}>
                  <Text style={styles.iconButtonText}>↻</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={() => removeMeal(meal.id)}>
                  <Text style={styles.iconButtonRemove}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={styles.addRow}>
            <TouchableOpacity style={[styles.addMealButton, styles.addRowItem]} onPress={addMeal}>
              <Text style={styles.addMealButtonText}>+ Add a meal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addFavButton, styles.addRowItem]} onPress={() => setShowCookbookPicker(true)}>
              <Text style={styles.addFavButtonText}>📚 From cookbook</Text>
            </TouchableOpacity>
          </View>

          {allDone && (
            <TouchableOpacity style={styles.nextWeekButton} onPress={() => goToWeek(1)}>
              <Text style={styles.nextWeekButtonText}>✅ Week done — start next week →</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Add whole week to the shopping list */}
        <TouchableOpacity
          style={[styles.addWeekButton, adding && styles.addWeekButtonDisabled]}
          onPress={addWeekToShoppingList}
          disabled={adding}
        >
          {adding ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.addWeekButtonText}>🛒 Add Week to Shopping List</Text>
          )}
        </TouchableOpacity>

        {/* Shopping List Preview */}
        <TouchableOpacity style={styles.shoppingListCard} onPress={() => router.push('/shopping')}>
          <View style={styles.shoppingListIcon}>
            <Text style={styles.shoppingListIconText}>🛒</Text>
          </View>
          <View style={styles.shoppingListContent}>
            <Text style={styles.shoppingListTitle}>Shopping List</Text>
            <Text style={styles.shoppingListSubtitle}>
              {totalIngredients} items{FEATURES.budget ? ` • Est. $${totalCost.toFixed(2)}` : ''}
            </Text>
          </View>
          <Text style={styles.shoppingListArrow}>→</Text>
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
                  My recipes ({myRecipes.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerTab, pickerTab === 'creators' && styles.pickerTabActive]}
                onPress={() => setPickerTab('creators')}
              >
                <Text style={[styles.pickerTabText, pickerTab === 'creators' && styles.pickerTabTextActive]}>
                  From creators ({creatorRecipes.length})
                </Text>
              </TouchableOpacity>
            </View>

            {loadingCookbook ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color="#F2701E" />
              </View>
            ) : pickerTab === 'mine' ? (
              myRecipes.length === 0 ? (
                <Text style={styles.modalEmpty}>No recipes yet. Import or write your own in the Cookbook.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 380 }}>
                  {myRecipes.map(r => {
                    const recipe = myRecipeToRecipe(r);
                    const inPlan = mealPlan.some(m => m.recipe.id === recipe.id);
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
                          style={[styles.favAdd, inPlan && styles.favAddDone]}
                          onPress={() => addFromCookbook(recipe)}
                          disabled={inPlan}
                        >
                          <Text style={[styles.favAddText, inPlan && styles.favAddDoneText]}>
                            {inPlan ? '✓ Added' : '+ Add'}
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
                  {creatorRecipes.map(r => {
                    const inPlan = mealPlan.some(m => m.recipe.id === r.id);
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
                          style={[styles.favAdd, inPlan && styles.favAddDone]}
                          onPress={() => addFromCookbook(r)}
                          disabled={inPlan}
                        >
                          <Text style={[styles.favAddText, inPlan && styles.favAddDoneText]}>
                            {inPlan ? '✓ Added' : '+ Add'}
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
  filterRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  filterChipActive: {
    backgroundColor: '#F2701E',
    borderColor: '#F2701E',
  },
  filterChipText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  filterHint: {
    fontSize: 12,
    color: '#8A4B1E',
    paddingHorizontal: 20,
    paddingBottom: 8,
    fontWeight: '600',
  },
  generateButton: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
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
  emptyPlanText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 24,
  },
  mealCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  mealCardDone: {
    opacity: 0.55,
  },
  mealMain: {
    flex: 1,
    flexDirection: 'row',
  },
  mealImage: {
    width: 100,
    height: 100,
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
  mealTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 4,
    marginBottom: 8,
  },
  mealTitleDone: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  mealMeta: {
    flexDirection: 'row',
  },
  mealMetaText: {
    fontSize: 12,
    color: '#888',
    marginRight: 12,
  },
  mealActions: {
    width: 52,
    backgroundColor: '#F7F7F7',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#CFCFCF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#3C8D40',
    borderColor: '#3C8D40',
  },
  checkmark: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonText: {
    fontSize: 18,
    color: '#888',
  },
  iconButtonRemove: {
    fontSize: 22,
    color: '#E53935',
    fontWeight: '700',
  },
  addRow: { flexDirection: 'row', gap: 10 },
  addRowItem: { flex: 1 },
  addMealButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEE',
    borderStyle: 'dashed',
  },
  addFavButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#FFF0EA',
    borderWidth: 1,
    borderColor: '#FFD3C2',
  },
  addFavButtonText: { fontSize: 14, fontWeight: '700', color: '#F2701E' },
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
  favAddDone: { backgroundColor: '#E8F5E9' },
  favAddText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  favAddDoneText: { color: '#3C8D40' },
  favImageEmpty: { backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  favImageEmptyText: { fontSize: 20 },
  addMealButtonText: {
    fontSize: 14,
    color: '#F2701E',
    fontWeight: '600',
  },
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
  shoppingListCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
  },
  shoppingListIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  shoppingListIconText: {
    fontSize: 24,
  },
  shoppingListContent: {
    flex: 1,
  },
  shoppingListTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  shoppingListSubtitle: {
    fontSize: 13,
    color: '#3C8D40',
    marginTop: 2,
  },
  shoppingListArrow: {
    fontSize: 20,
    color: '#3C8D40',
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
  modalLoading: {
    padding: 40,
    alignItems: 'center',
  },
});
