// The four things you do with a saved recipe: cook it, plan it, shop for it,
// get rid of it.
//
// Favourites had all four on every card. The cookbook had two, and a different
// idea of what a card is for, so the same recipe offered different actions
// depending on which screen you found it on. This is that row, once, so both
// screens genuinely behave the same.
import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Recipe } from '../data/recipes';
import { CookableSource } from '../lib/cookable';
import { useMealPlan, thisWeekKey } from '../lib/mealPlan';
import { addRecipesToShoppingList } from '../lib/shopping';
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
  const [inCart, setInCart] = useState(false);

  const weekKeyStr = thisWeekKey();
  const inPlan = (plansByWeek[weekKeyStr] ?? []).some(m => m.recipe.id === recipe.id);

  const toggleWeek = () => {
    if (inPlan) updateWeekPlan(weekKeyStr, plan => plan.filter(m => m.recipe.id !== recipe.id));
    else addRecipeToWeek(weekKeyStr, recipe);
  };

  const addToCart = async () => {
    // A note has no ingredients, so there is nothing to put on a list.
    if (recipe.ingredients.length === 0) {
      Alert.alert('Nothing to shop for', 'This one has no ingredients yet. Add some by editing it.');
      return;
    }
    const result = await addRecipesToShoppingList([{ recipe, servings }]);
    if ('error' in result) {
      Alert.alert('Sign in required', 'Sign in to save your shopping list.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/login') },
      ]);
      return;
    }
    setInCart(true);
  };

  return (
    <View style={styles.actions}>
      {/* Always offered, even with no steps: cook mode shows a note as a big
          readable card, which is exactly what you want it for while cooking. */}
      <TouchableOpacity
        style={styles.actCook}
        onPress={() => router.push(`/cook/${recipe.id}?source=${source}&servings=${servings}`)}
      >
        <Ionicons name="restaurant" size={17} color="#FFF" />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.act, inPlan && styles.actDone]} onPress={toggleWeek}>
        <Ionicons
          name={inPlan ? 'checkmark' : 'calendar-outline'}
          size={17}
          color={inPlan ? COLORS.green : COLORS.navy}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.act, inCart && styles.actDone]}
        onPress={addToCart}
        disabled={inCart}
      >
        <Ionicons
          name={inCart ? 'checkmark' : 'cart-outline'}
          size={17}
          color={inCart ? COLORS.green : COLORS.navy}
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
  actions: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, gap: 8 },
  act: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F4F1EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actCook: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.orange,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actDone: { backgroundColor: '#E8F5E9' },
});
