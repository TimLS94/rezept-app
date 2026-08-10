import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Image,
  Share,
  Linking,
  Platform,
  ActionSheetIOS,
} from 'react-native';
import { router } from 'expo-router';
import { supabase, getCurrentUser } from '../../lib/supabase';
import { buildInstacartLink, openUrl } from '../../lib/instacart';
import { FEATURES } from '../../lib/features';
import * as Clipboard from 'expo-clipboard';
import { getRecipeById, Recipe } from '../../data/recipes';
import { fetchDbRecipeById } from '../../lib/recipes';
import SwipeToDelete from '../../components/SwipeToDelete';

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
  { id: 'pantry', name: 'Pantry', icon: '🥫', color: '#E9EEF8' },
  { id: 'frozen', name: 'Frozen', icon: '🧊', color: '#E9EEF8' },
  { id: 'other', name: 'Other', icon: '📦', color: '#F5F5F5' },
];

export default function ShoppingScreen() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChecked, setShowChecked] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [viewMode, setViewMode] = useState<'category' | 'recipe'>('category');
  // Recipe view: collapsed by default; tapping a card expands only that one.
  const [expandedRecipes, setExpandedRecipes] = useState<Set<string>>(new Set());
  // Creator recipes live in the DB (uuid ids), not the local seed catalogue —
  // resolve them so their meal card shows the image/title.
  const [dbRecipes, setDbRecipes] = useState<Record<string, Recipe>>({});
  const [sendingToInstacart, setSendingToInstacart] = useState(false);

  useEffect(() => {
    const ids = [...new Set(items.map(i => i.recipe_id).filter((x): x is string => !!x))];
    const missing = ids.filter(id => !getRecipeById(id) && !dbRecipes[id]);
    if (missing.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        missing.map(async id => [id, await fetchDbRecipeById(id).catch(() => undefined)] as const)
      );
      setDbRecipes(prev => {
        const next = { ...prev };
        for (const [id, r] of entries) if (r) next[id] = r;
        return next;
      });
    })();
  }, [items]);

  const resolveRecipe = (id?: string) => (id ? getRecipeById(id) || dbRecipes[id] : undefined);

  const toggleRecipe = (key: string) => {
    setExpandedRecipes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    const user = await getCurrentUser();
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
    
    const user = await getCurrentUser();
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

  // Delete a single ingredient.
  const deleteItem = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    await supabase.from('shopping_items').delete().eq('id', id);
  };

  // Delete every ingredient that belongs to one recipe/group.
  const deleteRecipeGroup = (groupItems: ShoppingItem[], name: string) => {
    const ids = groupItems.map(i => i.id);
    if (ids.length === 0) return;
    Alert.alert('Remove recipe', `Remove all ${ids.length} ingredients from “${name}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setItems(prev => prev.filter(i => !ids.includes(i.id)));
          await supabase.from('shopping_items').delete().in('id', ids);
        },
      },
    ]);
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
            const user = await getCurrentUser();
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

  // Generate shopping list text for sharing
  // Grouped by recipe, because a bare list of twenty ingredients doesn't tell
  // whoever you sent it to what any of it is for. Items added by hand have no
  // recipe and go in their own block at the end.
  const generateListText = (): string => {
    const unchecked = items.filter(i => !i.checked);
    const groups = new Map<string, typeof unchecked>();
    for (const i of unchecked) {
      const key = i.recipe_name || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(i);
    }

    const named = [...groups.entries()].filter(([k]) => k);
    const loose = groups.get('') ?? [];
    const line = (i: typeof unchecked[number]) => `• ${formatAmount(i.amount, i.unit)} ${i.name}`;

    const blocks: string[] = [];
    for (const [recipe, group] of named) {
      blocks.push(`${recipe}\n${group.map(line).join('\n')}`);
    }
    if (loose.length) {
      blocks.push(`${named.length ? 'Other\n' : ''}${loose.map(line).join('\n')}`);
    }
    return blocks.join('\n\n');
  };

  // Export options
  const showExportOptions = () => {
    // Building the Instacart page is a network round trip with no visible
    // progress once the sheet has closed; a second tap would fire it twice.
    if (sendingToInstacart) return;

    const uncheckedItems = items.filter(i => !i.checked);
    if (uncheckedItems.length === 0) {
      Alert.alert('Empty List', 'Add some items first');
      return;
    }

    // Retailer hand-off is labelled rather than hidden: it's on the roadmap and
    // worth signalling, but tapping it must not open a search that finds
    // nothing. Sharing and copying work today and stay first.
    const soon = FEATURES.partnerCheckout ? '' : ' (coming soon)';
    const retailer = (name: string, action: () => void) => () => {
      if (FEATURES.partnerCheckout) { action(); return; }
      Alert.alert(
        `${name} — coming soon`,
        `Sending your list straight to ${name} needs their approval, which we're working on. Until then, share the list or copy it — both include the amounts.`,
        [
          { text: 'OK', style: 'cancel' },
          { text: 'Share list', onPress: shareList },
        ],
      );
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            'Cancel',
            '📤 Share List',
            '📋 Copy to Clipboard',
            `🛒 Open in Instacart${soon}`,
            `🏪 Open in Walmart${soon}`,
          ],
          cancelButtonIndex: 0,
          disabledButtonIndices: FEATURES.partnerCheckout ? [] : [3, 4],
        },
        (buttonIndex) => {
          if (buttonIndex === 1) shareList();
          else if (buttonIndex === 2) copyToClipboard();
          else if (buttonIndex === 3) retailer('Instacart', openInInstacart)();
          else if (buttonIndex === 4) retailer('Walmart', openInWalmart)();
        }
      );
    } else {
      Alert.alert('Export Shopping List', 'Choose where to send your list', [
        { text: 'Cancel', style: 'cancel' },
        { text: '📤 Share', onPress: shareList },
        { text: '📋 Copy', onPress: copyToClipboard },
        { text: `🛒 Instacart${soon}`, onPress: retailer('Instacart', openInInstacart) },
        { text: `🏪 Walmart${soon}`, onPress: retailer('Walmart', openInWalmart) },
      ]);
    }
  };

  const openInInstacart = async () => {
    const unchecked = items.filter(i => !i.checked);
    if (!unchecked.length) {
      Alert.alert('Nothing to send', 'Everything on your list is already ticked off.');
      return;
    }

    setSendingToInstacart(true);
    const result = await buildInstacartLink(
      unchecked.map(i => ({ name: i.name, amount: i.amount, unit: i.unit })),
      'FeedFamily shopping list',
    );
    setSendingToInstacart(false);

    if (result.kind === 'error') {
      Alert.alert('Could not open Instacart', 'Please try again.');
      return;
    }

    if (result.kind === 'search') {
      // Be honest that this is the degraded path rather than pretending the
      // list was transferred — Instacart will just show a search result.
      Alert.alert(
        'Opening Instacart search',
        "Your list will be searched rather than filled into a cart — that needs the Instacart integration to be set up. Continue?",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open', onPress: () => openUrl(result.url) },
        ],
      );
      return;
    }

    await openUrl(result.url);
  };

  const openInWalmart = async () => {
    const uncheckedItems = items.filter(i => !i.checked);
    const searchQuery = uncheckedItems.map(i => i.name).join(' ');
    const walmartUrl = `https://www.walmart.com/search?q=${encodeURIComponent(searchQuery)}`;
    await Linking.openURL(walmartUrl);
  };

  const shareList = async () => {
    const listText = generateListText();
    try {
      await Share.share({
        message: `🛒 Shopping List\n\n${listText}\n\nShared from FeedFamily`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const copyToClipboard = async () => {
    // Previously this only showed the list in an alert — the menu said "Copy to
    // Clipboard" and nothing ever reached the clipboard. RN dropped the core
    // Clipboard module, hence expo-clipboard.
    await Clipboard.setStringAsync(generateListText());
    Alert.alert('Copied', 'Your shopping list is on the clipboard.');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={showExportOptions} style={styles.exportButton}>
          <Text style={styles.exportText}>📤 Export</Text>
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
                <SwipeToDelete key={item.id} onDelete={() => deleteItem(item.id)} style={styles.swipeRow}>
                  <TouchableOpacity
                    style={[styles.itemRow, item.checked && styles.itemRowChecked]}
                    onPress={() => toggleItem(item.id)}
                    // No press fade. The swipe handler can steal the responder
                    // mid-press, and then TouchableOpacity never gets its
                    // onPressOut — the row stays at 0.2 opacity and reads as a
                    // stuck grey highlight. The checkbox is the feedback.
                    activeOpacity={1}
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
                </SwipeToDelete>
              ))}
            </View>
          ))
        ) : (
          // Recipe View
          groupedByRecipe.map((group, index) => {
            const recipe = resolveRecipe(group.recipe_id);
            const doneCount = group.items.filter(i => i.checked).length;
            const key = group.name;
            const isExpanded = expandedRecipes.has(key);
            return (
            <View key={index} style={styles.recipeSection}>
              {/* One surface, one meaning. The card used to be an expander
                  containing three more tap targets — "open recipe", "delete
                  everything" and a chevron — with overlapping hitSlops, so a
                  thumb aimed at the recipe could wipe the whole group instead.
                  Now: the card opens the recipe, the chevron expands, and
                  removing lives inside the group where it can't be hit by
                  accident. */}
              {recipe ? (
                <SwipeToDelete
                  label={`Remove\n${group.items.length} items`}
                  onDelete={() => deleteRecipeGroup(group.items, recipe.title)}
                  style={styles.swipeCard}
                >
                <TouchableOpacity
                  style={styles.mealHeaderCard}
                  activeOpacity={1}
                  onPress={() => toggleRecipe(key)}
                >
                  <Image source={{ uri: recipe.image }} style={styles.mealHeaderImage} />
                  <View style={styles.mealHeaderInfo}>
                    <Text style={styles.mealHeaderTitle} numberOfLines={1}>{recipe.title}</Text>
                    <Text style={styles.mealHeaderMeta}>
                      {doneCount} of {group.items.length} picked up
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{isExpanded ? '▾' : '▸'}</Text>
                </TouchableOpacity>
                </SwipeToDelete>
              ) : (
                <TouchableOpacity style={styles.recipeHeader} activeOpacity={0.85} onPress={() => toggleRecipe(key)}>
                  <Text style={styles.recipeName}>{group.name}</Text>
                  <View style={styles.recipeHeaderRight}>
                    <Text style={styles.recipeCount}>
                      {group.items.filter(i => !i.checked).length} left
                    </Text>
                    <Text style={styles.chevron}>{isExpanded ? '▾' : '▸'}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {isExpanded && group.items.map((item) => (
                <SwipeToDelete key={item.id} onDelete={() => deleteItem(item.id)} style={styles.swipeRow}>
                  <TouchableOpacity
                    style={[styles.itemRow, item.checked && styles.itemRowChecked]}
                    onPress={() => toggleItem(item.id)}
                    // No press fade. The swipe handler can steal the responder
                    // mid-press, and then TouchableOpacity never gets its
                    // onPressOut — the row stays at 0.2 opacity and reads as a
                    // stuck grey highlight. The checkbox is the feedback.
                    activeOpacity={1}
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
                </SwipeToDelete>
              ))}

              {/* No visible delete: swiping left is the only way, which is how
                  Mail, Reminders and Notes have worked for years. "View recipe"
                  stays — the card now expands instead of navigating, so this is
                  the only route to the recipe itself. */}
              {isExpanded && recipe && (
                <View style={styles.groupActions}>
                  <TouchableOpacity onPress={() => router.push(`/recipe/${recipe.id}`)} style={styles.groupAction}>
                    <Text style={styles.groupActionText}>View recipe →</Text>
                  </TouchableOpacity>
                </View>
              )}
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
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  exportButton: { width: 70 },
  exportText: { fontSize: 14, color: '#F57C00', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },
  clearText: { fontSize: 14, color: '#888' },
  progressCard: { backgroundColor: '#FFF', marginHorizontal: 20, borderRadius: 16, padding: 16, marginBottom: 12 },
  progressInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressText: { fontSize: 16, color: '#1A1A1A' },
  progressNumber: { fontSize: 24, fontWeight: '700', color: '#F57C00' },
  progressSubtext: { fontSize: 14, color: '#888' },
  progressBarContainer: { height: 8, backgroundColor: '#F0F0F0', borderRadius: 4 },
  progressBar: { height: '100%', backgroundColor: '#3C8D40', borderRadius: 4 },
  viewToggle: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#F5F5F5', borderRadius: 12, padding: 4, marginBottom: 12 },
  viewToggleButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  viewToggleActive: { backgroundColor: '#FFF' },
  viewToggleText: { fontSize: 14, color: '#888', fontWeight: '500' },
  viewToggleTextActive: { color: '#1A1A1A', fontWeight: '600' },
  addItemContainer: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 16 },
  addItemInput: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 14, fontSize: 16, marginRight: 10 },
  addItemButton: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#F57C00', justifyContent: 'center', alignItems: 'center' },
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
  mealHeaderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 10, borderLeftWidth: 4, borderLeftColor: '#F57C00' },
  mealHeaderImage: { width: 52, height: 52, borderRadius: 10, marginRight: 12 },
  mealHeaderInfo: { flex: 1 },
  mealHeaderTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginTop: 1 },
  mealHeaderMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  swipeCard: { borderRadius: 12, marginBottom: 8 },
  swipeRow: { borderRadius: 10, marginBottom: 6 },
  groupActions: { flexDirection: 'row', gap: 18, paddingVertical: 10, paddingHorizontal: 4, marginBottom: 4 },
  groupAction: { paddingVertical: 2 },
  groupActionText: { fontSize: 12.5, color: '#0D2B63', fontWeight: '600' },
  chevron: { fontSize: 14, color: '#B8AFA2', marginLeft: 10, width: 14, textAlign: 'center' },
  recipeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: '#F57C00', marginBottom: 8 },
  recipeHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  recipeName: { fontSize: 16, fontWeight: '700', color: '#F57C00' },
  recipeCount: { fontSize: 13, color: '#888' },
  groupDelete: { fontSize: 16, marginLeft: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 14, borderRadius: 10 },
  itemRowChecked: { backgroundColor: '#F5F5F5' },
  checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#DDD', marginRight: 14, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#3C8D40', borderColor: '#3C8D40' },
  checkmark: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, color: '#1A1A1A' },
  itemNameChecked: { color: '#999', textDecorationLine: 'line-through' },
  itemRecipe: { fontSize: 12, color: '#F57C00', marginTop: 2 },
  toggleChecked: { alignItems: 'center', padding: 16 },
  toggleCheckedText: { fontSize: 14, color: '#888' },
  clearAllButton: { alignItems: 'center', padding: 16, marginHorizontal: 20, marginTop: 8 },
  clearAllText: { fontSize: 14, color: '#E53935' },
  bottomSpacer: { height: 40 },
});
