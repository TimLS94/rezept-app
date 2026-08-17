import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { RECIPES, getRecipesByCategory, Recipe } from '../../data/recipes';
import { supabase, getCurrentUser } from '../../lib/supabase';
import { useAuth, canImportToCookbook } from '../../lib/auth';
import { fetchRecipeOfTheWeek } from '../../lib/recipes';
import { COLORS, FONTS, RADIUS } from '../../lib/theme';
import { HEADER_TOP } from '../../lib/layout';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200';

const categories = [
  { id: 'quick', name: 'Quick', icon: '⚡' },
  { id: 'kids', name: 'Kid Approved', icon: '👶' },
  { id: 'healthy', name: 'Healthy', icon: '🥗' },
  { id: 'budget', name: 'Budget', icon: '💰' },
];

// Shared shortcut card — one consistent style with a navy icon badge.
function NavCard({ icon, title, subtitle, onPress }: { icon: IoniconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.navCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.navIcon}><Ionicons name={icon} size={22} color="#FFF" /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.navTitle}>{title}</Text>
        <Text style={styles.navSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.orange} />
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { user, role } = useAuth();
  const userId = user?.id;
  const [activeCategory, setActiveCategory] = useState<string>('kids');
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [weekRecipe, setWeekRecipe] = useState<Recipe>(RECIPES[0]);

  const filteredRecipes = getRecipesByCategory(activeCategory as any);

  // Both requests start together and neither blocks the render — the screen is
  // already on-screen with the previous values while they land. The signed-in
  // user comes from the auth context, so there's no lookup just to get an id.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchRecipeOfTheWeek().then(r => { if (active && r) setWeekRecipe(r); });
      if (userId) {
        supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', userId)
          .single()
          .then(({ data }) => { if (active && data?.avatar_url) setAvatar(data.avatar_url); });
      }
      return () => { active = false; };
      // Keyed on the id, not the user object: a token refresh hands back a new
      // object every time and would re-run this for nothing.
    }, [userId])
  );

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>SPOONDROP</Text>
            <Text style={styles.headerTitle}>What's for dinner?</Text>
            <View style={styles.brush} />
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push(user ? '/profile' : '/login')}>
            <Image source={{ uri: avatar }} style={styles.profileImage} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <TouchableOpacity style={styles.searchBar} onPress={() => router.push('/search')}>
          <Ionicons name="search" size={17} color={COLORS.warmGray} style={styles.searchIcon} />
          <Text style={styles.searchPlaceholder}>Search recipes, creators…</Text>
        </TouchableOpacity>

        {/* Recipe of the week — hero */}
        <View style={styles.section}>
          <Text style={styles.kickerOrange}>RECIPE OF THE WEEK</Text>
          <TouchableOpacity style={styles.heroCard} activeOpacity={0.9} onPress={() => router.push(`/recipe/${weekRecipe.id}`)}>
            <Image source={{ uri: weekRecipe.image }} style={styles.heroImage} contentFit="cover" />
            <View style={styles.heroOverlay} />
            <View style={styles.heroBadge}>
              <Ionicons name="heart" size={12} color="#FFF" />
              <Text style={styles.heroBadgeText}>Most loved this week</Text>
            </View>
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle} numberOfLines={2}>{weekRecipe.title}</Text>
              <View style={styles.heroMeta}>
                <View style={styles.metaItem}><Ionicons name="time-outline" size={14} color="#FFF" /><Text style={styles.heroMetaText}>{weekRecipe.prepTime + weekRecipe.cookTime} min</Text></View>
                <View style={styles.metaItem}><Ionicons name="people-outline" size={14} color="#FFF" /><Text style={styles.heroMetaText}>{weekRecipe.servings}</Text></View>
                <View style={styles.metaItem}><Ionicons name="stats-chart-outline" size={14} color="#FFF" /><Text style={styles.heroMetaText}>{weekRecipe.difficulty}</Text></View>
              </View>
              <View style={styles.heroFooter}>
                <View style={styles.influencerInfo}>
                  <Image source={{ uri: weekRecipe.influencer.avatar }} style={styles.influencerAvatar} />
                  <Text style={styles.influencerName}>{weekRecipe.influencer.handle}</Text>
                </View>
                <TouchableOpacity style={styles.cookButton} onPress={() => router.push(`/cook/${weekRecipe.id}`)}>
                  <Text style={styles.cookButtonText}>LET'S COOK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Shortcuts */}
        <View style={styles.navGroup}>
          <NavCard icon="flame" title="Discover" subtitle="Swipe to save your favorites" onPress={() => router.push('/discover')} />
          <NavCard icon="scan" title="Fridge Scan" subtitle="Snap your fridge • Cook without shopping" onPress={() => router.push('/fridge')} />
          <NavCard icon="sparkles" title="Inspiration" subtitle="What you swiped — cook it or keep it" onPress={() => router.push('/favorites')} />
          {canImportToCookbook(role) && (
            <NavCard icon="book" title="My Cookbook" subtitle="Your own & imported recipes" onPress={() => router.push('/cookbook')} />
          )}
          <NavCard icon="calendar" title="Meal Planner" subtitle="Plan your week • Build your list" onPress={() => router.push('/budget')} />
        </View>

        {/* Categories */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesContainer}>
          {categories.map(cat => {
            const active = activeCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setActiveCategory(cat.id)}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{cat.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Popular list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {activeCategory === 'all' ? 'ALL RECIPES' : `${activeCategory.toUpperCase()} RECIPES`}
          </Text>
          {filteredRecipes.map(recipe => (
            <TouchableOpacity key={recipe.id} style={styles.recipeCard} onPress={() => router.push(`/recipe/${recipe.id}`)} activeOpacity={0.85}>
              <Image source={{ uri: recipe.image }} style={styles.recipeImage} contentFit="cover" />
              <View style={styles.recipeContent}>
                <Text style={styles.recipeTitle} numberOfLines={2}>{recipe.title}</Text>
                <Text style={styles.recipeMeta}>{recipe.prepTime + recipe.cookTime} min • {recipe.calories} cal</Text>
                <View style={styles.recipeInfluencer}>
                  <Image source={{ uri: recipe.influencer.avatar }} style={styles.recipeInfluencerAvatar} />
                  <Text style={styles.recipeInfluencerName} numberOfLines={1}>
                    {recipe.influencer.handle}
                  </Text>
                  {recipe.kidApproved && <Text style={styles.kidTag}>👶 Kid approved</Text>}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: HEADER_TOP, paddingBottom: 16 },
  kicker: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.orange, letterSpacing: 1.5 },
  kickerOrange: { fontFamily: FONTS.semibold, fontSize: 12, color: COLORS.orange, letterSpacing: 1.5, marginBottom: 12 },
  headerTitle: { fontFamily: FONTS.display, fontSize: 36, color: COLORS.navy, marginTop: 2 },
  brush: { height: 5, width: 90, backgroundColor: COLORS.orange, borderRadius: 3, marginTop: 6 },
  profileButton: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', borderWidth: 2, borderColor: COLORS.orange, marginLeft: 12 },
  profileImage: { width: '100%', height: '100%' },

  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, marginHorizontal: 20, marginTop: 12, marginBottom: 24, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: COLORS.border },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchPlaceholder: { fontFamily: FONTS.body, fontSize: 15, color: COLORS.warmGray },

  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: { fontFamily: FONTS.display, fontSize: 22, color: COLORS.navy, marginBottom: 14, letterSpacing: 0.5 },

  heroCard: { borderRadius: RADIUS.lg, overflow: 'hidden', height: 320 },
  heroImage: { width: '100%', height: '100%' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.overlay },
  heroBadge: { position: 'absolute', top: 14, left: 14, backgroundColor: COLORS.navy, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 5 },
  heroBadgeText: { fontFamily: FONTS.semibold, color: '#FFF', fontSize: 12 },
  heroContent: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20 },
  heroTitle: { fontFamily: FONTS.display, fontSize: 30, color: '#FFF', marginBottom: 10, lineHeight: 38, paddingTop: 2 },
  heroMeta: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroMetaText: { fontFamily: FONTS.medium, fontSize: 13, color: 'rgba(255,255,255,0.92)' },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  influencerInfo: { flexDirection: 'row', alignItems: 'center' },
  influencerAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10, borderWidth: 2, borderColor: '#FFF' },
  influencerName: { fontFamily: FONTS.medium, fontSize: 13, color: '#FFF' },
  cookButton: { backgroundColor: COLORS.orange, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22 },
  cookButtonText: { fontFamily: FONTS.bold, color: '#FFF', fontSize: 13, letterSpacing: 0.5 },

  navGroup: { paddingHorizontal: 20, marginBottom: 20, gap: 10 },
  navCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  navIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.navy, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  navIconText: { fontSize: 20 },
  navTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.navy },
  navSubtitle: { fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.warmGray, marginTop: 1 },
  navArrow: { fontSize: 20, color: COLORS.orange, marginLeft: 8 },

  categoriesContainer: { paddingHorizontal: 20, paddingBottom: 24, gap: 10 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  categoryChipActive: { backgroundColor: COLORS.orange, borderColor: COLORS.orange },
  categoryIcon: { fontSize: 15, marginRight: 7 },
  categoryText: { fontFamily: FONTS.semibold, fontSize: 13.5, color: COLORS.navy },
  categoryTextActive: { color: '#FFF' },

  recipeCard: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: RADIUS.md, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  recipeImage: { width: 116, height: 116 },
  recipeContent: { flex: 1, padding: 14, justifyContent: 'center' },
  recipeTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: COLORS.navy, marginBottom: 6 },
  recipeMeta: { fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.warmGray },
  recipeInfluencer: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  recipeInfluencerAvatar: { width: 20, height: 20, borderRadius: 10, marginRight: 6 },
  recipeInfluencerName: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.orange, flexShrink: 1 },
  kidTag: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.green, flexShrink: 0 },
});
