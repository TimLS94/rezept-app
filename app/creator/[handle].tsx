import { useEffect, useMemo, useState } from 'react';
import {
  fetchCreatorEngagement,
  compactCount,
  EMPTY_ENGAGEMENT,
  type CreatorEngagement,
} from '../../lib/engagement';
import ImageViewer from '../../components/ImageViewer';
import EngagementRow from '../../components/EngagementRow';
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
import { mapDbRecipe, RECIPE_LIST_COLUMNS } from '../../lib/recipes';
import { useAuth } from '../../lib/auth';
import { purchaseCreatorSubscription } from '../../lib/purchases';
import { usd, findCreatorSubTier } from '../../lib/pricing';
import { Alert } from 'react-native';
import { HEADER_TOP } from '../../lib/layout';

type CreatorProfile = {
  id: string;
  full_name: string;
  username: string;
  bio: string;
  avatar_url: string;
  instagram_url: string;
  tiktok_url: string;
  website: string;
  // Paid membership config. Null/false until the creator sets it in the studio;
  // absent entirely on a DB where creator_pricing.sql hasn't been run.
  subscription_enabled?: boolean | null;
  subscription_price_cents?: number | null;
};

// The columns a stranger may read. `select('*')` would now fail: the profiles
// table only grants the public subset, and the wildcard expands to columns the
// grant withholds (supabase/harden_profile_reads.sql).
const PUBLIC_PROFILE_COLUMNS =
  'id, full_name, username, avatar_url, bio, instagram_url, tiktok_url, website, ' +
  'is_creator, subscription_enabled, subscription_price_cents, default_recipe_price_cents, created_at';

