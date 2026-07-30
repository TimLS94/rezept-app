import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Recipe, DIETARY_TAGS, DietaryTag } from '../../data/recipes';
import { mapDbRecipe } from '../../lib/recipes';
import { useAuth } from '../../lib/auth';

type CreatorProfile = {
  id: string;
  full_name: string;
  username: string;
  bio: string;
  avatar_url: string;
  instagram_url: string;
  tiktok_url: string;
  website: string;
};

export default function CreatorProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<DietaryTag[]>([]);

  const toggleFilter = (tag: DietaryTag) =>
    setActiveFilters(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));

  // Search + dietary filter within this creator's recipes.
  const filteredRecipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter(r => {
      const matchesQuery =
        q === '' || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
      const matchesFilters = activeFilters.every(tag => r.dietary.includes(tag));
      return matchesQuery && matchesFilters;
    });
  }, [recipes, query, activeFilters]);

  useEffect(() => {
    loadCreator();
  }, [handle]);

  const loadCreator = async () => {
    if (!handle) return;
    setLoading(true);

    // Try multiple ways to find the creator
    let profile = null;

    // 1. Try by username
    const { data: byUsername } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', handle)
      .single();
    
    if (byUsername) {
      profile = byUsername;
    }

    // 2. Try by ID (UUID)
    if (!profile) {
      const { data: byId } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', handle)
        .single();
      if (byId) profile = byId;
    }

    // 3. Try by full_name (partial match)
    if (!profile) {
      const { data: byName } = await supabase
        .from('profiles')
        .select('*')
        .ilike('full_name', `%${handle}%`)
        .limit(1)
        .single();
      if (byName) profile = byName;
    }

    if (profile) {
      setCreator(profile);
      await loadCreatorData(profile.id);
    }

    setLoading(false);
  };

  const loadCreatorData = async (creatorId: string) => {
    // Load recipes
    const { data: recipeData } = await supabase
      .from('recipes')
      .select('*')
      .eq('influencer_id', creatorId)
      .eq('is_paid', false) // Only free recipes on public profile
      .order('created_at', { ascending: false });

    if (recipeData) {
      setRecipes(recipeData.map(mapDbRecipe));
    }

    // Load subscriber count
    const { count } = await supabase
      .from('creator_subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', creatorId);

    setSubscriberCount(count || 0);

    // Check if current user is subscribed
    if (user) {
      const { data: sub } = await supabase
        .from('creator_subscribers')
        .select('*')
        .eq('creator_id', creatorId)
        .eq('subscriber_id', user.id)
        .single();

      setIsSubscribed(!!sub);
    }
  };

  const toggleSubscribe = async () => {
    if (!user || !creator) {
      router.push('/login');
      return;
    }

    if (isSubscribed) {
      await supabase
        .from('creator_subscribers')
        .delete()
        .eq('creator_id', creator.id)
        .eq('subscriber_id', user.id);
      setIsSubscribed(false);
      setSubscriberCount(c => c - 1);
    } else {
      await supabase
        .from('creator_subscribers')
        .insert({ creator_id: creator.id, subscriber_id: user.id });
      setIsSubscribed(true);
      setSubscriberCount(c => c + 1);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F57C00" />
      </View>
    );
  }

  if (!creator) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyText}>Creator not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Creator</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <Image
            source={{ uri: creator.avatar_url || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200' }}
            style={styles.avatar}
          />
          <Text style={styles.name}>{creator.full_name || 'Creator'}</Text>
          <Text style={styles.handle}>@{creator.username || handle}</Text>
          
          {creator.bio && (
            <Text style={styles.bio}>{creator.bio}</Text>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{recipes.length}</Text>
              <Text style={styles.statLabel}>Recipes</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{subscriberCount}</Text>
              <Text style={styles.statLabel}>Subscribers</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.subscribeButton, isSubscribed && styles.subscribedButton]}
            onPress={toggleSubscribe}
          >
            <Text style={[styles.subscribeButtonText, isSubscribed && styles.subscribedButtonText]}>
              {isSubscribed ? '✓ Subscribed' : 'Subscribe'}
            </Text>
          </TouchableOpacity>

          {/* Social Links */}
          {(creator.instagram_url || creator.tiktok_url || creator.website) && (
            <View style={styles.socialRow}>
              {creator.instagram_url && (
                <TouchableOpacity style={styles.socialButton}>
                  <Text style={styles.socialIcon}>📷</Text>
                </TouchableOpacity>
              )}
              {creator.tiktok_url && (
                <TouchableOpacity style={styles.socialButton}>
                  <Text style={styles.socialIcon}>🎵</Text>
                </TouchableOpacity>
              )}
              {creator.website && (
                <TouchableOpacity style={styles.socialButton}>
                  <Text style={styles.socialIcon}>🌐</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Recipes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recipes</Text>

          {recipes.length > 0 && (
            <>
              {/* Search within this creator's recipes */}
              <View style={styles.searchBar}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search this creator's recipes…"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => setQuery('')}>
                    <Text style={styles.searchClear}>×</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Dietary filters */}
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
            </>
          )}

          {recipes.length === 0 ? (
            <View style={styles.emptyRecipes}>
              <Text style={styles.emptyRecipesText}>No public recipes yet</Text>
            </View>
          ) : filteredRecipes.length === 0 ? (
            <View style={styles.emptyRecipes}>
              <Text style={styles.emptyRecipesText}>No recipes match your search or filters</Text>
            </View>
          ) : (
            <View style={styles.recipesGrid}>
              {filteredRecipes.map((recipe) => (
                <TouchableOpacity
                  key={recipe.id}
                  style={styles.recipeCard}
                  onPress={() => router.push(`/recipe/${recipe.id}`)}
                >
                  <Image source={{ uri: recipe.image }} style={styles.recipeImage} />
                  <Text style={styles.recipeTitle} numberOfLines={2}>{recipe.title}</Text>
                  <Text style={styles.recipeMeta}>
                    {recipe.prepTime + recipe.cookTime} min • {recipe.calories} cal
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF9F2' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F57C00', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 18, color: '#0D2B63', letterSpacing: 0.3 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#888' },
  profileHeader: { alignItems: 'center', padding: 24, backgroundColor: '#FFF' },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 16 },
  name: { fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  handle: { fontSize: 15, color: '#F57C00', fontWeight: '500', marginBottom: 12 },
  bio: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 20, paddingHorizontal: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  statItem: { alignItems: 'center', paddingHorizontal: 24 },
  statNumber: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  statLabel: { fontSize: 13, color: '#888', marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: '#E0E0E0' },
  subscribeButton: { backgroundColor: '#F57C00', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24 },
  subscribedButton: { backgroundColor: '#E8F5E9' },
  subscribeButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  subscribedButtonText: { color: '#3C8D40' },
  socialRow: { flexDirection: 'row', marginTop: 16, gap: 12 },
  socialButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  socialIcon: { fontSize: 20 },
  section: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#EEE', marginBottom: 12 },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#1A1A1A' },
  searchClear: { fontSize: 22, color: '#BBB', paddingHorizontal: 4 },
  filterRow: { gap: 8, paddingBottom: 16 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#EEE' },
  filterChipActive: { backgroundColor: '#F57C00', borderColor: '#F57C00' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  filterChipTextActive: { color: '#FFF', fontWeight: '700' },
  emptyRecipes: { alignItems: 'center', padding: 32, backgroundColor: '#FFF', borderRadius: 16 },
  emptyRecipesText: { fontSize: 15, color: '#888' },
  recipesGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  recipeCard: { width: '47%', backgroundColor: '#FFF', borderRadius: 12, marginHorizontal: '1.5%', marginBottom: 12, overflow: 'hidden' },
  recipeImage: { width: '100%', height: 120 },
  recipeTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', padding: 10, paddingBottom: 4 },
  recipeMeta: { fontSize: 12, color: '#888', paddingHorizontal: 10, paddingBottom: 10 },
});
