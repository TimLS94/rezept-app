import { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  Alert,
  Modal,
  ActivityIndicator,
  Share,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { getRecipeById, Recipe, totalTime, isQuick, isBudget, CUISINES, labelsFor, EQUIPMENT } from '../../data/recipes';
import { supabase, getCurrentUser } from '../../lib/supabase';
import { addRecipesToShoppingList } from '../../lib/shopping';
import {
  fetchDbRecipeById,
  fetchPurchasedRecipes,
  removeRecipeFromCookbook,
  saveRecipeToCookbook,
  setRecipePaid,
} from '../../lib/recipes';
import { copyRecipeToCookbook, fetchMyRecipeById } from '../../lib/myRecipes';
import { FEATURES } from '../../lib/features';
import { useAuth, canUploadRecipes } from '../../lib/auth';
import { useFavorites } from '../../lib/favorites';
import ImageViewer from '../../components/ImageViewer';
import Paywall from '../../components/Paywall';
import { purchaseRecipe, purchaseCreatorSubscription } from '../../lib/purchases';
import { usd, findRecipeTier, findCreatorSubTier } from '../../lib/pricing';
import { goBackOr } from '../../lib/nav';
import NutritionStrip from '../../components/NutritionStrip';
import { shareRecipe } from '../../lib/share';
import { HEADER_TOP } from '../../lib/layout';
import { caloriesLabel } from '../../lib/nutrition';

type FamilyMember = {
  id: string;
  name: string;
  age: string;
  gender: 'male' | 'female';
  weight: string;
  portionMultiplier: number;
};

const calculateBasePortion = (member: FamilyMember): number => {
  const weight = parseFloat(member.weight) || 150;
  const age = parseInt(member.age) || 30;
  const weightKg = weight * 0.453592;
  let bmr: number;
  if (member.gender === 'male') {
    bmr = 10 * weightKg + 6.25 * 170 - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * 160 - 5 * age - 161;
  }
  return (bmr * 1.5) / 2000;
};

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const localRecipe = getRecipeById(id || '');

  const { isFavorite, toggleFavorite } = useFavorites();
  const { role, isGuest, user, refresh } = useAuth();
  const [showPaywall, setShowPaywall] = useState(false);
  const [recipe, setRecipe] = useState<Recipe | undefined>(localRecipe);
  const [servings, setServings] = useState(localRecipe?.servings || 4);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [showPortionModal, setShowPortionModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'ingredients' | 'steps'>('ingredients');
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [togglingPaid, setTogglingPaid] = useState(false);
  
  // Check if current user is the recipe owner (can edit)
  const [isOwner, setIsOwner] = useState(false);

  // Paywall: paid recipes are locked unless you bought them from the creator.
  // Trust the server's lock flag (get_recipe_full already stripped the content);
  // fall back to the client check for local/seed recipes that don't carry it.
  // App Premium is intentionally not part of this — it doesn't unlock creator
  // content, so treating it as an unlock here would show steps the server would
  // refuse to send.
  const locked = recipe?.locked ?? (!!recipe?.isPaid && !canUploadRecipes(role));
  
  // Guest mode: can see preview but not full recipe details
  const guestLocked = isGuest;

  useEffect(() => {
    loadFamilyMembers();
  }, []);

  // True while we are still looking. Without it "not found" and "not loaded
  // yet" are the same state, and the screen can only ever show a spinner.
  const [resolving, setResolving] = useState(!localRecipe && !!id);

  // Fades the status-bar scrim in over the last 60pt of the hero.
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrimOpacity = scrollY.interpolate({
    inputRange: [180, 240],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Uploaded recipes aren't in the local catalogue — fetch them from Supabase.
  useEffect(() => {
    if (localRecipe || !id) return;
    setResolving(true);
    (async () => {
      try {
        const r = await fetchDbRecipeById(id);
        if (r) {
          setRecipe(r);
          setServings(r.servings);
          return;
        }
        // Nothing live under that id. If the user bought it and the creator has
        // since deleted it, the copy taken at purchase is still theirs — serve
        // that rather than a "not found" for something they paid for.
        const owned = await fetchPurchasedRecipes();
        const snapshot = owned.find(p => p.id === id);
        if (snapshot) {
          setRecipe(snapshot);
          setServings(snapshot.servings);
          return;
        }
        // Still nothing. One id space this screen has never covered is the
        // user's own cookbook, and links to it do arrive here — from the meal
        // planner, for one. Send them where the recipe actually lives instead
        // of showing "not found" for something they wrote themselves.
        const mine = await fetchMyRecipeById(id);
        if (mine) {
          router.replace(`/cookbook/${id}`);
          return;
        }
      } finally {
        setResolving(false);
      }
    })();
  }, [id, localRecipe]);

  // Which purchase is in flight, so all three buttons disable together and the
  // pressed one can show its own progress label.
  const [buying, setBuying] = useState<'recipe' | 'creator' | null>(null);

  // Whether this creator recipe sits in the user's cookbook. Purchases are in
  // there unconditionally; this tracks the free save on top of that.
  const [savedToCookbook, setSavedToCookbook] = useState(false);
  const [savingToCookbook, setSavingToCookbook] = useState(false);

  useEffect(() => {
    if (!id || !user) {
      setSavedToCookbook(false);
      return;
    }
    supabase
      .from('cookbook_saves')
      .select('recipe_id')
      .eq('user_id', user.id)
      .eq('recipe_id', id)
      .maybeSingle()
      .then(({ data }) => setSavedToCookbook(!!data));
  }, [id, user]);

  const toggleCookbookSave = async () => {
    if (!id || savingToCookbook) return;
    setSavingToCookbook(true);
    const result = savedToCookbook
      ? await removeRecipeFromCookbook(id)
      : await saveRecipeToCookbook(id);
    setSavingToCookbook(false);
    if ('error' in result) {
      Alert.alert('Could not update cookbook', result.error);
      return;
    }
    setSavedToCookbook(!savedToCookbook);
  };

  const [copying, setCopying] = useState(false);

  const copyToCookbook = async () => {
    if (!recipe || copying) return;
    setCopying(true);
    const result = await copyRecipeToCookbook(recipe);
    setCopying(false);
    if ('error' in result) {
      Alert.alert('Could not copy', result.error);
      return;
    }
    Alert.alert('Copied to your cookbook', 'Your copy is yours to edit — the original stays as it is.', [
      { text: 'Later', style: 'cancel' },
      { text: 'Edit now', onPress: () => router.push(`/cookbook/${result.id}`) },
    ]);
  };

  // Shared tail for both creator-priced purchases: report, then re-fetch so the
  // server hands back the unlocked recipe.
  const finishPurchase = async (
    outcome: { result: string; error?: string },
    cancelledOk: string,
  ) => {
    if (outcome.result === 'success') {
      await reloadAfterPurchase();
      Alert.alert('Unlocked 🎉', cancelledOk);
    } else if (outcome.result === 'unavailable') {
      Alert.alert(
        'Not available yet',
        "In-app purchases aren't active in this build. They work once the price tiers are registered as products in RevenueCat.",
      );
    } else if (outcome.result === 'error') {
      Alert.alert('Purchase failed', outcome.error ?? 'Please try again later.');
    }
    // 'cancelled' is the user's own choice — no alert.
  };

  const buyThisRecipe = async () => {
    if (!recipe?.unlockPriceCents || !id) return;
    const tier = findRecipeTier(recipe.unlockPriceCents);
    if (!tier) {
      // A price that isn't a known tier has no store product behind it, so
      // there is nothing we could charge — better to say so than to fail late.
      Alert.alert('Unavailable', 'This price is not currently purchasable.');
      return;
    }
    setBuying('recipe');
    try {
      const outcome = await purchaseRecipe(id, tier.cents, tier.productId);
      await finishPurchase(outcome, 'This recipe is yours to keep.');
    } finally {
      setBuying(null);
    }
  };

  const buyCreatorSub = async () => {
    const creatorId = recipe?.influencer.id;
    if (!recipe?.creatorSubPriceCents || !creatorId) return;
    const tier = findCreatorSubTier(recipe.creatorSubPriceCents);
    if (!tier) {
      Alert.alert('Unavailable', 'This price is not currently purchasable.');
      return;
    }
    setBuying('creator');
    try {
      const outcome = await purchaseCreatorSubscription(creatorId, tier.cents, tier.productId);
      await finishPurchase(outcome, `You now have access to all of ${recipe.influencer.name}'s recipes.`);
    } finally {
      setBuying(null);
    }
  };

  // After a successful purchase, re-check access and re-fetch the recipe so the
  // now-unlocked full content (server-gated) replaces the teaser.
  const reloadAfterPurchase = async () => {
    await refresh();
    if (id) {
      const r = await fetchDbRecipeById(id);
      if (r) { setRecipe(r); setServings(r.servings); }
    }
  };

  // Check if user owns this recipe
  useEffect(() => {
    const checkOwnership = async () => {
      if (!id || !user) {
        setIsOwner(false);
        return;
      }
      const { data } = await supabase
        .from('recipes')
        .select('influencer_id')
        .eq('id', id)
        .single();
      setIsOwner(data?.influencer_id === user.id);
    };
    checkOwnership();
  }, [id, user]);

  const togglePaidStatus = async () => {
    if (!recipe || !id) return;
    setTogglingPaid(true);
    const newStatus = !recipe.isPaid;
    const result = await setRecipePaid(id, newStatus);
    if ('ok' in result) {
      setRecipe({ ...recipe, isPaid: newStatus });
      Alert.alert('Updated', newStatus ? 'Recipe is now premium' : 'Recipe is now free');
    } else {
      Alert.alert('Error', result.error);
    }
    setTogglingPaid(false);
  };

  // Share a recipe with friends — free recipes only. Premium content stays
  // behind the paywall and cannot be shared out.
  const shareThis = () => recipe && shareRecipe(recipe, 'creator');

  const loadFamilyMembers = async () => {
    const user = await getCurrentUser();
    if (!user) return;

    const { data } = await supabase
      .from('family_members')
      .select('*')
      .eq('profile_id', user.id);

    if (data) {
      setFamilyMembers(data.map(m => ({
        id: m.id,
        name: m.name,
        age: m.age?.toString() || '',
        gender: m.gender || 'male',
        weight: m.weight?.toString() || '',
        portionMultiplier: m.portion_multiplier || 1.0,
      })));
    }
  };

  const calculateFamilyPortions = () => {
    const members = selectedMembers.length > 0 
      ? familyMembers.filter(m => selectedMembers.includes(m.id))
      : familyMembers;
    
    return members.reduce((total, member) => {
      const base = calculateBasePortion(member);
      return total + (base * member.portionMultiplier);
    }, 0);
  };

  const applyFamilyPortions = () => {
    const portions = calculateFamilyPortions();
    const newServings = Math.ceil(portions);
    setServings(newServings);
    setShowPortionModal(false);
  };

  const toggleMember = (id: string) => {
    if (selectedMembers.includes(id)) {
      setSelectedMembers(selectedMembers.filter(m => m !== id));
    } else {
      setSelectedMembers([...selectedMembers, id]);
    }
  };

  const getScaledAmount = (amount: number): string => {
    const scale = servings / (recipe?.servings || 4);
    const scaled = amount * scale;
    
    // Format nicely
    if (scaled === Math.floor(scaled)) return scaled.toString();
    if (scaled < 1) {
      // Convert to fractions
      if (Math.abs(scaled - 0.25) < 0.05) return '¼';
      if (Math.abs(scaled - 0.33) < 0.05) return '⅓';
      if (Math.abs(scaled - 0.5) < 0.05) return '½';
      if (Math.abs(scaled - 0.66) < 0.05) return '⅔';
      if (Math.abs(scaled - 0.75) < 0.05) return '¾';
    }
    return scaled.toFixed(1).replace('.0', '');
  };

  const addToShoppingList = async () => {
    if (!recipe) return;

    const result = await addRecipesToShoppingList([{ recipe, servings }]);
    if ('error' in result) {
      Alert.alert('Error', 'Please log in to add to shopping list');
      return;
    }

    Alert.alert(
      'Added to Shopping List! 🛒',
      `${recipe.ingredients.length} ingredients added for ${servings} servings`,
      [
        { text: 'Keep Browsing', style: 'cancel' },
        { text: 'View List', onPress: () => router.push('/shopping') }
      ]
    );
  };

  if (!recipe) {
    // Spinning forever was the old behaviour whenever an id resolved to
    // nothing here — a recipe from the cookbook, for instance, which lives in
    // my_recipes and was never findable on this screen. A screen that cannot
    // load something has to say so.
    if (!resolving) {
      return (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>🤔</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#1A1A1A' }}>Recipe not found</Text>
          <Text style={{ fontSize: 14, color: '#888', textAlign: 'center', marginTop: 6 }}>
            It may have been deleted, or the link is out of date.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#F2701E', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, marginTop: 20 }}
            onPress={() => goBackOr('/home')}
          >
            <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '700' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#F2701E" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.View
        pointerEvents="none"
        style={[styles.statusScrim, { opacity: scrimOpacity }]}
      />
      {/* Animated.ScrollView, not ScrollView. An Animated.event with
          useNativeDriver: true is wired up on the native side, and that only
          works on a component Animated has wrapped — a plain ScrollView hands
          the native animation module a view it cannot resolve, and the app dies
          on the first scroll event. Natively, so nothing reaches the error
          boundary and nothing is ever written to app_errors. */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
      >
        {/* Hero Image */}
        <View style={styles.heroContainer}>
          <TouchableOpacity activeOpacity={0.95} onPress={() => setViewerUri(recipe.image)}>
            <Image source={{ uri: recipe.image }} style={styles.heroImage} />
          </TouchableOpacity>
          <View style={styles.heroOverlay} pointerEvents="none" />
          <TouchableOpacity style={styles.backButton} onPress={() => goBackOr('/home')}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          {!recipe.isPaid && (
            <TouchableOpacity style={styles.shareButton} onPress={shareThis}>
              <Text style={styles.shareButtonText}>📤</Text>
            </TouchableOpacity>
          )}
          <View style={styles.heroContent}>
            <View style={styles.badges}>
              {isQuick(recipe) && (
                <View style={[styles.badge, { backgroundColor: '#F2701E' }]}>
                  <Text style={styles.badgeText}>⚡ Quick</Text>
                </View>
              )}
              {isBudget(recipe) && (
                <View style={[styles.badge, { backgroundColor: '#3C8D40' }]}>
                  <Text style={styles.badgeText}>💰 Budget</Text>
                </View>
              )}
              {recipe.kidApproved && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>👶 Kid Approved</Text>
                </View>
              )}
              {labelsFor(recipe.cuisines, CUISINES).map(c => (
                <View key={c} style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
                  <Text style={styles.badgeText}>{c}</Text>
                </View>
              ))}
              <View style={[styles.badge, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
                <Text style={styles.badgeText}>{recipe.difficulty}</Text>
              </View>
            </View>
            <Text style={styles.heroTitle}>{recipe.title}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.metaItem}>⏱ {totalTime(recipe)} min total</Text>
              {caloriesLabel(recipe) && (
                <Text style={styles.metaItem}>🔥 {caloriesLabel(recipe)}</Text>
              )}
              {FEATURES.budget && (
                <Text style={styles.metaItem}>💰 ${recipe.cost.toFixed(2)}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Influencer */}
        <View style={styles.influencerBar}>
          <Image source={{ uri: recipe.influencer.avatar }} style={styles.influencerAvatar} />
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => router.push(`/creator/${recipe.influencer.id || recipe.influencer.handle.replace(/^@/, '')}`)}
          >
            <Text style={styles.influencerName}>{recipe.influencer.name}</Text>
            <Text style={styles.influencerHandle}>{recipe.influencer.handle} ›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={() => toggleFavorite(recipe)}
          >
            <Text style={[styles.favoriteIcon, isFavorite(recipe.id) && styles.favoriteIconActive]}>
              {isFavorite(recipe.id) ? '♥' : '♡'}
            </Text>
          </TouchableOpacity>
          {!isOwner && (
            <TouchableOpacity
              style={[styles.cookbookButton, savedToCookbook && styles.cookbookButtonActive]}
              onPress={toggleCookbookSave}
              disabled={savingToCookbook}
            >
              <Text style={styles.cookbookButtonText}>
                {savedToCookbook ? '📚' : '📖'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Time breakdown */}
        <View style={styles.timeCard}>
          <View style={styles.timeItem}>
            <Text style={styles.timeValue}>{recipe.prepTime}<Text style={styles.timeUnit}> min</Text></Text>
            <Text style={styles.timeLabel}>Prep</Text>
          </View>
          <View style={styles.timeDivider} />
          <View style={styles.timeItem}>
            <Text style={styles.timeValue}>{recipe.cookTime}<Text style={styles.timeUnit}> min</Text></Text>
            <Text style={styles.timeLabel}>Cook</Text>
          </View>
          <View style={styles.timeDivider} />
          <View style={styles.timeItem}>
            <Text style={[styles.timeValue, { color: '#F2701E' }]}>{totalTime(recipe)}<Text style={styles.timeUnit}> min</Text></Text>
            <Text style={styles.timeLabel}>Total</Text>
          </View>
        </View>

        {/* Creator Controls - only visible to recipe owner */}
        {isOwner && (
          <View style={styles.creatorControls}>
            <TouchableOpacity 
              style={styles.editRecipeButton}
              onPress={() => router.push(`/creator/edit/${id}`)}
            >
              <Text style={styles.editRecipeButtonText}>✏️ Edit Recipe</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.paidToggle, recipe.isPaid && styles.paidToggleActive]}
              onPress={togglePaidStatus}
              disabled={togglingPaid}
            >
              {togglingPaid ? (
                <ActivityIndicator size="small" color={recipe.isPaid ? '#FFF' : '#F2701E'} />
              ) : (
                <Text style={[styles.paidToggleText, recipe.isPaid && styles.paidToggleTextActive]}>
                  {recipe.isPaid ? '💎 Premium' : '🆓 Free'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Servings Adjuster */}
        <View style={styles.servingsCard}>
          <View style={styles.servingsLeft}>
            <Text style={styles.servingsLabel}>Servings</Text>
            <View style={styles.servingsControl}>
              <TouchableOpacity 
                style={styles.servingsButton}
                onPress={() => setServings(Math.max(1, servings - 1))}
              >
                <Text style={styles.servingsButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.servingsNumber}>{servings}</Text>
              <TouchableOpacity 
                style={styles.servingsButton}
                onPress={() => setServings(servings + 1)}
              >
                <Text style={styles.servingsButtonText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.familyButton}
            onPress={() => setShowPortionModal(true)}
          >
            <Text style={styles.familyButtonText}>👨‍👩‍👧‍👦 Calculate for Family</Text>
          </TouchableOpacity>
        </View>

        {/* Guest lock — prompt sign in to see full recipe */}
        {guestLocked ? (
          <View style={styles.lockedCard}>
            <Text style={styles.lockedIcon}>👤</Text>
            <Text style={styles.lockedTitle}>Sign in to see full recipe</Text>
            <Text style={styles.lockedText}>
              Create a free account to view ingredients, cooking steps, and save recipes to your favorites.
            </Text>
            <TouchableOpacity
              style={styles.lockedButton}
              onPress={() => router.push('/login')}
            >
              <Text style={styles.lockedButtonText}>Sign in for free</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.guestContinueLink}
              onPress={() => goBackOr('/home')}
            >
              <Text style={styles.guestContinueLinkText}>Continue browsing</Text>
            </TouchableOpacity>
          </View>
        ) : locked ? (
          <View style={styles.teaserWrap}>
            {recipe.description ? (
              <Text style={styles.teaserDesc}>{recipe.description}</Text>
            ) : null}
            <View style={styles.teaserCounts}>
              <Text style={styles.teaserCount}>🥘 {recipe.ingredientsCount ?? recipe.ingredients.length} ingredients</Text>
              <Text style={styles.teaserCount}>👨‍🍳 {recipe.stepsCount ?? recipe.steps.length} steps</Text>
            </View>

            {recipe.ingredients.length > 0 && (
              <View style={styles.teaserPreview}>
                <Text style={styles.teaserPreviewLabel}>INGREDIENTS · PREVIEW</Text>
                {recipe.ingredients.slice(0, 3).map((ing, i) => (
                  <Text key={i} style={styles.teaserIngredient}>
                    • {ing.amount ? `${ing.amount} ${ing.unit} ` : ''}{ing.name}
                  </Text>
                ))}
                {(recipe.ingredientsCount ?? recipe.ingredients.length) > 3 && (
                  <Text style={styles.teaserMore}>🔒 + {(recipe.ingredientsCount ?? recipe.ingredients.length) - 3} more ingredients & all steps</Text>
                )}
              </View>
            )}

            <View style={styles.lockedCard}>
              <Text style={styles.lockedIcon}>🔒</Text>
              <Text style={styles.lockedTitle}>Premium recipe</Text>
              <Text style={styles.lockedText}>
                Unlock the full ingredient list and all step-by-step instructions.
              </Text>

              {/* Cheapest, most specific option first: this one recipe. Each
                  route is only offered if the creator actually priced it. */}
              {recipe.unlockPriceCents != null && (
                <TouchableOpacity
                  style={styles.lockedButton}
                  onPress={buyThisRecipe}
                  disabled={buying !== null}
                >
                  <Text style={styles.lockedButtonText}>
                    {buying === 'recipe' ? 'Purchasing…' : `Buy this recipe · ${usd(recipe.unlockPriceCents)}`}
                  </Text>
                </TouchableOpacity>
              )}

              {recipe.creatorSubPriceCents != null && recipe.influencer.id && (
                <TouchableOpacity
                  style={styles.lockedButtonAlt}
                  onPress={buyCreatorSub}
                  disabled={buying !== null}
                >
                  <Text style={styles.lockedButtonAltText}>
                    {buying === 'creator'
                      ? 'Subscribing…'
                      : `All of ${recipe.influencer.name}'s recipes · ${usd(recipe.creatorSubPriceCents)}/mo`}
                  </Text>
                </TouchableOpacity>
              )}

              {/* No "unlock with Premium" option here on purpose: app Premium
                  buys app features, not creator content. Offering it would take
                  money for something that wouldn't unlock this page. */}
              <Text style={styles.lockedNote}>
                This is {recipe.influencer.name}'s recipe — your payment goes to them,
                not to the app. App Premium covers features like Fridge Scan and
                doesn't include creator recipes.
              </Text>
            </View>
          </View>
        ) : (
        <>
        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'ingredients' && styles.tabActive]}
            onPress={() => setActiveTab('ingredients')}
          >
            <Text style={[styles.tabText, activeTab === 'ingredients' && styles.tabTextActive]}>
              Ingredients ({recipe.ingredients.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'steps' && styles.tabActive]}
            onPress={() => setActiveTab('steps')}
          >
            <Text style={[styles.tabText, activeTab === 'steps' && styles.tabTextActive]}>
              Steps ({recipe.steps.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {/* Above the tabs, not inside one: it changes whether this recipe can
            be cooked at all, and finding out at step four that it wants an air
            fryer is finding out too late. Absent on most recipes — the model is
            told to list only what a kitchen does not simply have. */}
        {!!recipe.equipment?.length && (
          <View style={styles.equipmentRow}>
            <Text style={styles.equipmentLabel}>You'll need</Text>
            <Text style={styles.equipmentList}>{labelsFor(recipe.equipment, EQUIPMENT).join(' · ')}</Text>
          </View>
        )}
        {activeTab === 'ingredients' ? (
          <View style={styles.ingredientsList}>
            {recipe.ingredients.map((ing, index) => (
              <View key={index} style={styles.ingredientRow}>
                <View style={styles.ingredientAmount}>
                  <Text style={styles.ingredientAmountText}>
                    {getScaledAmount(ing.amount)} {ing.unit}
                  </Text>
                </View>
                <Text style={styles.ingredientName}>{ing.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.stepsList}>
            {recipe.steps.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepText}>{step}</Text>
                  {recipe.stepImages?.[index] ? (
                    <TouchableOpacity activeOpacity={0.9} onPress={() => setViewerUri(recipe.stepImages![index]!)}>
                      <Image source={{ uri: recipe.stepImages[index]! }} style={styles.stepImage} contentFit="cover" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
        </>
        )}

        {/* Save buttons at bottom */}
        {!locked && !guestLocked && !isOwner && (
          <View style={styles.saveButtonsRow}>
            <TouchableOpacity
              style={[styles.saveButton, isFavorite(recipe.id) && styles.saveButtonActive]}
              onPress={() => toggleFavorite(recipe)}
            >
              <Text style={styles.saveButtonIcon}>{isFavorite(recipe.id) ? '❤️' : '🤍'}</Text>
              <Text style={[styles.saveButtonText, isFavorite(recipe.id) && styles.saveButtonTextActive]}>
                {isFavorite(recipe.id) ? 'Favorited' : 'Favorite'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, savedToCookbook && styles.saveButtonActive]}
              onPress={toggleCookbookSave}
              disabled={savingToCookbook}
            >
              <Text style={styles.saveButtonIcon}>{savedToCookbook ? '📚' : '📖'}</Text>
              <Text style={[styles.saveButtonText, savedToCookbook && styles.saveButtonTextActive]}>
                {savedToCookbook ? 'In Cookbook' : 'Add to Cookbook'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Nutrition, with its provenance attached. */}
        <NutritionStrip nutrition={recipe.nutrition} calories={recipe.calories} />

        <View style={styles.bottomSpacer} />
      </Animated.ScrollView>

      {/* Bottom Action */}
      {!locked && !guestLocked && (
        <View style={styles.bottomAction}>
          <View style={styles.actionRow}>
            {/* Carries the portion count the user picked above into cook mode,
                so the scaled amounts they just saw are the ones they cook with. */}
            <TouchableOpacity
              style={styles.cookButton}
              onPress={() => router.push(`/cook/${id}?source=creator&servings=${servings}`)}
            >
              <Text style={styles.cookButtonText}>👨‍🍳 Cook</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addToCartButton} onPress={addToShoppingList}>
              <Text style={styles.addToCartText}>🛒 Shopping List</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Family Portion Modal */}
      <Modal visible={showPortionModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Calculate for Family</Text>
            <Text style={styles.modalSubtitle}>
              Select who's eating (or leave empty for everyone)
            </Text>

            {familyMembers.length === 0 ? (
              <View style={styles.emptyFamily}>
                <Text style={styles.emptyFamilyText}>No family members yet</Text>
                <TouchableOpacity 
                  style={styles.addFamilyButton}
                  onPress={() => {
                    setShowPortionModal(false);
                    router.push('/profile');
                  }}
                >
                  <Text style={styles.addFamilyButtonText}>+ Add Family Members</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {familyMembers.map((member) => (
                  <TouchableOpacity
                    key={member.id}
                    style={[
                      styles.memberOption,
                      selectedMembers.includes(member.id) && styles.memberOptionSelected
                    ]}
                    onPress={() => toggleMember(member.id)}
                  >
                    <Text style={styles.memberOptionEmoji}>
                      {member.gender === 'male' ? '👨' : '👩'}
                    </Text>
                    <View style={styles.memberOptionInfo}>
                      <Text style={styles.memberOptionName}>{member.name}</Text>
                      <Text style={styles.memberOptionDetails}>
                        {(calculateBasePortion(member) * member.portionMultiplier).toFixed(1)}x portion
                      </Text>
                    </View>
                    <View style={[
                      styles.memberCheckbox,
                      selectedMembers.includes(member.id) && styles.memberCheckboxChecked
                    ]}>
                      {selectedMembers.includes(member.id) && (
                        <Text style={styles.memberCheckmark}>✓</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}

                <View style={styles.portionResult}>
                  <Text style={styles.portionResultLabel}>Calculated Servings:</Text>
                  <Text style={styles.portionResultValue}>
                    {Math.ceil(calculateFamilyPortions())} servings
                  </Text>
                </View>
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton}
                onPress={() => setShowPortionModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              {familyMembers.length > 0 && (
                <TouchableOpacity 
                  style={styles.modalApplyButton}
                  onPress={applyFamilyPortions}
                >
                  <Text style={styles.modalApplyText}>Apply</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <ImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
      <Paywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSubscribed={reloadAfterPurchase}
        creatorName={recipe?.influencer.name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  heroContainer: { height: 300, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  shareButton: { position: 'absolute', top: 50, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },
  shareButtonText: { fontSize: 18 },
  backButton: { position: 'absolute', top: HEADER_TOP, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },
  backButtonText: { fontSize: 20, color: '#1A1A1A' },
  heroContent: { position: 'absolute', bottom: 20, left: 20, right: 20 },
  badges: { flexDirection: 'row', marginBottom: 10 },
  badge: { backgroundColor: '#F2701E', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 8 },
  badgeText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  heroTitle: { fontSize: 24, fontWeight: '700', color: '#FFF', marginBottom: 10 },
  heroMeta: { flexDirection: 'row' },
  metaItem: { color: 'rgba(255,255,255,0.9)', fontSize: 14, marginRight: 16 },
  influencerBar: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  influencerAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  influencerName: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  influencerHandle: { fontSize: 12, color: '#888' },
  favoriteButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF5F0' },
  favoriteIcon: { fontSize: 24, color: '#FFB39C' },
  favoriteIconActive: { color: '#F2701E' },
  cookbookButton: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F5FF', marginLeft: 8 },
  cookbookButtonActive: { backgroundColor: '#E8F5E9' },
  cookbookButtonText: { fontSize: 20 },
  saveButtonsRow: { flexDirection: 'row', marginHorizontal: 16, marginTop: 16, gap: 12 },
  saveButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E4D9CB', backgroundColor: '#FFF' },
  saveButtonActive: { backgroundColor: '#FFF5F0', borderColor: '#F2701E' },
  saveButtonIcon: { fontSize: 18, marginRight: 8 },
  saveButtonText: { fontSize: 14, fontWeight: '600', color: '#666' },
  saveButtonTextActive: { color: '#F2701E' },
  servingsCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', margin: 16, padding: 16, borderRadius: 16 },
  servingsLeft: {},
  servingsLabel: { fontSize: 12, color: '#888', marginBottom: 8 },
  servingsControl: { flexDirection: 'row', alignItems: 'center' },
  servingsButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  servingsButtonText: { fontSize: 20, color: '#1A1A1A' },
  servingsNumber: { fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginHorizontal: 20 },
  familyButton: { backgroundColor: '#FFE0B2', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  familyButtonText: { fontSize: 13, fontWeight: '600', color: '#F2701E' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#F5F5F5', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#FFF' },
  tabText: { fontSize: 14, color: '#888', fontWeight: '500' },
  tabTextActive: { color: '#1A1A1A', fontWeight: '600' },
  equipmentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    marginHorizontal: 20, marginBottom: 12, paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: '#FFF4EC', borderRadius: 12,
  },
  equipmentLabel: { fontSize: 12, fontWeight: '700', color: '#B84B08', textTransform: 'uppercase', letterSpacing: 0.5 },
  equipmentList: { flex: 1, fontSize: 14, color: '#4A4A4A' },
  ingredientsList: { padding: 16 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  ingredientAmount: { width: 80, backgroundColor: '#F5F5F5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 12 },
  ingredientAmountText: { fontSize: 13, fontWeight: '600', color: '#F2701E', textAlign: 'center' },
  ingredientName: { fontSize: 16, color: '#1A1A1A', flex: 1 },
  stepsList: { padding: 16 },
  stepRow: { flexDirection: 'row', marginBottom: 20 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F2701E', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  stepNumberText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  stepText: { fontSize: 15, color: '#1A1A1A', lineHeight: 22 },
  stepImage: { width: '100%', height: 170, borderRadius: 12, marginTop: 10 },
  // Tall enough to clear the fixed bottom bar. At 100 the "Favorite" and
  // "Add to cookbook" buttons ended up underneath it and could not be reached.
  bottomSpacer: { height: 190 },
  statusScrim: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: HEADER_TOP,
    backgroundColor: '#FFF',
    zIndex: 5,
  },
  bottomAction: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  copyButton: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D9CB',
    alignItems: 'center',
  },
  copyButtonText: { color: '#0D2B63', fontSize: 15, fontWeight: '600' },
  copyButtonOn: { backgroundColor: '#0D2B63', borderColor: '#0D2B63' },
  copyButtonTextOn: { color: '#FFF' },

  actionRow: { flexDirection: 'row', gap: 10 },
  cookButton: { flex: 1, backgroundColor: '#0D2B63', padding: 18, borderRadius: 14, alignItems: 'center' },
  cookButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  addToCartButton: { flex: 1.3, backgroundColor: '#F2701E', padding: 18, borderRadius: 14, alignItems: 'center' },
  addToCartText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: '#888', marginBottom: 20 },
  emptyFamily: { alignItems: 'center', padding: 24 },
  emptyFamilyText: { fontSize: 16, color: '#888', marginBottom: 16 },
  addFamilyButton: { backgroundColor: '#F2701E', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  addFamilyButtonText: { color: '#FFF', fontWeight: '600' },
  memberOption: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#F5F5F5', borderRadius: 12, marginBottom: 10 },
  memberOptionSelected: { backgroundColor: '#FFE0B2' },
  memberOptionEmoji: { fontSize: 28, marginRight: 14 },
  memberOptionInfo: { flex: 1 },
  memberOptionName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  memberOptionDetails: { fontSize: 13, color: '#888' },
  memberCheckbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#DDD', justifyContent: 'center', alignItems: 'center' },
  memberCheckboxChecked: { backgroundColor: '#F2701E', borderColor: '#F2701E' },
  memberCheckmark: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  portionResult: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 16, borderRadius: 12, marginTop: 10 },
  portionResultLabel: { fontSize: 14, color: '#3C8D40' },
  portionResultValue: { fontSize: 18, fontWeight: '700', color: '#3C8D40' },
  modalButtons: { flexDirection: 'row', marginTop: 20 },
  modalCancelButton: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#F5F5F5', alignItems: 'center', marginRight: 8 },
  modalCancelText: { fontSize: 16, fontWeight: '600', color: '#666' },
  modalApplyButton: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#F2701E', alignItems: 'center' },
  modalApplyText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  timeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 16, borderRadius: 16, paddingVertical: 16, borderWidth: 1, borderColor: '#F0EAE0' },
  timeItem: { flex: 1, alignItems: 'center' },
  timeValue: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  timeUnit: { fontSize: 13, fontWeight: '500', color: '#888' },
  timeLabel: { fontSize: 12, color: '#888', marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  timeDivider: { width: 1, height: 32, backgroundColor: '#EEE' },
  teaserWrap: { paddingBottom: 8 },
  teaserDesc: { fontSize: 15, color: '#444', lineHeight: 22, marginHorizontal: 20, marginTop: 16 },
  teaserCounts: { flexDirection: 'row', gap: 18, marginHorizontal: 20, marginTop: 14 },
  teaserCount: { fontSize: 14, color: '#666', fontWeight: '600' },
  teaserPreview: { backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 16, padding: 18, borderRadius: 16 },
  teaserPreviewLabel: { fontSize: 11, fontWeight: '700', color: '#F2701E', letterSpacing: 1, marginBottom: 10 },
  teaserIngredient: { fontSize: 15, color: '#333', lineHeight: 26 },
  teaserMore: { fontSize: 14, color: '#999', fontStyle: 'italic', marginTop: 8 },
  lockedCard: { backgroundColor: '#FFF', margin: 16, padding: 24, borderRadius: 16, alignItems: 'center' },
  lockedIcon: { fontSize: 48, marginBottom: 12 },
  lockedTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  lockedText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  lockedButton: { backgroundColor: '#F2701E', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, alignSelf: 'stretch', alignItems: 'center' },
  lockedButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  lockedButtonAlt: {
    backgroundColor: '#FFF9F2', borderWidth: 1, borderColor: '#EFE7DC',
    paddingHorizontal: 20, paddingVertical: 13, borderRadius: 12,
    alignSelf: 'stretch', alignItems: 'center', marginTop: 10,
  },
  lockedButtonAltText: { color: '#0D2B63', fontSize: 14.5, fontWeight: '600', textAlign: 'center' },
  lockedNote: { fontSize: 11.5, color: '#999', lineHeight: 17, textAlign: 'center', marginTop: 14 },
  guestContinueLink: { marginTop: 16, paddingVertical: 8 },
  guestContinueLinkText: { fontSize: 14, color: '#888', fontWeight: '500' },
  creatorControls: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 10, backgroundColor: '#FFF5F0', borderBottomWidth: 1, borderBottomColor: '#FFE0B2' },
  editRecipeButton: { flex: 1, backgroundColor: '#FFF', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#F2701E' },
  editRecipeButtonText: { fontSize: 14, fontWeight: '600', color: '#F2701E' },
  paidToggle: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F2701E' },
  paidToggleActive: { backgroundColor: '#F2701E', borderColor: '#F2701E' },
  paidToggleText: { fontSize: 14, fontWeight: '600', color: '#F2701E' },
  paidToggleTextActive: { color: '#FFF' },
});
