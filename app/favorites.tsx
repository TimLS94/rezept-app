// Inspiration — the pile of things you swiped right on.
//
// This used to be "Favorites" and tried to be a second cookbook: collections,
// a portion stepper, add-to-week, add-to-cart, both per recipe and for the
// whole list. That made it compete with the cookbook, and the cookbook is what
// the app is actually built around.
//
// So it does two things now. You can cook something straight from here, and
// you can move it into your cookbook. Nothing else — the way in is swiping in
// Discover, and the way on is the cookbook.
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '../lib/theme';
import { useFavorites } from '../lib/favorites';
import { saveRecipeToCookbook } from '../lib/recipes';
import { copyRecipeToCookbook } from '../lib/myRecipes';
import { Recipe } from '../data/recipes';
import { HEADER_TOP } from '../lib/layout';
import { goBackOr } from '../lib/nav';

export default function InspirationScreen() {
  const { favorites, removeFavorite } = useFavorites();
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const addToCookbook = async (recipe: Recipe) => {
    setSaving(recipe.id);
    // Creator recipes are kept as the creator's, under "From creators". Only
    // seed recipes, which have no creator behind them, are copied.
    const result = recipe.influencer?.id
      ? await saveRecipeToCookbook(recipe.id)
      : await copyRecipeToCookbook(recipe);
    setSaving(null);

    if ('error' in result) {
      Alert.alert('Could not add it', result.error);
      return;
    }
    setSaved(prev => new Set(prev).add(recipe.id));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/home')} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inspiration</Text>
        <View style={{ width: 60 }} />
      </View>

      {favorites.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✨</Text>
          <Text style={styles.emptyText}>Nothing saved yet</Text>
          <Text style={styles.emptySubtext}>
            Swipe right on anything in Discover and it lands here. When one is worth
            keeping, move it to your cookbook.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/discover')}>
            <Text style={styles.primaryButtonText}>Browse Discover</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            Swiped from Discover. Cook one now, or move it to your cookbook to plan and
            shop with it.
          </Text>

          {favorites.map(recipe => {
            const inCookbook = saved.has(recipe.id);
            return (
              <View key={recipe.id} style={styles.card}>
                <TouchableOpacity
                  style={styles.cardMain}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/recipe/${recipe.id}`)}
                >
                  <Image source={{ uri: recipe.image }} style={styles.cardImage} />
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{recipe.title}</Text>
                    <Text style={styles.cardMeta}>
                      {recipe.prepTime + recipe.cookTime} min · {recipe.influencer.handle}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.cook}
                    onPress={() =>
                      router.push(`/cook/${recipe.id}?source=creator&servings=${recipe.servings}`)
                    }
                    activeOpacity={0.85}
                  >
                    <Ionicons name="restaurant" size={16} color="#FFF" />
                    <Text style={styles.cookText}>Cook</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.add, inCookbook && styles.addDone]}
                    onPress={() => addToCookbook(recipe)}
                    disabled={inCookbook || saving === recipe.id}
                  >
                    {saving === recipe.id ? (
                      <ActivityIndicator size="small" color={COLORS.navy} />
                    ) : (
                      <Text style={[styles.addText, inCookbook && styles.addTextDone]}>
                        {inCookbook ? '✓ In cookbook' : '📚 To cookbook'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dismiss}
                    onPress={() => removeFavorite(recipe.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={18} color={COLORS.warmGray} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: HEADER_TOP,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: COLORS.orange, fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: COLORS.navy, letterSpacing: 0.3 },

  intro: { fontSize: 13, color: '#8A8A8A', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, lineHeight: 19 },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardMain: { flexDirection: 'row', alignItems: 'center' },
  cardImage: { width: 84, height: 84, borderRadius: 12, margin: 10 },
  cardContent: { flex: 1, paddingRight: 12, paddingVertical: 10, justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  cardMeta: { fontSize: 12, color: '#888', marginTop: 4 },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F2EDE5',
  },
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
  add: {
    flex: 1,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F4F1EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDone: { backgroundColor: '#E8F5E9' },
  addText: { fontSize: 13, fontWeight: '600', color: COLORS.navy },
  addTextDone: { color: COLORS.green },
  dismiss: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  emptySubtext: { fontSize: 14, color: '#888', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  primaryButton: {
    backgroundColor: COLORS.orange,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  primaryButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
