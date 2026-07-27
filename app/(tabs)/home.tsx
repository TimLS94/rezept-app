import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { RECIPES, getRecipesByCategory } from '../../data/recipes';
import { supabase } from '../../lib/supabase';
import { useAuth, canUploadRecipes } from '../../lib/auth';

const { width } = Dimensions.get('window');

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200';

const tonightRecipe = RECIPES[0]; // First recipe as tonight's pick

const categories = [
  { id: 'quick', name: 'Quick & Easy', icon: '⚡', color: '#FFE0B2' },
  { id: 'kids', name: 'Kid Approved', icon: '👶', color: '#E1F5FE' },
  { id: 'healthy', name: 'Healthy', icon: '🥗', color: '#E8F5E9' },
  { id: 'budget', name: 'Budget', icon: '💰', color: '#FFF3E0' },
];

export default function HomeScreen() {
  const { user, role } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string>('kids');
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);

  const filteredRecipes = getRecipesByCategory(activeCategory as any);

  // Reload the avatar whenever the screen regains focus (e.g. after editing it).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', user.id)
          .single();
        if (active && data?.avatar_url) setAvatar(data.avatar_url);
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Good evening!</Text>
            <Text style={styles.headerTitle}>What's for dinner?</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push(user ? '/profile' : '/login')}>
            <Image
              source={{ uri: avatar }}
              style={styles.profileImage}
            />
          </TouchableOpacity>
        </View>

        {/* Search entry */}
        <TouchableOpacity style={styles.searchBar} onPress={() => router.push('/search')}>
          <Text style={styles.searchIcon}>🔍</Text>
          <Text style={styles.searchPlaceholder}>Search recipes, creators…</Text>
        </TouchableOpacity>

        {/* Tonight's Pick - Hero Card */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.tonightLabel}>TONIGHT'S PICK</Text>
            <TouchableOpacity>
              <Text style={styles.refreshText}>Refresh</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.heroCard} onPress={() => router.push(`/recipe/${tonightRecipe.id}`)}>
            <Image source={{ uri: tonightRecipe.image }} style={styles.heroImage} />
            <View style={styles.heroOverlay} />
            
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>Chef's Choice</Text>
            </View>
            
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>{tonightRecipe.title}</Text>
              
              <View style={styles.heroMeta}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>⏱</Text>
                  <Text style={styles.metaText}>{tonightRecipe.prepTime + tonightRecipe.cookTime} min</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>👥</Text>
                  <Text style={styles.metaText}>{tonightRecipe.servings} servings</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>📊</Text>
                  <Text style={styles.metaText}>{tonightRecipe.difficulty}</Text>
                </View>
              </View>
              
              <View style={styles.heroFooter}>
                <View style={styles.influencerInfo}>
                  <Image 
                    source={{ uri: tonightRecipe.influencer.avatar }} 
                    style={styles.influencerAvatar} 
                  />
                  <View>
                    <Text style={styles.influencerName}>{tonightRecipe.influencer.name}</Text>
                    <Text style={styles.influencerHandle}>{tonightRecipe.influencer.handle}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.cookButton}>
                  <Text style={styles.cookButtonText}>Let's Cook</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Discover / Swipe Card */}
        <TouchableOpacity style={styles.discoverCard} onPress={() => router.push('/discover')}>
          <View style={styles.discoverIcon}>
            <Text style={styles.discoverIconText}>🔥</Text>
          </View>
          <View style={styles.discoverContent}>
            <Text style={styles.discoverTitle}>Discover Recipes</Text>
            <Text style={styles.discoverSubtitle}>Swipe to save your favorites</Text>
          </View>
          <Text style={styles.discoverArrow}>→</Text>
        </TouchableOpacity>

        {/* Favorites Card */}
        <TouchableOpacity style={styles.favoritesCard} onPress={() => router.push('/favorites')}>
          <View style={styles.discoverIcon}>
            <Text style={styles.discoverIconText}>❤️</Text>
          </View>
          <View style={styles.discoverContent}>
            <Text style={styles.discoverTitle}>Favorites</Text>
            <Text style={styles.favoritesSubtitle}>Your saved recipes → add to plan or cart</Text>
          </View>
          <Text style={styles.favoritesArrow}>→</Text>
        </TouchableOpacity>

        {/* My Cookbook Card — recipe creation is creator-only for now */}
        {canUploadRecipes(role) && (
          <TouchableOpacity style={styles.cookbookCard} onPress={() => router.push('/cookbook')}>
            <View style={styles.cookbookIcon}>
              <Text style={styles.cookbookIconText}>📚</Text>
            </View>
            <View style={styles.cookbookContent}>
              <Text style={styles.cookbookTitle}>My Cookbook</Text>
              <Text style={styles.cookbookSubtitle}>Import from Instagram • Your own recipes</Text>
            </View>
            <Text style={styles.cookbookArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Meal Planner Card */}
        <TouchableOpacity style={styles.mealPlannerCard} onPress={() => router.push('/budget')}>
          <View style={styles.mealPlannerIcon}>
            <Text style={styles.mealPlannerIconText}>📅</Text>
          </View>
          <View style={styles.mealPlannerContent}>
            <Text style={styles.mealPlannerTitle}>Meal Planner</Text>
            <Text style={styles.mealPlannerSubtitle}>Plan your week • Build your list</Text>
          </View>
          <Text style={styles.mealPlannerArrow}>→</Text>
        </TouchableOpacity>

        {/* Restaurant Teaser */}
        <TouchableOpacity style={styles.restaurantTeaser}>
          <View style={styles.restaurantIcon}>
            <Text style={styles.restaurantIconText}>🍕</Text>
          </View>
          <View style={styles.restaurantContent}>
            <Text style={styles.restaurantTitle}>Don't feel like cooking?</Text>
            <Text style={styles.restaurantSubtitle}>Family restaurants nearby • Coming soon</Text>
          </View>
          <Text style={styles.restaurantArrow}>→</Text>
        </TouchableOpacity>

        {/* Categories */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContainer}
        >
          {categories.map((cat) => (
            <TouchableOpacity 
              key={cat.id}
              style={[
                styles.categoryChip,
                { backgroundColor: activeCategory === cat.id ? '#FF6B35' : cat.color }
              ]}
              onPress={() => setActiveCategory(cat.id)}
            >
              <Text style={styles.categoryIcon}>{cat.icon}</Text>
              <Text style={[
                styles.categoryText,
                { color: activeCategory === cat.id ? '#FFF' : '#333' }
              ]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Trending Recipes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Trending This Week</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          
          {filteredRecipes.map((recipe) => (
            <TouchableOpacity 
              key={recipe.id} 
              style={styles.recipeCard}
              onPress={() => router.push(`/recipe/${recipe.id}`)}
            >
              <Image source={{ uri: recipe.image }} style={styles.recipeImage} />
              <View style={styles.recipeContent}>
                <View style={styles.recipeHeader}>
                  <Text style={styles.recipeTitle} numberOfLines={2}>{recipe.title}</Text>
                  {recipe.kidApproved && (
                    <View style={styles.kidBadge}>
                      <Text style={styles.kidBadgeText}>👶</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.recipeMeta}>
                  {recipe.prepTime + recipe.cookTime} min • {recipe.calories} cal
                </Text>
                <View style={styles.recipeInfluencer}>
                  <Image source={{ uri: recipe.influencer.avatar }} style={styles.recipeInfluencerAvatar} />
                  <Text style={styles.recipeInfluencerName}>{recipe.influencer.handle}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

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
  greeting: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchPlaceholder: {
    fontSize: 16,
    color: '#999',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tonightLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF6B35',
    letterSpacing: 1.5,
  },
  refreshText: {
    fontSize: 14,
    color: '#888',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
  heroCard: {
    borderRadius: 24,
    overflow: 'hidden',
    height: 320,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: '#FF6B35',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  heroBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 12,
  },
  heroMeta: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  metaIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  metaText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  influencerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  influencerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  influencerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  influencerHandle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  cookButton: {
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  cookButtonText: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '700',
  },
  discoverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEDE5',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
  },
  discoverIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  discoverIconText: {
    fontSize: 24,
  },
  discoverContent: {
    flex: 1,
  },
  discoverTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  discoverSubtitle: {
    fontSize: 13,
    color: '#FF6B35',
  },
  discoverArrow: {
    fontSize: 20,
    color: '#FF6B35',
  },
  favoritesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFE0D0',
  },
  favoritesSubtitle: {
    fontSize: 13,
    color: '#888',
  },
  favoritesArrow: {
    fontSize: 20,
    color: '#FF6B35',
  },
  mealPlannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
  },
  mealPlannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  mealPlannerIconText: {
    fontSize: 24,
  },
  mealPlannerContent: {
    flex: 1,
  },
  mealPlannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  mealPlannerSubtitle: {
    fontSize: 13,
    color: '#4CAF50',
  },
  mealPlannerArrow: {
    fontSize: 20,
    color: '#4CAF50',
  },
  restaurantTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F0',
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFE0D0',
    borderStyle: 'dashed',
  },
  restaurantIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  restaurantIconText: {
    fontSize: 24,
  },
  restaurantContent: {
    flex: 1,
  },
  restaurantTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  restaurantSubtitle: {
    fontSize: 13,
    color: '#FF6B35',
  },
  restaurantArrow: {
    fontSize: 20,
    color: '#FF6B35',
  },
  categoriesContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    marginRight: 12,
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  recipeImage: {
    width: 120,
    height: 120,
  },
  recipeContent: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  recipeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    flex: 1,
    marginRight: 8,
  },
  kidBadge: {
    backgroundColor: '#E3F2FD',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kidBadgeText: {
    fontSize: 14,
  },
  recipeMeta: {
    fontSize: 13,
    color: '#888',
  },
  recipeInfluencer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipeInfluencerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
  },
  recipeInfluencerName: {
    fontSize: 12,
    color: '#FF6B35',
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 40,
  },
  cookbookCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E5F5',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
  },
  cookbookIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cookbookIconText: {
    fontSize: 24,
  },
  cookbookContent: {
    flex: 1,
  },
  cookbookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  cookbookSubtitle: {
    fontSize: 13,
    color: '#7B1FA2',
  },
  cookbookArrow: {
    fontSize: 20,
    color: '#7B1FA2',
  },
});
