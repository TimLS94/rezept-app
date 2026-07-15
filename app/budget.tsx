import { useState } from 'react';
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
import { router } from 'expo-router';
import { RECIPES, Recipe, DietaryTag, DIETARY_TAGS, filterRecipesByDietary } from '../data/recipes';
import { addRecipesToShoppingList } from '../lib/shopping';

type MealPlan = {
  id: string;
  day: string;
  recipe: Recipe;
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Build a 7-day plan from the real recipe catalogue so every planned meal
// carries ingredients that can flow into the shopping list.
const buildPlan = (pool: Recipe[]): MealPlan[] =>
  pool.length === 0
    ? []
    : DAYS.map((day, i) => ({ id: String(i + 1), day, recipe: pool[i % pool.length] }));

const shuffled = (list: Recipe[]): Recipe[] =>
  [...list].sort(() => Math.random() - 0.5);

export default function BudgetScreen() {
  const [weeklyBudget] = useState(150);
  const [activeFilters, setActiveFilters] = useState<DietaryTag[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlan[]>(() => buildPlan(RECIPES));
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);

  const toggleFilter = (tag: DietaryTag) => {
    const next = activeFilters.includes(tag)
      ? activeFilters.filter(t => t !== tag)
      : [...activeFilters, tag];
    setActiveFilters(next);
    setMealPlan(buildPlan(shuffled(filterRecipesByDietary(next))));
  };

  const totalCost = mealPlan.reduce((sum, meal) => sum + meal.recipe.cost, 0);
  const remaining = weeklyBudget - totalCost;
  const avgPerMeal = totalCost / 7;
  const totalIngredients = mealPlan.reduce((sum, meal) => sum + meal.recipe.ingredients.length, 0);

  const regeneratePlan = () => {
    setGenerating(true);
    // Simulate API call, then reshuffle the week from the catalogue.
    setTimeout(() => {
      setMealPlan(buildPlan(shuffled(filterRecipesByDietary(activeFilters))));
      setGenerating(false);
    }, 1500);
  };

  const swapMeal = (id: string) => {
    setMealPlan(plan => {
      const used = plan.map(m => m.recipe.id);
      const options = RECIPES.filter(r => !used.includes(r.id));
      const pick = options.length
        ? options[Math.floor(Math.random() * options.length)]
        : null;
      if (!pick) return plan;
      return plan.map(m => (m.id === id ? { ...m, recipe: pick } : m));
    });
  };

  const addWeekToShoppingList = async () => {
    setAdding(true);
    const result = await addRecipesToShoppingList(mealPlan.map(m => ({ recipe: m.recipe })));
    setAdding(false);

    if ('error' in result) {
      Alert.alert('Please log in', 'You need to be logged in to build a shopping list.');
      return;
    }

    Alert.alert(
      'Added to Shopping List! 🛒',
      `${mealPlan.length} meals • ${result.added} new items` +
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Meal Planner</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Budget Overview */}
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
              <Text style={[styles.budgetStatValue, { color: remaining >= 0 ? '#4CAF50' : '#E53935' }]}>
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

        {/* Generate Button */}
        <TouchableOpacity
          style={styles.generateButton}
          onPress={regeneratePlan}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.generateButtonText}>🎲 Generate New Plan</Text>
          )}
        </TouchableOpacity>

        {/* Meal Plan */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This Week's Meals</Text>

          {mealPlan.length === 0 && (
            <Text style={styles.emptyPlanText}>
              No recipes match these filters. Try removing one.
            </Text>
          )}

          {mealPlan.map((meal) => (
            <TouchableOpacity
              key={meal.id}
              style={styles.mealCard}
              onPress={() => router.push(`/recipe/${meal.recipe.id}`)}
            >
              <Image source={{ uri: meal.recipe.image }} style={styles.mealImage} />
              <View style={styles.mealContent}>
                <Text style={styles.mealDay}>{meal.day}</Text>
                <Text style={styles.mealTitle} numberOfLines={2}>{meal.recipe.title}</Text>
                <View style={styles.mealMeta}>
                  <Text style={styles.mealMetaText}>⏱ {meal.recipe.prepTime + meal.recipe.cookTime}min</Text>
                  <Text style={styles.mealMetaText}>💰 ${meal.recipe.cost.toFixed(2)}</Text>
                  <Text style={styles.mealMetaText}>🔥 {meal.recipe.calories}cal</Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.swapButton}
                onPress={() => swapMeal(meal.id)}
              >
                <Text style={styles.swapButtonText}>↻</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
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
            <Text style={styles.shoppingListSubtitle}>{totalIngredients} items • Est. ${totalCost.toFixed(2)}</Text>
          </View>
          <Text style={styles.shoppingListArrow}>→</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 60,
  },
  backText: {
    fontSize: 16,
    color: '#FF6B35',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  budgetCard: {
    backgroundColor: '#FF6B35',
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
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
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
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
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
    color: '#FF6B35',
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
  mealMeta: {
    flexDirection: 'row',
  },
  mealMetaText: {
    fontSize: 12,
    color: '#888',
    marginRight: 12,
  },
  swapButton: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  swapButtonText: {
    fontSize: 20,
    color: '#888',
  },
  addWeekButton: {
    backgroundColor: '#FF6B35',
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
    color: '#4CAF50',
    marginTop: 2,
  },
  shoppingListArrow: {
    fontSize: 20,
    color: '#4CAF50',
  },
  bottomSpacer: {
    height: 40,
  },
});
