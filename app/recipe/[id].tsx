import { useState, useEffect } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { getRecipeById, Recipe } from '../../data/recipes';
import { supabase } from '../../lib/supabase';
import { addRecipesToShoppingList } from '../../lib/shopping';
import { fetchDbRecipeById, setRecipePaid } from '../../lib/recipes';
import { FEATURES } from '../../lib/features';
import { useAuth, canUploadRecipes } from '../../lib/auth';
import { useFavorites } from '../../lib/favorites';
import ImageViewer from '../../components/ImageViewer';
import Paywall from '../../components/Paywall';

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
  const { isPremium, role, isGuest, user, refresh } = useAuth();
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

  // Paywall: premium-only recipes are locked for non-subscribers. Trust the
  // server's lock flag (get_recipe_full already stripped the content); fall back
  // to the client check for local/seed recipes that don't carry the flag.
  const locked = recipe?.locked ?? (!!recipe?.isPaid && !isPremium && !canUploadRecipes(role));
  
  // Guest mode: can see preview but not full recipe details
  const guestLocked = isGuest;

  useEffect(() => {
    loadFamilyMembers();
  }, []);

  // Uploaded recipes aren't in the local catalogue — fetch them from Supabase.
  useEffect(() => {
    if (localRecipe || !id) return;
    fetchDbRecipeById(id).then(r => {
      if (r) {
        setRecipe(r);
        setServings(r.servings);
      }
    });
  }, [id, localRecipe]);

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
  const shareRecipe = async () => {
    if (!recipe) return;
    if (recipe.isPaid) {
      Alert.alert('Premium recipe', 'Premium recipes are subscriber-only and cannot be shared.');
      return;
    }
    const link = `https://feedfamily.app/recipe/${recipe.id}`;
    const time = recipe.prepTime + recipe.cookTime;
    try {
      await Share.share({
        message: `Check out "${recipe.title}" by ${recipe.influencer.handle} on FeedFamily 🍳\n⏱ ${time} min • 🔥 ${recipe.calories} cal\n\n${link}`,
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const loadFamilyMembers = async () => {
    const { data: { user } } = await supabase.auth.getUser();
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
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#F57C00" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <View style={styles.heroContainer}>
          <TouchableOpacity activeOpacity={0.95} onPress={() => setViewerUri(recipe.image)}>
            <Image source={{ uri: recipe.image }} style={styles.heroImage} />
          </TouchableOpacity>
          <View style={styles.heroOverlay} pointerEvents="none" />
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          {!recipe.isPaid && (
            <TouchableOpacity style={styles.shareButton} onPress={shareRecipe}>
              <Text style={styles.shareButtonText}>📤</Text>
            </TouchableOpacity>
          )}
          <View style={styles.heroContent}>
            <View style={styles.badges}>
              {recipe.kidApproved && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>👶 Kid Approved</Text>
                </View>
              )}
              <View style={[styles.badge, { backgroundColor: '#3C8D40' }]}>
                <Text style={styles.badgeText}>{recipe.difficulty}</Text>
              </View>
            </View>
            <Text style={styles.heroTitle}>{recipe.title}</Text>
            <View style={styles.heroMeta}>
              <Text style={styles.metaItem}>⏱ {recipe.prepTime + recipe.cookTime} min</Text>
              <Text style={styles.metaItem}>🔥 {recipe.calories} cal</Text>
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
                <ActivityIndicator size="small" color={recipe.isPaid ? '#FFF' : '#F57C00'} />
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
              onPress={() => router.back()}
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
              <Text style={styles.teaserCount}>🥘 {recipe.ingredientsCount ?? recipe.ingredients.length} Zutaten</Text>
              <Text style={styles.teaserCount}>👨‍🍳 {recipe.stepsCount ?? recipe.steps.length} Schritte</Text>
            </View>

            {recipe.ingredients.length > 0 && (
              <View style={styles.teaserPreview}>
                <Text style={styles.teaserPreviewLabel}>ZUTATEN · VORSCHAU</Text>
                {recipe.ingredients.slice(0, 3).map((ing, i) => (
                  <Text key={i} style={styles.teaserIngredient}>
                    • {ing.amount ? `${ing.amount} ${ing.unit} ` : ''}{ing.name}
                  </Text>
                ))}
                {(recipe.ingredientsCount ?? recipe.ingredients.length) > 3 && (
                  <Text style={styles.teaserMore}>🔒 + {(recipe.ingredientsCount ?? recipe.ingredients.length) - 3} weitere Zutaten & alle Schritte</Text>
                )}
              </View>
            )}

            <View style={styles.lockedCard}>
              <Text style={styles.lockedIcon}>🔒</Text>
              <Text style={styles.lockedTitle}>Premium-Rezept</Text>
              <Text style={styles.lockedText}>
                Schalte die komplette Zutatenliste und alle Schritt-für-Schritt-Anleitungen frei.
              </Text>
              <TouchableOpacity
                style={styles.lockedButton}
                onPress={() => setShowPaywall(true)}
              >
                <Text style={styles.lockedButtonText}>Premium freischalten</Text>
              </TouchableOpacity>
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

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Action */}
      {!locked && !guestLocked && (
        <View style={styles.bottomAction}>
          <TouchableOpacity style={styles.addToCartButton} onPress={addToShoppingList}>
            <Text style={styles.addToCartText}>🛒 Add to Shopping List</Text>
          </TouchableOpacity>
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
        onSubscribed={refresh}
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
  backButton: { position: 'absolute', top: 50, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },
  backButtonText: { fontSize: 20, color: '#1A1A1A' },
  heroContent: { position: 'absolute', bottom: 20, left: 20, right: 20 },
  badges: { flexDirection: 'row', marginBottom: 10 },
  badge: { backgroundColor: '#F57C00', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 8 },
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
  favoriteIconActive: { color: '#F57C00' },
  servingsCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', margin: 16, padding: 16, borderRadius: 16 },
  servingsLeft: {},
  servingsLabel: { fontSize: 12, color: '#888', marginBottom: 8 },
  servingsControl: { flexDirection: 'row', alignItems: 'center' },
  servingsButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  servingsButtonText: { fontSize: 20, color: '#1A1A1A' },
  servingsNumber: { fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginHorizontal: 20 },
  familyButton: { backgroundColor: '#FFE0B2', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  familyButtonText: { fontSize: 13, fontWeight: '600', color: '#F57C00' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: '#F5F5F5', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#FFF' },
  tabText: { fontSize: 14, color: '#888', fontWeight: '500' },
  tabTextActive: { color: '#1A1A1A', fontWeight: '600' },
  ingredientsList: { padding: 16 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  ingredientAmount: { width: 80, backgroundColor: '#F5F5F5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 12 },
  ingredientAmountText: { fontSize: 13, fontWeight: '600', color: '#F57C00', textAlign: 'center' },
  ingredientName: { fontSize: 16, color: '#1A1A1A', flex: 1 },
  stepsList: { padding: 16 },
  stepRow: { flexDirection: 'row', marginBottom: 20 },
  stepNumber: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F57C00', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  stepNumberText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  stepText: { fontSize: 15, color: '#1A1A1A', lineHeight: 22 },
  stepImage: { width: '100%', height: 170, borderRadius: 12, marginTop: 10 },
  bottomSpacer: { height: 100 },
  bottomAction: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  addToCartButton: { backgroundColor: '#F57C00', padding: 18, borderRadius: 14, alignItems: 'center' },
  addToCartText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: '#888', marginBottom: 20 },
  emptyFamily: { alignItems: 'center', padding: 24 },
  emptyFamilyText: { fontSize: 16, color: '#888', marginBottom: 16 },
  addFamilyButton: { backgroundColor: '#F57C00', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  addFamilyButtonText: { color: '#FFF', fontWeight: '600' },
  memberOption: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#F5F5F5', borderRadius: 12, marginBottom: 10 },
  memberOptionSelected: { backgroundColor: '#FFE0B2' },
  memberOptionEmoji: { fontSize: 28, marginRight: 14 },
  memberOptionInfo: { flex: 1 },
  memberOptionName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  memberOptionDetails: { fontSize: 13, color: '#888' },
  memberCheckbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#DDD', justifyContent: 'center', alignItems: 'center' },
  memberCheckboxChecked: { backgroundColor: '#F57C00', borderColor: '#F57C00' },
  memberCheckmark: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  portionResult: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E8F5E9', padding: 16, borderRadius: 12, marginTop: 10 },
  portionResultLabel: { fontSize: 14, color: '#3C8D40' },
  portionResultValue: { fontSize: 18, fontWeight: '700', color: '#3C8D40' },
  modalButtons: { flexDirection: 'row', marginTop: 20 },
  modalCancelButton: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#F5F5F5', alignItems: 'center', marginRight: 8 },
  modalCancelText: { fontSize: 16, fontWeight: '600', color: '#666' },
  modalApplyButton: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#F57C00', alignItems: 'center' },
  modalApplyText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  teaserWrap: { paddingBottom: 8 },
  teaserDesc: { fontSize: 15, color: '#444', lineHeight: 22, marginHorizontal: 20, marginTop: 16 },
  teaserCounts: { flexDirection: 'row', gap: 18, marginHorizontal: 20, marginTop: 14 },
  teaserCount: { fontSize: 14, color: '#666', fontWeight: '600' },
  teaserPreview: { backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 16, padding: 18, borderRadius: 16 },
  teaserPreviewLabel: { fontSize: 11, fontWeight: '700', color: '#F57C00', letterSpacing: 1, marginBottom: 10 },
  teaserIngredient: { fontSize: 15, color: '#333', lineHeight: 26 },
  teaserMore: { fontSize: 14, color: '#999', fontStyle: 'italic', marginTop: 8 },
  lockedCard: { backgroundColor: '#FFF', margin: 16, padding: 24, borderRadius: 16, alignItems: 'center' },
  lockedIcon: { fontSize: 48, marginBottom: 12 },
  lockedTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  lockedText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  lockedButton: { backgroundColor: '#F57C00', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  lockedButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  guestContinueLink: { marginTop: 16, paddingVertical: 8 },
  guestContinueLinkText: { fontSize: 14, color: '#888', fontWeight: '500' },
  creatorControls: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 10, backgroundColor: '#FFF5F0', borderBottomWidth: 1, borderBottomColor: '#FFE0B2' },
  editRecipeButton: { flex: 1, backgroundColor: '#FFF', paddingVertical: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#F57C00' },
  editRecipeButtonText: { fontSize: 14, fontWeight: '600', color: '#F57C00' },
  paidToggle: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#F57C00' },
  paidToggleActive: { backgroundColor: '#F57C00', borderColor: '#F57C00' },
  paidToggleText: { fontSize: 14, fontWeight: '600', color: '#F57C00' },
  paidToggleTextActive: { color: '#FFF' },
});
