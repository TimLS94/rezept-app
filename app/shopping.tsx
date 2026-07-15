import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Image
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getRecipeById } from '../data/recipes';

type ShoppingItem = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  category: string;
  checked: boolean;
  recipe_id?: string;
  recipe_name?: string;
};

const CATEGORIES = [
  { id: 'produce', name: 'Produce', icon: '🥬', color: '#E8F5E9' },
  { id: 'meat', name: 'Meat & Fish', icon: '🥩', color: '#FFEBEE' },
  { id: 'dairy', name: 'Dairy', icon: '🧀', color: '#FFF8E1' },
  { id: 'bakery', name: 'Bakery', icon: '🍞', color: '#FBE9E7' },
  { id: 'pantry', name: 'Pantry', icon: '🥫', color: '#F3E5F5' },
  { id: 'frozen', name: 'Frozen', icon: '🧊', color: '#E3F2FD' },
  { id: 'other', name: 'Other', icon: '📦', color: '#F5F5F5' },
];

export default function ShoppingScreen() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChecked, setShowChecked] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [viewMode, setViewMode] = useState<'category' | 'recipe'>('category');

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (data) {
      setItems(data);
    }
    setLoading(false);
  };

  const toggleItem = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    await supabase
      .from('shopping_items')
      .update({ checked: !item.checked })
      .eq('id', id);

    setItems(items.map(i => 
      i.id === id ? { ...i, checked: !i.checked } : i
    ));
  };

  const addItem = async () => {
    if (!newItemName.trim()) return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('shopping_items')
      .insert({
        user_id: user.id,
        name: newItemName.trim(),
        amount: 1,
        unit: '',
        category: 'other',
        checked: false,
      })
      .select()
      .single();

    if (data) {
      setItems([...items, data]);
    }
    setNewItemName('');
  };

  const clearChecked = async () => {
    const checkedIds = items.filter(i => i.checked).map(i => i.id);
    if (checkedIds.length === 0) return;

    Alert.alert(
      'Clear Checked Items',
      `Remove ${checkedIds.length} checked items?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: async () => {
            await supabase
              .from('shopping_items')
              .delete()
              .in('id', checkedIds);
            setItems(items.filter(i => !i.checked));
          }
        }
      ]
    );
  };

  const clearAll = async () => {
    Alert.alert(
      'Clear All Items',
      'Remove all items from shopping list?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive',
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await supabase
              .from('shopping_items')
              .delete()
              .eq('user_id', user.id);
            setItems([]);
          }
        }
      ]
    );
  };

  const uncheckedCount = items.filter(i => !i.checked).length;
  const checkedCount = items.filter(i => i.checked).length;

  // Group by category
  const groupedByCategory = CATEGORIES.map(cat => ({
    ...cat,
    items: items.filter(item => item.category === cat.id && (showChecked || !item.checked))
  })).filter(cat => cat.items.length > 0);

  // Group by recipe (the meal), keeping the recipe_id so we can show the meal card
  const recipeNames = [...new Set(items.filter(i => i.recipe_name).map(i => i.recipe_name))];
  const groupedByRecipe: { name: string; recipe_id?: string; items: ShoppingItem[] }[] =
    recipeNames.map(recipeName => {
      const recipeItems = items.filter(i => i.recipe_name === recipeName);
      return {
        name: recipeName || 'Other',
        recipe_id: recipeItems.find(i => i.recipe_id)?.recipe_id,
        items: recipeItems.filter(i => showChecked || !i.checked),
      };
    }).filter(g => g.items.length > 0);

  // Items without recipe
  const otherItems = items.filter(i => !i.recipe_name && (showChecked || !i.checked));
  if (otherItems.length > 0) {
    groupedByRecipe.push({ name: 'Other Items', recipe_id: undefined, items: otherItems });
  }

  const formatAmount = (amount: number, unit: string): string => {
    if (!amount) return '';
    const formatted = amount % 1 === 0 ? amount.toString() : amount.toFixed(1);
    return unit ? `${formatted} ${unit}` : formatted;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shopping List</Text>
        <TouchableOpacity onPress={clearChecked}>
          <Text style={styles.clearText}>Clear ✓</Text>
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View style={styles.progressCard}>
        <View style={styles.progressInfo}>
          <Text style={styles.progressText}>
            <Text style={styles.progressNumber}>{uncheckedCount}</Text> items left
          </Text>
          <Text style={styles.progressSubtext}>
            {checkedCount} checked off
          </Text>
        </View>
        <View style={styles.progressBarContainer}>
          <View 
            style={[
              styles.progressBar, 
              { width: `${items.length > 0 ? (checkedCount / items.length) * 100 : 0}%` }
            ]} 
          />
        </View>
      </View>

      {/* View Toggle */}
      <View style={styles.viewToggle}>
        <TouchableOpacity 
          style={[styles.viewToggleButton, viewMode === 'category' && styles.viewToggleActive]}
          onPress={() => setViewMode('category')}
        >
          <Text style={[styles.viewToggleText, viewMode === 'category' && styles.viewToggleTextActive]}>
            By Category
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.viewToggleButton, viewMode === 'recipe' && styles.viewToggleActive]}
          onPress={() => setViewMode('recipe')}
        >
          <Text style={[styles.viewToggleText, viewMode === 'recipe' && styles.viewToggleTextActive]}>
            By Recipe
          </Text>
        </TouchableOpacity>
      </View>

      {/* Add Item */}
      <View style={styles.addItemContainer}>
        <TextInput
          style={styles.addItemInput}
          placeholder="Add item..."
          placeholderTextColor="#999"
          value={newItemName}
          onChangeText={setNewItemName}
          onSubmitEditing={addItem}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addItemButton} onPress={addItem}>
          <Text style={styles.addItemButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🛒</Text>
            <Text style={styles.emptyText}>Your shopping list is empty</Text>
            <Text style={styles.emptySubtext}>Add items from recipes or manually above</Text>
          </View>
        ) : viewMode === 'category' ? (
          // Category View
          groupedByCategory.map((category) => (
            <View key={category.id} style={styles.categorySection}>
              <View style={[styles.categoryHeader, { backgroundColor: category.color }]}>
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                <Text style={styles.categoryName}>{category.name}</Text>
                <Text style={styles.categoryCount}>
                  {category.items.filter(i => !i.checked).length}
                </Text>
              </View>
              
              {category.items.map((item) => (
                <TouchableOpacity 
                  key={item.id} 
                  style={[styles.itemRow, item.checked && styles.itemRowChecked]}
                  onPress={() => toggleItem(item.id)}
                >
                  <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                    {item.checked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                      {formatAmount(item.amount, item.unit)} {item.name}
                    </Text>
                    {item.recipe_name && (
                      <Text style={styles.itemRecipe}>for {item.recipe_name}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        ) : (
          // Recipe View
          groupedByRecipe.map((group, index) => {
            const recipe = group.recipe_id ? getRecipeById(group.recipe_id) : undefined;
            const doneCount = group.items.filter(i => i.checked).length;
            return (
            <View key={index} style={styles.recipeSection}>
              {recipe ? (
                <TouchableOpacity
                  style={styles.mealHeaderCard}
                  onPress={() => router.push(`/recipe/${recipe.id}`)}
                >
                  <Image source={{ uri: recipe.image }} style={styles.mealHeaderImage} />
                  <View style={styles.mealHeaderInfo}>
                    <Text style={styles.mealHeaderLabel}>MEAL</Text>
                    <Text style={styles.mealHeaderTitle} numberOfLines={1}>{recipe.title}</Text>
                    <Text style={styles.mealHeaderMeta}>
                      ⏱ {recipe.prepTime + recipe.cookTime} min • {doneCount}/{group.items.length} items
                    </Text>
                  </View>
                  <Text style={styles.mealHeaderArrow}>→</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.recipeHeader}>
                  <Text style={styles.recipeName}>{group.name}</Text>
                  <Text style={styles.recipeCount}>
                    {group.items.filter(i => !i.checked).length} items
                  </Text>
                </View>
              )}

              {group.items.map((item) => (
                <TouchableOpacity 
                  key={item.id} 
                  style={[styles.itemRow, item.checked && styles.itemRowChecked]}
                  onPress={() => toggleItem(item.id)}
                >
                  <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                    {item.checked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, item.checked && styles.itemNameChecked]}>
                      {formatAmount(item.amount, item.unit)} {item.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            );
          })
        )}

        {/* Toggle Show Checked */}
        {checkedCount > 0 && (
          <TouchableOpacity 
            style={styles.toggleChecked}
            onPress={() => setShowChecked(!showChecked)}
          >
            <Text style={styles.toggleCheckedText}>
              {showChecked ? 'Hide' : 'Show'} checked items ({checkedCount})
            </Text>
          </TouchableOpacity>
        )}

        {/* Clear All */}
        {items.length > 0 && (
          <TouchableOpacity style={styles.clearAllButton} onPress={clearAll}>
            <Text style={styles.clearAllText}>Clear All Items</Text>
          </TouchableOpacity>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  backButton: { width: 70 },
  backText: { fontSize: 16, color: '#FF6B35', fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  clearText: { fontSize: 14, color: '#888' },
  progressCard: { backgroundColor: '#FFF', marginHorizontal: 20, borderRadius: 16, padding: 16, marginBottom: 12 },
  progressInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressText: { fontSize: 16, color: '#1A1A1A' },
  progressNumber: { fontSize: 24, fontWeight: '700', color: '#FF6B35' },
  progressSubtext: { fontSize: 14, color: '#888' },
  progressBarContainer: { height: 8, backgroundColor: '#F0F0F0', borderRadius: 4 },
  progressBar: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 4 },
  viewToggle: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#F5F5F5', borderRadius: 12, padding: 4, marginBottom: 12 },
  viewToggleButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  viewToggleActive: { backgroundColor: '#FFF' },
  viewToggleText: { fontSize: 14, color: '#888', fontWeight: '500' },
  viewToggleTextActive: { color: '#1A1A1A', fontWeight: '600' },
  addItemContainer: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 16 },
  addItemInput: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 14, fontSize: 16, marginRight: 10 },
  addItemButton: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#FF6B35', justifyContent: 'center', alignItems: 'center' },
  addItemButtonText: { fontSize: 24, color: '#FFF', fontWeight: '600' },
  emptyState: { alignItems: 'center', padding: 60 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#1A1A1A' },
  emptySubtext: { fontSize: 14, color: '#888', marginTop: 4 },
  categorySection: { marginHorizontal: 20, marginBottom: 16 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8 },
  categoryIcon: { fontSize: 20, marginRight: 10 },
  categoryName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  categoryCount: { fontSize: 14, fontWeight: '600', color: '#888', backgroundColor: '#FFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  recipeSection: { marginHorizontal: 20, marginBottom: 16 },
  mealHeaderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 10, marginBottom: 8, borderLeftWidth: 4, borderLeftColor: '#FF6B35' },
  mealHeaderImage: { width: 52, height: 52, borderRadius: 10, marginRight: 12 },
  mealHeaderInfo: { flex: 1 },
  mealHeaderLabel: { fontSize: 10, fontWeight: '700', color: '#FF6B35', letterSpacing: 1 },
  mealHeaderTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginTop: 1 },
  mealHeaderMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  mealHeaderArrow: { fontSize: 18, color: '#CCC', marginLeft: 8 },
  recipeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: '#FF6B35', marginBottom: 8 },
  recipeName: { fontSize: 16, fontWeight: '700', color: '#FF6B35' },
  recipeCount: { fontSize: 13, color: '#888' },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 14, borderRadius: 10, marginBottom: 6 },
  itemRowChecked: { backgroundColor: '#F5F5F5' },
  checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#DDD', marginRight: 14, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  checkmark: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, color: '#1A1A1A' },
  itemNameChecked: { color: '#999', textDecorationLine: 'line-through' },
  itemRecipe: { fontSize: 12, color: '#FF6B35', marginTop: 2 },
  toggleChecked: { alignItems: 'center', padding: 16 },
  toggleCheckedText: { fontSize: 14, color: '#888' },
  clearAllButton: { alignItems: 'center', padding: 16, marginHorizontal: 20, marginTop: 8 },
  clearAllText: { fontSize: 14, color: '#E53935' },
  bottomSpacer: { height: 40 },
});
