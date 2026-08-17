import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { RECIPES, Recipe, DietaryTag, DIETARY_TAGS, isQuick, isBudget } from '../data/recipes';
import { fetchDbRecipes } from '../lib/recipes';
import { supabase } from '../lib/supabase';
import { HEADER_TOP } from '../lib/layout';

// Auto-derived attribute filters (computed from time/cost) + manual dietary tags.
const ALL_FILTERS: { id: string; label: string; icon: string }[] = [
  { id: 'quick', label: 'Quick', icon: '⚡' },
  { id: 'budget', label: 'Budget', icon: '💰' },
  ...DIETARY_TAGS,
];

type Creator = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string;
  bio: string;
};

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<Recipe[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [searchMode, setSearchMode] = useState<'recipes' | 'creators'>('recipes');

  useEffect(() => {
    fetchDbRecipes().then(setUploaded);
    loadCreators();
  }, []);

  const loadCreators = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, avatar_url, bio')
      .eq('is_creator', true);
    if (data) setCreators(data);
  };

  const toggleFilter = (tag: string) => {
    setActiveFilters(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const results = useMemo(() => {
    const pool = [...uploaded, ...RECIPES];
    const q = query.trim().toLowerCase();
    return pool.filter(r => {
      const matchesQuery =
        q === '' ||
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.influencer.name.toLowerCase().includes(q) ||
        r.influencer.handle.toLowerCase().includes(q);
      const matchesFilters = activeFilters.every(f =>
        f === 'quick' ? isQuick(r) : f === 'budget' ? isBudget(r) : r.dietary.includes(f as DietaryTag)
      );
      return matchesQuery && matchesFilters;
    });
  }, [query, activeFilters, uploaded]);

  const creatorResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter(c =>
      c.full_name?.toLowerCase().includes(q) ||
      c.username?.toLowerCase().includes(q) ||
      c.bio?.toLowerCase().includes(q)
    );
  }, [query, creators]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Search input */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search recipes, creators…"
          placeholderTextColor="#999"
          autoFocus
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Mode Toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeButton, searchMode === 'recipes' && styles.modeButtonActive]}
          onPress={() => setSearchMode('recipes')}
        >
          <Text style={[styles.modeButtonText, searchMode === 'recipes' && styles.modeButtonTextActive]}>
            🍽️ Recipes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, searchMode === 'creators' && styles.modeButtonActive]}
          onPress={() => setSearchMode('creators')}
        >
          <Text style={[styles.modeButtonText, searchMode === 'creators' && styles.modeButtonTextActive]}>
            👨‍🍳 Creators
          </Text>
        </TouchableOpacity>
      </View>

      {searchMode === 'recipes' ? (
        <>
          {/* Dietary filters - fixed height container */}
          <View style={styles.filterContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {ALL_FILTERS.map(tag => {
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
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.resultCount}>
              {results.length} {results.length === 1 ? 'recipe' : 'recipes'}
            </Text>

            {results.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🍽️</Text>
                <Text style={styles.emptyText}>No recipes found</Text>
                <Text style={styles.emptySubtext}>Try another term or remove a filter</Text>
              </View>
            ) : (
              results.map(recipe => (
                <TouchableOpacity
                  key={recipe.id}
                  style={styles.card}
                  onPress={() => router.push(`/recipe/${recipe.id}`)}
                >
                  <Image source={{ uri: recipe.image }} style={styles.cardImage} />
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{recipe.title}</Text>
                    <Text style={styles.cardMeta}>
                      {recipe.prepTime + recipe.cookTime} min • {recipe.calories} cal
                    </Text>
                    <TouchableOpacity onPress={() => router.push(`/creator/${recipe.influencer.id || recipe.influencer.handle.replace('@', '')}`)}>
                      <Text style={styles.cardHandle}>{recipe.influencer.handle}</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.resultCount}>
            {creatorResults.length} {creatorResults.length === 1 ? 'creator' : 'creators'}
          </Text>

          {creatorResults.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>👨‍🍳</Text>
              <Text style={styles.emptyText}>No creators found</Text>
              <Text style={styles.emptySubtext}>Try another name</Text>
            </View>
          ) : (
            creatorResults.map(creator => (
              <TouchableOpacity
                key={creator.id}
                style={styles.creatorCard}
                onPress={() => router.push(`/creator/${creator.username || creator.id}`)}
              >
                <Image
                  source={{ uri: creator.avatar_url || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200' }}
                  style={styles.creatorAvatar}
                />
                <View style={styles.creatorInfo}>
                  <Text style={styles.creatorName}>{creator.full_name || 'Creator'}</Text>
                  {creator.username && (
                    <Text style={styles.creatorHandle}>@{creator.username}</Text>
                  )}
                  {creator.bio && (
                    <Text style={styles.creatorBio} numberOfLines={2}>{creator.bio}</Text>
                  )}
                </View>
                <Text style={styles.creatorArrow}>›</Text>
              </TouchableOpacity>
            ))
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: HEADER_TOP, paddingBottom: 12 },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#EEE' },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#1A1A1A' },
  clearIcon: { fontSize: 14, color: '#999', padding: 4 },
  filterRow: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', marginRight: 8, borderWidth: 1, borderColor: '#EEE' },
  filterChipActive: { backgroundColor: '#F2701E', borderColor: '#F2701E' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  filterChipTextActive: { color: '#FFF', fontWeight: '600' },
  resultCount: { fontSize: 13, color: '#888', marginHorizontal: 20, marginBottom: 10 },
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, marginHorizontal: 20, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardImage: { width: 100, height: 100 },
  cardContent: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  cardMeta: { fontSize: 13, color: '#888', marginTop: 4 },
  cardHandle: { fontSize: 12, color: '#F2701E', fontWeight: '500', marginTop: 6 },
  emptyState: { alignItems: 'center', padding: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#1A1A1A' },
  emptySubtext: { fontSize: 14, color: '#888', marginTop: 4 },
  modeToggle: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#F5F5F5', borderRadius: 12, padding: 4, marginTop: 12 },
  modeButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  modeButtonActive: { backgroundColor: '#FFF' },
  modeButtonText: { fontSize: 14, color: '#888', fontWeight: '500' },
  modeButtonTextActive: { color: '#1A1A1A', fontWeight: '600' },
  filterContainer: { maxHeight: 64 },
  creatorCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, marginHorizontal: 20, marginBottom: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  creatorAvatar: { width: 56, height: 56, borderRadius: 28, marginRight: 14 },
  creatorInfo: { flex: 1 },
  creatorName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  creatorHandle: { fontSize: 13, color: '#F2701E', fontWeight: '500', marginTop: 2 },
  creatorBio: { fontSize: 13, color: '#888', marginTop: 4 },
  creatorArrow: { fontSize: 24, color: '#CCC' },
});
