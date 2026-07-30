import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { RECIPES, getRecipesByCategory, Recipe } from '../../data/recipes';
import { supabase } from '../../lib/supabase';
import { useAuth, canUploadRecipes } from '../../lib/auth';
import { fetchRecipeOfTheWeek } from '../../lib/recipes';
import { COLORS, FONTS, RADIUS } from '../../lib/theme';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200';

const categories = [
  { id: 'quick', name: 'Quick', icon: '⚡' },
  { id: 'kids', name: 'Kid Approved', icon: '👶' },
  { id: 'healthy', name: 'Healthy', icon: '🥗' },
  { id: 'budget', name: 'Budget', icon: '💰' },
];

// Shared shortcut card — one consistent style instead of a rainbow of pastels.
function NavCard({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.navCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.navIcon}><Text style={styles.navIconText}>{icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.navTitle}>{title}</Text>
        <Text style={styles.navSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.navArrow}>→</Text>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { user, role } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string>('kids');
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [weekRecipe, setWeekRecipe] = useState<Recipe>(RECIPES[0]);

  const filteredRecipes = getRecipesByCategory(activeCategory as any);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        fetchRecipeOfTheWeek().then(r => { if (active && r) setWeekRecipe(r); });
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).single();
        if (active && data?.avatar_url) setAvatar(data.avatar_url);
      })();
      return () => { active = false; };
    }, [])
  );

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>DAD'S FOOD TODAY</Text>
            <Text style={styles.headerTitle}>What's for dinner?</Text>
            <View style={styles.brush} />
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push(user ? '/profile' : '/login')}>
            <Image source={{ uri: avatar }} style={styles.profileImage} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <TouchableOpacity style={styles.searchBar} onPress={() => router.push('/search')}>
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchPlaceholder}>Search recipes, creators…</Text>
        </TouchableOpacity>

        {/* Recipe of the week — hero */}
        <View style={styles.section}>
          <Text style={styles.kickerOrange}>RECIPE OF THE WEEK</Text>
          <TouchableOpacity style={styles.heroCard} activeOpacity={0.9} onPress={() => router.push(`/recipe/${weekRecipe.id}`)}>
            <Image source={{ uri: weekRecipe.image }} style={styles.heroImage} contentFit="cover" />
            <View style={styles.heroOverlay} />
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>❤️ Most loved this week</Text>
            </View>
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle} numberOfLines={2}>{weekRecipe.title}</Text>
              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaText}>⏱ {weekRecipe.prepTime + weekRecipe.cookTime} min</Text>
                <Text style={styles.heroMetaText}>👥 {weekRecipe.servings}</Text>
                <Text style={styles.heroMetaText}>📊 {weekRecipe.difficulty}</Text>
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
          <NavCard icon="🔥" title="Discover" subtitle="Swipe to save your favorites" onPress={() => router.push('/discover')} />
          <NavCard icon="❤️" title="Favorites" subtitle="Cook, plan or add to cart" onPress={() => router.push('/favorites')} />
          {canUploadRecipes(role) && (
            <NavCard icon="📚" title="My Cookbook" subtitle="Your own & imported recipes" onPress={() => router.push('/cookbook')} />
          )}
          <NavCard icon="📅" title="Meal Planner" subtitle="Plan your week • Build your list" onPress={() => router.push('/budget')} />
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
          <Text style={styles.sectionTitle}>POPULAR THIS WEEK</Text>
          {filteredRecipes.map(recipe => (
            <TouchableOpacity key={recipe.id} style={styles.recipeCard} onPress={() => router.push(`/recipe/${recipe.id}`)} activeOpacity={0.85}>
              <Image source={{ uri: recipe.image }} style={styles.recipeImage} contentFit="cover" />
              <View style={styles.recipeContent}>
                <Text style={styles.recipeTitle} numberOfLines={2}>{recipe.title}</Text>
                <Text style={styles.recipeMeta}>{recipe.prepTime + recipe.cookTime} min • {recipe.calories} cal</Text>
                <View style={styles.recipeInfluencer}>
                  <Image source={{ uri: recipe.influencer.avatar }} style={styles.recipeInfluencerAvatar} />
                  <Text style={styles.recipeInfluencerName}>{recipe.influencer.handle}</Text>
                  {recipe.kidApproved && <Text style={styles.kidTag}>· 👶 Kid approved</Text>}
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
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
  heroBadge: { position: 'absolute', top: 14, left: 14, backgroundColor: COLORS.navy, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  heroBadgeText: { fontFamily: FONTS.semibold, color: '#FFF', fontSize: 12 },
  heroContent: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20 },
  heroTitle: { fontFamily: FONTS.display, fontSize: 30, color: '#FFF', marginBottom: 10, lineHeight: 32 },
  heroMeta: { flexDirection: 'row', gap: 16, marginBottom: 16 },
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
  recipeInfluencer: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  recipeInfluencerAvatar: { width: 20, height: 20, borderRadius: 10, marginRight: 6 },
  recipeInfluencerName: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.orange },
  kidTag: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.green, marginLeft: 4 },
});
