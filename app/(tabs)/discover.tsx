import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  RECIPES,
  Recipe,
  DietaryTag,
  DIETARY_TAGS,
} from '../../data/recipes';
import { fetchDbRecipes } from '../../lib/recipes';
import { useFavorites } from '../../lib/favorites';
import { getSeenIds, addSeenId, clearSeenIds } from '../../lib/seen';
import { addRecipesToShoppingList } from '../../lib/shopping';
import { useAuth } from '../../lib/auth';

const { width } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.25;

export default function DiscoverScreen() {
  const { addFavorite, favorites, loaded: favLoaded } = useFavorites();
  const { isGuest } = useAuth();
  const [activeFilters, setActiveFilters] = useState<DietaryTag[]>([]);
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState<Recipe[]>([]);
  const [uploaded, setUploaded] = useState<Recipe[]>([]);
  // Ids to skip in the deck: already favorited or previously swiped. Captured as
  // a stable snapshot once favorites load, so the deck doesn't shift mid-session.
  const [excluded, setExcluded] = useState<Set<string> | null>(null);

  // Uploaded (creator) recipes appear first so fresh content can trend.
  useEffect(() => {
    fetchDbRecipes().then(setUploaded);
  }, []);

  useEffect(() => {
    if (!favLoaded || excluded) return;
    getSeenIds().then(seen => setExcluded(new Set([...seen, ...favorites.map(f => f.id)])));
  }, [favLoaded, favorites, excluded]);

  const deck = useMemo(() => {
    if (!excluded) return []; // still loading the exclusion snapshot
    // Only show free recipes the user hasn't already favorited or swiped.
    const pool = [...uploaded, ...RECIPES].filter(r => !r.isPaid && !excluded.has(r.id));
    if (activeFilters.length === 0) return pool;
    return pool.filter(r => activeFilters.every(tag => r.dietary.includes(tag)));
  }, [activeFilters, uploaded, excluded]);

  const position = useRef(new Animated.ValueXY()).current;

  // Live mirrors so the once-created PanResponder always reads the current card,
  // instead of the stale values captured on the first render.
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const indexRef = useRef(index);
  indexRef.current = index;
  const isGuestRef = useRef(isGuest);
  isGuestRef.current = isGuest;

  const toggleFilter = (tag: DietaryTag) => {
    setActiveFilters(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
    // Reset the deck when the filter changes.
    position.setValue({ x: 0, y: 0 });
    setIndex(0);
  };

  const advance = (recipe: Recipe, direction: 'like' | 'skip') => {
    if (direction === 'like') {
      if (isGuest) {
        // Guests can swipe but likes aren't saved
        Alert.alert(
          'Sign in to save',
          'Create a free account to save recipes to your favorites.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Sign in', onPress: () => router.push('/login') },
          ]
        );
      } else {
        // A right-swipe saves the recipe to Favorites
        addFavorite(recipe);
        setLiked(prev => [...prev, recipe]);
      }
    }
    // Remember this recipe so it won't reappear on a later visit.
    addSeenId(recipe.id);
    position.setValue({ x: 0, y: 0 });
    setIndex(i => i + 1);
  };

  // Push everything swiped in this session straight to the shopping list,
  // grouped by ingredient category / recipe on the Shopping screen.
  const addLikedToShoppingList = async () => {
    const result = await addRecipesToShoppingList(liked.map(recipe => ({ recipe })));
    if ('error' in result) {
      Alert.alert('Sign in required', 'Sign in to save your shopping list.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/login') },
      ]);
      return;
    }
    Alert.alert(
      'Added to Shopping List! 🛒',
      `${liked.length} meals • ${result.added} new items` +
        (result.merged ? ` (${result.merged} merged)` : ''),
      [
        { text: 'Done', style: 'cancel' },
        { text: 'View List', onPress: () => router.push('/shopping') },
      ]
    );
  };

  const forceSwipe = (direction: 'like' | 'skip') => {
    // Guests can browse recipes but can't swipe — prompt sign-up, reset to first.
    if (isGuest) {
      Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      setIndex(0);
      router.push('/login');
      return;
    }
    const recipe = deckRef.current[indexRef.current];
    if (!recipe) return;
    const x = direction === 'like' ? width * 1.5 : -width * 1.5;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 220,
      useNativeDriver: false,
    }).start(() => advance(recipe, direction));
  };

  const resetPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
      onPanResponderMove: (_, g) => {
        // Guests can't swipe — the card never moves for them.
        if (isGuestRef.current) return;
        position.setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_, g) => {
        // Guests: swiping does nothing but prompt sign-up and reset to the first card.
        if (isGuestRef.current) {
          resetPosition();
          setIndex(0);
          router.push('/login');
          return;
        }
        if (g.dx > SWIPE_THRESHOLD) forceSwipe('like');
        else if (g.dx < -SWIPE_THRESHOLD) forceSwipe('skip');
        else resetPosition();
      },
    })
  ).current;

  const rotate = position.x.interpolate({
    inputRange: [-width / 2, 0, width / 2],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });
  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const skipOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const restart = () => {
    // Bring every recipe back (except ones you've already favorited).
    clearSeenIds();
    setExcluded(new Set(favorites.map(f => f.id)));
    position.setValue({ x: 0, y: 0 });
    setIndex(0);
    setLiked([]);
  };

  const deckDone = index >= deck.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.backButton} />
        <Text style={styles.headerTitle}>Discover</Text>
        <TouchableOpacity style={styles.likedBadge} onPress={() => router.push('/favorites')}>
          <Text style={styles.likedBadgeText}>❤️ {favorites.length}</Text>
        </TouchableOpacity>
      </View>

      {/* Pre-filters */}
      <View>
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
      </View>

      {/* Card area */}
      <View style={styles.cardArea}>
        {!excluded ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#FF6B35" />
          </View>
        ) : deck.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>No recipes match these filters</Text>
            <Text style={styles.emptySubtext}>Try removing a filter above</Text>
          </View>
        ) : deckDone ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyText}>That's everyone!</Text>
            <Text style={styles.emptySubtext}>
              {liked.length > 0
                ? `${liked.length} ${liked.length === 1 ? 'recipe' : 'recipes'} saved to Favorites`
                : 'No matches this time'}
            </Text>
            {liked.length > 0 && (
              <>
                <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/favorites')}>
                  <Text style={styles.primaryButtonText}>❤️ View Favorites</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={addLikedToShoppingList}>
                  <Text style={styles.secondaryButtonText}>🛒 Add to Shopping List</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.secondaryButton} onPress={restart}>
              <Text style={styles.secondaryButtonText}>↻ Start over</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Render the next card behind, and the active card on top.
          deck
            .map((recipe, i) => {
              if (i < index || i > index + 1) return null;
              const isTop = i === index;

              const cardStyle = isTop
                ? {
                    transform: [
                      { translateX: position.x },
                      { translateY: position.y },
                      { rotate },
                    ],
                  }
                : { transform: [{ scale: 0.95 }], top: 10 };

              return (
                <Animated.View
                  key={recipe.id}
                  style={[styles.card, cardStyle, !isTop && styles.cardBehind]}
                  {...(isTop ? panResponder.panHandlers : {})}
                >
                  <Image source={{ uri: recipe.image }} style={styles.cardImage} />
                  <View style={styles.cardOverlay} />

                  {isTop && (
                    <>
                      <Animated.View
                        style={[styles.stampBase, styles.likeStamp, { opacity: likeOpacity }]}
                      >
                        <Text style={styles.likeStampText}>LIKE</Text>
                      </Animated.View>
                      <Animated.View
                        style={[styles.stampBase, styles.skipStamp, { opacity: skipOpacity }]}
                      >
                        <Text style={styles.skipStampText}>SKIP</Text>
                      </Animated.View>
                    </>
                  )}

                  <ScrollView style={styles.cardContent} showsVerticalScrollIndicator={false}>
                    <TouchableOpacity 
                      style={styles.influencerRow}
                      onPress={() => router.push(`/creator/${recipe.influencer.id || recipe.influencer.handle.replace('@', '')}`)}
                    >
                      <Image source={{ uri: recipe.influencer.avatar }} style={styles.influencerAvatar} />
                      <View>
                        <Text style={styles.influencerName}>{recipe.influencer.name}</Text>
                        <Text style={styles.influencerHandle}>{recipe.influencer.handle}</Text>
                      </View>
                      <Text style={styles.viewProfileArrow}>›</Text>
                    </TouchableOpacity>
                    <Text style={styles.cardTitle}>{recipe.title}</Text>
                    <View style={styles.cardMeta}>
                      <Text style={styles.cardMetaText}>⏱ {recipe.prepTime + recipe.cookTime} min</Text>
                      <Text style={styles.cardMetaText}>🔥 {recipe.calories} cal</Text>
                      <Text style={styles.cardMetaText}>💰 ${recipe.cost.toFixed(2)}</Text>
                    </View>
                    <Text style={styles.cardDescription}>{recipe.description}</Text>
                    <View style={styles.tagRow}>
                      {recipe.dietary.map(tag => {
                        const meta = DIETARY_TAGS.find(t => t.id === tag);
                        return (
                          <View key={tag} style={styles.tagBadge}>
                            <Text style={styles.tagBadgeText}>
                              {meta?.icon} {meta?.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    <TouchableOpacity
                      style={styles.viewRecipeLink}
                      onPress={() => router.push(`/recipe/${recipe.id}`)}
                    >
                      <Text style={styles.viewRecipeLinkText}>View full recipe →</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </Animated.View>
              );
            })
            .reverse()
        )}
      </View>

      {/* Action buttons */}
      {!deckDone && deck.length > 0 && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.skipButton]}
            onPress={() => forceSwipe('skip')}
          >
            <Text style={styles.skipButtonIcon}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.infoButton]}
            onPress={() => router.push(`/recipe/${deck[index].id}`)}
          >
            <Text style={styles.infoButtonIcon}>ℹ︎</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.likeButton]}
            onPress={() => forceSwipe('like')}
          >
            <Text style={styles.likeButtonIcon}>❤</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12 },
  backButton: { width: 70 },
  backText: { fontSize: 16, color: '#FF6B35', fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  likedBadge: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, minWidth: 56, alignItems: 'center' },
  likedBadgeText: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  filterRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', marginRight: 8, borderWidth: 1, borderColor: '#EEE' },
  filterChipActive: { backgroundColor: '#FF6B35', borderColor: '#FF6B35' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  filterChipTextActive: { color: '#FFF', fontWeight: '600' },
  cardArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  card: { position: 'absolute', width: width - 32, height: '92%', borderRadius: 24, backgroundColor: '#FFF', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  cardBehind: { alignSelf: 'center' },
  cardImage: { width: '100%', height: '55%' },
  cardOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%', backgroundColor: 'rgba(0,0,0,0.08)' },
  cardContent: { padding: 20 },
  influencerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  influencerAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
  influencerName: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  influencerHandle: { fontSize: 12, color: '#FF6B35', fontWeight: '500' },
  viewProfileArrow: { fontSize: 24, color: '#CCC', marginLeft: 'auto', paddingLeft: 12 },
  cardTitle: { fontSize: 24, fontWeight: '800', color: '#1A1A1A', marginBottom: 10 },
  cardMeta: { flexDirection: 'row', marginBottom: 12 },
  cardMetaText: { fontSize: 13, color: '#888', marginRight: 16 },
  cardDescription: { fontSize: 15, color: '#444', lineHeight: 22, marginBottom: 14 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  tagBadge: { backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, marginRight: 8, marginBottom: 8 },
  tagBadgeText: { fontSize: 12, color: '#2E7D32', fontWeight: '600' },
  viewRecipeLink: { paddingVertical: 8 },
  viewRecipeLinkText: { fontSize: 14, color: '#FF6B35', fontWeight: '600' },
  stampBase: { position: 'absolute', top: 40, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 4, borderRadius: 12, zIndex: 10 },
  likeStamp: { left: 24, borderColor: '#4CAF50', transform: [{ rotate: '-18deg' }] },
  likeStampText: { color: '#4CAF50', fontSize: 32, fontWeight: '800' },
  skipStamp: { right: 24, borderColor: '#E53935', transform: [{ rotate: '18deg' }] },
  skipStampText: { color: '#E53935', fontSize: 32, fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, paddingBottom: 32, gap: 20 },
  actionButton: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4 },
  skipButton: { width: 60, height: 60, borderRadius: 30 },
  skipButtonIcon: { fontSize: 28, color: '#E53935', fontWeight: '700' },
  infoButton: { width: 48, height: 48, borderRadius: 24 },
  infoButtonIcon: { fontSize: 20, color: '#888' },
  likeButton: { width: 60, height: 60, borderRadius: 30 },
  likeButtonIcon: { fontSize: 28, color: '#4CAF50' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  emptySubtext: { fontSize: 14, color: '#888', marginTop: 6, marginBottom: 20 },
  primaryButton: { backgroundColor: '#FF6B35', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 14, marginTop: 8 },
  primaryButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { paddingHorizontal: 24, paddingVertical: 14, marginTop: 4 },
  secondaryButtonText: { color: '#888', fontSize: 15, fontWeight: '600' },
});
