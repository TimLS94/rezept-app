// The four things you do with a saved recipe: cook it, plan it, shop for it,
// get rid of it.
//
// Favourites had all four on every card. The cookbook had two, and a different
// idea of what a card is for, so the same recipe offered different actions
// depending on which screen you found it on. This is that row, once, so both
// screens genuinely behave the same.
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Recipe } from '../data/recipes';
import { CookableSource } from '../lib/cookable';
import { useMealPlan, thisWeekKey } from '../lib/mealPlan';
import { addRecipesToShoppingList, describeAdd } from '../lib/shopping';
import { COLORS } from '../lib/theme';

type Props = {
  recipe: Recipe;
  /** Tells cook mode which table to look in first. */
  source: CookableSource;
  /** Portion count to cook with — carries the card's stepper into cook mode. */
  servings: number;
  /** Omitted for purchases: removing one would throw away something paid for. */
  onRemove?: () => void;
  removeIcon?: React.ComponentProps<typeof Ionicons>['name'];
};

export default function RecipeActions({
  recipe,
  source,
  servings,
  onRemove,
  removeIcon = 'trash-outline',
}: Props) {
  const { addRecipeToWeek, plansByWeek, updateWeekPlan } = useMealPlan();
  // A short confirmation, not a permanent state. It used to latch: once
  // pressed, the button showed a tick and stayed disabled forever — including
  // after the items were deleted from the list again, which left no way to add
  // them back. The shopping list is the source of truth for what is on it;
  // this button only reports that the tap did something.
  const [justAdded, setJustAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  const weekKeyStr = thisWeekKey();
  const inPlan = (plansByWeek[weekKeyStr] ?? []).some(m => m.recipe.id === recipe.id);

  const toggleWeek = () => {
    if (inPlan) updateWeekPlan(weekKeyStr, plan => plan.filter(m => m.recipe.id !== recipe.id));
    else addRecipeToWeek(weekKeyStr, recipe);
  };

  const addToCart = async () => {
    if (busy) return;
    // A note has no ingredients, so there is nothing to put on a list.
    if (recipe.ingredients.length === 0) {
      Alert.alert('Nothing to shop for', 'This one has no ingredients yet. Add some by editing it.');
      return;
    }
    setBusy(true);
    const result = await addRecipesToShoppingList([{ recipe, servings }]);
    setBusy(false);

    if ('error' in result) {
      if (result.error === 'not-authenticated') {
        Alert.alert('Sign in required', 'Sign in to save your shopping list.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign in', onPress: () => router.push('/login') },
        ]);
        return;
      }
      // Anything else is a real fault and used to be reported as a sign-in
      // problem, which sent people to a login screen they were already past.
      Alert.alert('Could not add to the list', result.error);
      return;
    }

    Alert.alert('Added 🛒', describeAdd(result.added, result.merged, recipe.title, result), [
      { text: 'OK', style: 'cancel' },
      { text: 'View list', onPress: () => router.push('/shopping') },
    ]);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2500);
  };

  return (
    <View style={styles.bar}>
      {/* Cook is the one you came for, so it is the only one that says its
          name. Always offered, even with no steps: cook mode shows a note as a
          big readable card, which is exactly what it's wanted for. */}
      <TouchableOpacity
        style={styles.cook}
        onPress={() => router.push(`/cook/${recipe.id}?source=${source}&servings=${servings}`)}
        activeOpacity={0.85}
      >
        <Ionicons name="restaurant" size={16} color="#FFF" />
        <Text style={styles.cookText}>Cook</Text>
      </TouchableOpacity>

      <View style={styles.spacer} />

      <TouchableOpacity style={[styles.act, inPlan && styles.actDone]} onPress={toggleWeek}>
        <Ionicons
          name={inPlan ? 'checkmark' : 'calendar-outline'}
          size={17}
          color={inPlan ? COLORS.green : COLORS.navy}
        />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.act, justAdded && styles.actDone]} onPress={addToCart}>
        <Ionicons
          name={justAdded ? 'checkmark' : 'cart-outline'}
          size={17}
          color={justAdded ? COLORS.green : COLORS.navy}
        />
      </TouchableOpacity>

      {onRemove && (
        <TouchableOpacity style={styles.act} onPress={onRemove}>
          <Ionicons name={removeIcon} size={17} color={COLORS.warmGray} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // A footer strip, not a column. Four stacked 36pt circles forced every card
  // to be at least ~170pt tall, which left a field of empty white under a
  // two-line title and pushed the cook button out over the card's corner.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2EDE5',
  },
  spacer: { flex: 1 },
  cook: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.orange,
  },
  cookText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  act: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F4F1EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actDone: { backgroundColor: '#E8F5E9' },
});
