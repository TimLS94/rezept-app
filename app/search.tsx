import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { RECIPES, Recipe, DietaryTag, DIETARY_TAGS } from '../data/recipes';
import { fetchDbRecipes } from '../lib/recipes';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<DietaryTag[]>([]);
  const [uploaded, setUploaded] = useState<Recipe[]>([]);

  useEffect(() => {
    fetchDbRecipes().then(setUploaded);
  }, []);

  const toggleFilter = (tag: DietaryTag) => {
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
      const matchesFilters = activeFilters.every(tag => r.dietary.includes(tag));
      return matchesQuery && matchesFilters;
    });
  }, [query, activeFilters, uploaded]);

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

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.resultCount}>
          {results.length} {results.length === 1 ? 'result' : 'results'}
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
                <Text style={styles.cardHandle}>{recipe.influencer.handle}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#FF6B35', fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#EEE' },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#1A1A1A' },
  clearIcon: { fontSize: 14, color: '#999', padding: 4 },
  filterRow: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', marginRight: 8, borderWidth: 1, borderColor: '#EEE' },
  filterChipActive: { backgroundColor: '#FF6B35', borderColor: '#FF6B35' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  filterChipTextActive: { color: '#FFF', fontWeight: '600' },
  resultCount: { fontSize: 13, color: '#888', marginHorizontal: 20, marginBottom: 10 },
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 16, marginHorizontal: 20, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardImage: { width: 100, height: 100 },
  cardContent: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  cardMeta: { fontSize: 13, color: '#888', marginTop: 4 },
  cardHandle: { fontSize: 12, color: '#FF6B35', fontWeight: '500', marginTop: 6 },
  emptyState: { alignItems: 'center', padding: 60 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#1A1A1A' },
  emptySubtext: { fontSize: 14, color: '#888', marginTop: 4 },
});