export default function CreatorProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { user, refresh } = useAuth();
  const [subscribing, setSubscribing] = useState(false);
  const [hasCreatorAccess, setHasCreatorAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<CreatorEngagement>({
    totals: EMPTY_ENGAGEMENT,
    perRecipe: {},
  });
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
    // `any` because the column list is built at runtime, so supabase-js cannot
    // infer a row type from it the way it can from a literal.
    let profile: any = null;

    // 1. Try by username
    const { data: byUsername } = await supabase
      .from('profiles')
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq('username', handle)
      .single();
    
    if (byUsername) {
      profile = byUsername;
    }

    // 2. Try by ID (UUID)
    if (!profile) {
      const { data: byId } = await supabase
        .from('profiles')
        .select(PUBLIC_PROFILE_COLUMNS)
        .eq('id', handle)
        .single();
      if (byId) profile = byId;
    }

    // 3. Try by full_name (partial match)
    if (!profile) {
      const { data: byName } = await supabase
        .from('profiles')
        .select(PUBLIC_PROFILE_COLUMNS)
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
    // Show all recipes (free + premium). Premium ones appear as locked teasers
    // so users can preview them and subscribe.
    // Listing columns only — the paid recipes' ingredients and steps are not
    // readable here, which is the point: this page used to hand them out in full.
    const { data: recipeData } = await supabase
      .from('recipes')
      .select(RECIPE_LIST_COLUMNS)
      .eq('influencer_id', creatorId)
      .order('created_at', { ascending: false });

    if (recipeData) {
      setRecipes(recipeData.map(mapDbRecipe));
    }

    // Cooked and saved come from three per-user tables, counted server-side so
    // the follow graph and everyone's cook log stay private. One call for the
    // whole creator rather than one per card.
    setEngagement(await fetchCreatorEngagement(creatorId));

    // The subscriber list is private; only the number is public. Reading the
    // table for a count used to hand out the whole follow graph with it.
    const { data: subCount } = await supabase
      .rpc('creator_subscriber_count', { p_creator_id: creatorId });

    setSubscriberCount(subCount ?? 0);

    // Check if current user is subscribed
    if (user) {
      const { data: sub } = await supabase
        .from('creator_subscribers')
        .select('subscriber_id')
        .eq('creator_id', creatorId)
        .eq('subscriber_id', user.id)
        .single();

      setIsSubscribed(!!sub);

      // Only a membership with THIS creator grants access — app Premium buys
      // app features, not creator content. Errors are non-fatal: worst case we
      // show the join button to someone who already joined, and the server
      // still gates the content either way.
      const { data: ent } = await supabase
        .from('entitlements')
        .select('id')
        .eq('user_id', user.id)
        .eq('scope', 'creator')
        .eq('creator_id', creatorId)
        .eq('status', 'active')
        .limit(1);
      setHasCreatorAccess((ent?.length ?? 0) > 0);
    }
  };

  const isOwnProfile = !!user && !!creator && user.id === creator.id;

  const subscribeToCreator = async () => {
    if (!user) { router.push('/login'); return; }
    const price = creator?.subscription_price_cents;
    if (!creator || price == null) return;

    const tier = findCreatorSubTier(price);
    if (!tier) {
      // No registered store product for this price, so nothing could be
      // charged — say so rather than failing at the payment sheet.
      Alert.alert('Unavailable', 'This membership price is not currently purchasable.');
      return;
    }

    setSubscribing(true);
    try {
      const { result, error } = await purchaseCreatorSubscription(creator.id, tier.cents, tier.productId);
      if (result === 'success') {
        setHasCreatorAccess(true);
        await refresh();
        await loadCreatorData(creator.id);   // premium teasers become full recipes
        Alert.alert('You\u2019re in 🎉', `You now have access to every premium recipe by ${creator.full_name || 'this creator'}.`);
      } else if (result === 'unavailable') {
        Alert.alert('Not available yet', "Memberships aren't active in this build. They work once the price tiers are registered as products in RevenueCat.");
      } else if (result === 'error') {
        Alert.alert('Purchase failed', error ?? 'Please try again later.');
      }
    } finally {
      setSubscribing(false);
    }
  };

  const toggleSubscribe = async () => {
    if (!user || !creator) {
      router.push('/login');
      return;
    }

    // The screen used to change before the write was checked, so a failure
    // left someone reading "following" while the database disagreed — and the
    // count moved with it. Following a creator is how paid recipes are found;
    // being wrong about it is not cosmetic.
    if (isSubscribed) {
      const { error } = await supabase
        .from('creator_subscribers')
        .delete()
        .eq('creator_id', creator.id)
        .eq('subscriber_id', user.id);
      if (error) {
        Alert.alert('Could not unfollow', 'Something went wrong. Try again in a moment.');
        return;
      }
      setIsSubscribed(false);
      setSubscriberCount(c => Math.max(0, c - 1));
    } else {
      const { error } = await supabase
        .from('creator_subscribers')
        .insert({ creator_id: creator.id, subscriber_id: user.id });
      if (error) {
        Alert.alert('Could not follow', 'Something went wrong. Try again in a moment.');
        return;
      }
      setIsSubscribed(true);
      setSubscriberCount(c => c + 1);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F2701E" />
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
          {/* Tappable. A hundred points across is enough to recognise someone
              and not enough to see them, and the viewer this opens is the same
              one recipe photos already use. */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              setViewerUri(
                creator.avatar_url ||
                  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
              )
            }
          >
            <Image
              source={{ uri: creator.avatar_url || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200' }}
              style={styles.avatar}
            />
          </TouchableOpacity>
          {/* The route param is a username or an id, and it was printed as the
              handle whichever it was — so a profile with no username showed
              "@d778ebec-8319-49cd-…", an internal id dressed up as a name. No
              username, no handle line. */}
          <Text style={styles.name}>
            {creator.full_name || creator.username || 'Creator'}
          </Text>
          {!!creator.username && <Text style={styles.handle}>@{creator.username}</Text>}
          
          {creator.bio && (
            <Text style={styles.bio}>{creator.bio}</Text>
          )}

          {/* Four fixed columns, no dividers, evenly split.
              It was a row of items with hairlines between them, and two of them
              appeared only once their number passed zero — so the whole row shifted
              sideways the first time somebody cooked something, and the spacing was
              whatever twenty-four points of padding happened to produce.
              A zero here is honest rather than harsh: on a profile it reads as "new",
              while under a single recipe it reads as a verdict, which is why that one
              still hides. */}
          <View style={styles.statsRow}>
            {[
              { n: recipes.length, label: recipes.length === 1 ? 'Recipe' : 'Recipes' },
              { n: subscriberCount, label: subscriberCount === 1 ? 'Follower' : 'Followers' },
              { n: engagement.totals.cooked, label: 'Cooked' },
              { n: engagement.totals.favorited, label: 'Likes' },
            ].map(stat => (
              <View key={stat.label} style={styles.statItem}>
                <Text style={styles.statNumber}>{compactCount(stat.n)}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Free follow. Deliberately NOT called "Subscribe" any more: the paid
              membership below now owns that word, and two buttons saying the
              same thing with different consequences is how people get billed by
              accident. */}
          <TouchableOpacity
            style={[styles.subscribeButton, isSubscribed && styles.subscribedButton]}
            onPress={toggleSubscribe}
          >
            <Text style={[styles.subscribeButtonText, isSubscribed && styles.subscribedButtonText]}>
              {isSubscribed ? '✓ Following' : 'Follow'}
            </Text>
          </TouchableOpacity>

          {/* Paid membership — only shown when the creator turned it on and
              picked a price. Hidden entirely otherwise, so there's never a
              buy button with no price behind it. */}
          {creator.subscription_enabled && creator.subscription_price_cents != null && !isOwnProfile && (
            <View style={styles.memberCard}>
              <Text style={styles.memberTitle}>
                {hasCreatorAccess ? '✓ You’re a member' : `Member · ${usd(creator.subscription_price_cents)}/month`}
              </Text>
              <Text style={styles.memberText}>
                {hasCreatorAccess
                  ? `You have access to every premium recipe by ${creator.full_name || 'this creator'}.`
                  : `Unlock every premium recipe by ${creator.full_name || 'this creator'} — including everything they publish next. Cancel anytime.`}
              </Text>
              {!hasCreatorAccess && (
                <TouchableOpacity
                  style={styles.memberButton}
                  onPress={subscribeToCreator}
                  disabled={subscribing}
                >
                  <Text style={styles.memberButtonText}>
                    {subscribing ? 'Subscribing…' : `Become a member · ${usd(creator.subscription_price_cents)}/mo`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

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
                  <View>
                    <Image source={{ uri: recipe.image }} style={styles.recipeImage} />
                    {recipe.isPaid && (
                      <View style={styles.premiumBadge}>
                        <Text style={styles.premiumBadgeText}>🔒 Premium</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.recipeTitle} numberOfLines={2}>{recipe.title}</Text>
                  <Text style={styles.recipeMeta}>
                    {recipe.prepTime + recipe.cookTime} min • {recipe.calories} cal
                  </Text>
                  {/* Visible to whoever is looking, not only to the author.
                      "40 people cooked this" is the strongest thing a reader can
                      be told about a recipe, and it is the reason to open it.
                      Wrapped, because the card clips its children and the title
                      and meta above carry their own padding — without this the
                      number sat flush against the card edge, out of line with
                      every line above it. */}
                  <View style={styles.recipeStatsWrap}>
                    <EngagementRow
                      engagement={engagement.perRecipe[recipe.id] ?? EMPTY_ENGAGEMENT}
                      size="sm"
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <ImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
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
    paddingTop: HEADER_TOP,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F2701E', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 18, color: '#0D2B63', letterSpacing: 0.3 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#888' },
  profileHeader: { alignItems: 'center', padding: 24, backgroundColor: '#FFF' },
  avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 16 },
  name: { fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  handle: { fontSize: 15, color: '#F2701E', fontWeight: '500', marginBottom: 12 },
  bio: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 20, paddingHorizontal: 20 },
  statsRow: { flexDirection: 'row', alignSelf: 'stretch', marginBottom: 20, marginTop: 4 },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, color: '#8A8A8A', marginTop: 3 },
  subscribeButton: { backgroundColor: '#F2701E', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24 },
  subscribedButton: { backgroundColor: '#E8F5E9' },
  subscribeButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  subscribedButtonText: { color: '#3C8D40' },
  memberCard: {
    alignSelf: 'stretch', marginTop: 14, marginHorizontal: 4, padding: 16,
    backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#EFE7DC',
  },
  memberTitle: { fontSize: 15, fontWeight: '700', color: '#0D2B63' },
  memberText: { fontSize: 13, color: '#6F6F6F', lineHeight: 19, marginTop: 5 },
  memberButton: {
    backgroundColor: '#0D2B63', borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', marginTop: 13,
  },
  memberButtonText: { color: '#FFF', fontSize: 14.5, fontWeight: '700' },
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
  filterChipActive: { backgroundColor: '#F2701E', borderColor: '#F2701E' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  filterChipTextActive: { color: '#FFF', fontWeight: '700' },
  emptyRecipes: { alignItems: 'center', padding: 32, backgroundColor: '#FFF', borderRadius: 16 },
  emptyRecipesText: { fontSize: 15, color: '#888' },
  recipesGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  recipeCard: { width: '47%', backgroundColor: '#FFF', borderRadius: 12, marginHorizontal: '1.5%', marginBottom: 12, overflow: 'hidden' },
  recipeImage: { width: '100%', height: 120 },
  premiumBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(13,43,99,0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  premiumBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  recipeTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', padding: 10, paddingBottom: 4 },
  recipeMeta: { fontSize: 12, color: '#888', paddingHorizontal: 10, paddingBottom: 6 },
  recipeStatsWrap: { paddingHorizontal: 10, paddingBottom: 10 },
});
