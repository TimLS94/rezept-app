import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  Image,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { FEATURES } from '../../lib/features';
import { useAuth, canUploadRecipes } from '../../lib/auth';
import { Recipe } from '../../data/recipes';

type FamilyMember = {
  id: string;
  name: string;
  age: string;
  gender: 'male' | 'female';
  weight: string;
  portionMultiplier: number;
  dietaryRestrictions: string[];
};

const DIETARY_OPTIONS = [
  'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 
  'Nut Allergy', 'Shellfish Allergy', 'Low Carb', 'Keto'
];

const QUICK_ADD_OPTIONS = [
  { label: '👶 Baby', name: 'Baby', age: '1', gender: 'male' as const, weight: '22' },
  { label: '🧒 Child', name: 'Child', age: '8', gender: 'male' as const, weight: '55' },
  { label: '👦 Teen', name: 'Teen', age: '15', gender: 'male' as const, weight: '130' },
  { label: '👩 Woman', name: 'Woman', age: '35', gender: 'female' as const, weight: '140' },
  { label: '👨 Man', name: 'Man', age: '35', gender: 'male' as const, weight: '180' },
];

// Calculate base portion based on weight, age, gender (simplified BMR-based)
const calculateBasePortion = (member: FamilyMember): number => {
  const weight = parseFloat(member.weight) || 150;
  const age = parseInt(member.age) || 30;
  const weightKg = weight * 0.453592;
  
  // Simplified Mifflin-St Jeor
  let bmr: number;
  if (member.gender === 'male') {
    bmr = 10 * weightKg + 6.25 * 170 - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * 160 - 5 * age - 161;
  }
  
  // Convert to portion multiplier (base 2000 cal = 1.0)
  return (bmr * 1.5) / 2000;
};

type CreatorRecipe = {
  id: string;
  title: string;
  image: string;
  category: string;
  is_paid: boolean;
};

export default function ProfileScreen() {
  const { role, isGuest } = useAuth();
  const isCreator = canUploadRecipes(role);
  
  // Shared state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Creator state
  const [bio, setBio] = useState('');
  const [username, setUsername] = useState('');
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [creatorRecipes, setCreatorRecipes] = useState<CreatorRecipe[]>([]);
  const [editingBio, setEditingBio] = useState(false);
  
  // User state (family members)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [weeklyBudget, setWeeklyBudget] = useState('150');
  
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'male' as 'male' | 'female',
    weight: '',
    dietaryRestrictions: [] as string[],
  });

  useEffect(() => {
    loadProfile();
  }, [role]); // Re-load when role changes

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setUserId(user.id);

      // Load profile data (bio, username for creators)
      const { data: profile } = await supabase
        .from('profiles')
        .select('weekly_budget, bio, username')
        .eq('id', user.id)
        .single();

      if (profile) {
        if (profile.weekly_budget) setWeeklyBudget(profile.weekly_budget.toString());
        if (profile.bio) setBio(profile.bio);
        if (profile.username) setUsername(profile.username);
      }

      if (isCreator) {
        // Load creator's recipes
        const { data: recipes, error: recipesError } = await supabase
          .from('recipes')
          .select('id, title, image_url, is_paid, tags')
          .eq('influencer_id', user.id)
          .order('created_at', { ascending: false });

        console.log('Creator recipes:', recipes, 'Error:', recipesError);

        if (recipes) {
          setCreatorRecipes(recipes.map(r => ({
            id: r.id,
            title: r.title,
            image: r.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
            category: (r.tags && r.tags[0]) || 'Recipe',
            is_paid: r.is_paid || false,
          })));
        }

        // Load subscriber count
        const { count } = await supabase
          .from('creator_subscribers')
          .select('*', { count: 'exact', head: true })
          .eq('creator_id', user.id);

        setSubscriberCount(count || 0);
      } else {
        // Load family members for regular users
        const { data: members } = await supabase
          .from('family_members')
          .select('*')
          .eq('profile_id', user.id);

        if (members) {
          setFamilyMembers(members.map(m => ({
            id: m.id,
            name: m.name,
            age: m.age?.toString() || '',
            gender: m.gender || 'male',
            weight: m.weight?.toString() || '',
            portionMultiplier: m.portion_multiplier || 1.0,
            dietaryRestrictions: m.dietary_restrictions || [],
          })));
        }
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveBio = async () => {
    if (!userId) return;
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ bio })
      .eq('id', userId);
    setSaving(false);
    setEditingBio(false);
  };

  const saveBudget = async (budget: string) => {
    setWeeklyBudget(budget);
    if (!userId) return;
    await supabase
      .from('profiles')
      .update({ weekly_budget: parseFloat(budget) || 150 })
      .eq('id', userId);
  };

  const quickAddMember = async (option: typeof QUICK_ADD_OPTIONS[0]) => {
    if (!userId) return;
    setSaving(true);

    const basePortion = calculateBasePortion({
      ...option,
      id: '',
      portionMultiplier: 1.0,
      dietaryRestrictions: [],
    });

    const { data, error } = await supabase
      .from('family_members')
      .insert({
        profile_id: userId,
        name: option.name,
        age: parseInt(option.age),
        gender: option.gender,
        weight: parseFloat(option.weight),
        portion_multiplier: 1.0,
        dietary_restrictions: [],
      })
      .select()
      .single();

    if (data && !error) {
      setFamilyMembers([...familyMembers, {
        id: data.id,
        name: data.name,
        age: data.age?.toString() || '',
        gender: data.gender || 'male',
        weight: data.weight?.toString() || '',
        portionMultiplier: data.portion_multiplier || 1.0,
        dietaryRestrictions: data.dietary_restrictions || [],
      }]);
    }
    setSaving(false);
  };

  const saveMember = async () => {
    if (!formData.name || !formData.age) {
      Alert.alert('Error', 'Please fill in name and age');
      return;
    }
    if (!userId) return;

    setSaving(true);

    const memberData = {
      profile_id: userId,
      name: formData.name,
      age: parseInt(formData.age),
      gender: formData.gender,
      weight: parseFloat(formData.weight) || null,
      portion_multiplier: editingMember?.portionMultiplier || 1.0,
      dietary_restrictions: formData.dietaryRestrictions,
    };

    if (editingMember) {
      // Update existing
      const { error } = await supabase
        .from('family_members')
        .update(memberData)
        .eq('id', editingMember.id);

      if (!error) {
        setFamilyMembers(familyMembers.map(m => 
          m.id === editingMember.id 
            ? { ...m, ...formData, portionMultiplier: m.portionMultiplier }
            : m
        ));
      }
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('family_members')
        .insert(memberData)
        .select()
        .single();

      if (data && !error) {
        setFamilyMembers([...familyMembers, {
          id: data.id,
          name: data.name,
          age: data.age?.toString() || '',
          gender: data.gender || 'male',
          weight: data.weight?.toString() || '',
          portionMultiplier: data.portion_multiplier || 1.0,
          dietaryRestrictions: data.dietary_restrictions || [],
        }]);
      }
    }

    closeForm();
    setSaving(false);
  };

  const removeMember = async (id: string) => {
    Alert.alert('Remove Member', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Remove', 
        style: 'destructive',
        onPress: async () => {
          await supabase.from('family_members').delete().eq('id', id);
          setFamilyMembers(familyMembers.filter(m => m.id !== id));
        }
      }
    ]);
  };

  const editMember = (member: FamilyMember) => {
    setEditingMember(member);
    setFormData({
      name: member.name,
      age: member.age,
      gender: member.gender,
      weight: member.weight,
      dietaryRestrictions: member.dietaryRestrictions,
    });
    setShowAddMember(true);
  };

  const closeForm = () => {
    setShowAddMember(false);
    setEditingMember(null);
    setFormData({
      name: '',
      age: '',
      gender: 'male',
      weight: '',
      dietaryRestrictions: [],
    });
  };

  const toggleDietary = (option: string) => {
    const current = formData.dietaryRestrictions;
    if (current.includes(option)) {
      setFormData({ ...formData, dietaryRestrictions: current.filter(d => d !== option) });
    } else {
      setFormData({ ...formData, dietaryRestrictions: [...current, option] });
    }
  };

  const getTotalPortions = () => {
    return familyMembers.reduce((total, member) => {
      const base = calculateBasePortion(member);
      return total + (base * member.portionMultiplier);
    }, 0);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  // Get unique categories from creator's recipes
  const getCategories = () => {
    const cats = [...new Set(creatorRecipes.map(r => r.category))];
    return cats.slice(0, 5);
  };

  // Guests have no profile — prompt sign-in instead.
  if (isGuest) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.backButton} />
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.guestState}>
          <Text style={styles.guestIcon}>👤</Text>
          <Text style={styles.guestTitle}>Sign in to your profile</Text>
          <Text style={styles.guestText}>
            Create a free account to set up your family, save favorites, and plan your week.
          </Text>
          <TouchableOpacity style={styles.guestButton} onPress={() => router.push('/login')}>
            <Text style={styles.guestButtonText}>Sign in / Register</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.backButton} />
          <Text style={styles.headerTitle}>{isCreator ? 'Creator Profile' : 'Family Profile'}</Text>
          <View style={{ width: 60 }} />
        </View>

        {isCreator ? (
          <>
            {/* Creator Stats */}
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{creatorRecipes.length}</Text>
                <Text style={styles.statLabel}>Recipes</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{subscriberCount}</Text>
                <Text style={styles.statLabel}>Subscribers</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{creatorRecipes.filter(r => r.is_paid).length}</Text>
                <Text style={styles.statLabel}>Premium</Text>
              </View>
            </View>

            {/* Bio Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Bio</Text>
                <TouchableOpacity onPress={() => setEditingBio(!editingBio)}>
                  <Text style={styles.editLink}>{editingBio ? 'Cancel' : 'Edit'}</Text>
                </TouchableOpacity>
              </View>
              {editingBio ? (
                <View>
                  <TextInput
                    style={styles.bioInput}
                    value={bio}
                    onChangeText={setBio}
                    placeholder="Tell your followers about yourself..."
                    multiline
                    numberOfLines={4}
                  />
                  <TouchableOpacity style={styles.saveBioButton} onPress={saveBio} disabled={saving}>
                    <Text style={styles.saveBioButtonText}>{saving ? 'Saving...' : 'Save Bio'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.bioText}>{bio || 'No bio yet. Tap Edit to add one!'}</Text>
              )}
            </View>

            {/* Categories */}
            {getCategories().length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Categories</Text>
                <View style={styles.categoriesRow}>
                  {getCategories().map((cat) => (
                    <View key={cat} style={styles.categoryChip}>
                      <Text style={styles.categoryChipText}>{cat}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.creatorActions}>
              <TouchableOpacity style={styles.creatorActionButton} onPress={() => router.push('/creator/upload')}>
                <Text style={styles.creatorActionIcon}>✏️</Text>
                <Text style={styles.creatorActionText}>New Recipe</Text>
                <Text style={styles.creatorActionHint}>Create manually</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.creatorActionButton} onPress={() => router.push('/creator/import')}>
                <Text style={styles.creatorActionIcon}>📸</Text>
                <Text style={styles.creatorActionText}>Import</Text>
                <Text style={styles.creatorActionHint}>Photo → AI → Recipe</Text>
              </TouchableOpacity>
            </View>

            {/* My Recipes */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>My Recipes</Text>
              {creatorRecipes.length === 0 ? (
                <View style={styles.emptyRecipes}>
                  <Text style={styles.emptyRecipesText}>No recipes yet</Text>
                  <Text style={styles.emptyRecipesHint}>Create your first recipe or import one from a photo</Text>
                </View>
              ) : (
                <View style={styles.recipesGrid}>
                  {creatorRecipes.map((recipe) => (
                    <TouchableOpacity 
                      key={recipe.id} 
                      style={styles.recipeCard}
                      onPress={() => router.push(`/recipe/${recipe.id}`)}
                    >
                      <Image source={{ uri: recipe.image }} style={styles.recipeImage} />
                      {recipe.is_paid && (
                        <View style={styles.premiumBadge}>
                          <Text style={styles.premiumBadgeText}>💎</Text>
                        </View>
                      )}
                      <Text style={styles.recipeTitle} numberOfLines={2}>{recipe.title}</Text>
                      <Text style={styles.recipeCategory}>{recipe.category}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </>
        ) : (
          <>
            {/* User Stats */}
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{familyMembers.length}</Text>
                <Text style={styles.statLabel}>Members</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{getTotalPortions().toFixed(1)}x</Text>
                <Text style={styles.statLabel}>Portions</Text>
              </View>
              {FEATURES.budget && (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>${weeklyBudget}</Text>
                    <Text style={styles.statLabel}>Weekly</Text>
                  </View>
                </>
              )}
            </View>

            {/* Budget — roadmap V2, hidden behind the budget feature flag */}
            {FEATURES.budget && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Weekly Food Budget</Text>
                <View style={styles.budgetInput}>
                  <Text style={styles.dollarSign}>$</Text>
                  <TextInput
                    style={styles.budgetTextInput}
                    value={weeklyBudget}
                    onChangeText={saveBudget}
                    keyboardType="numeric"
                    placeholder="150"
                  />
                  <Text style={styles.perWeek}>/ week</Text>
                </View>
              </View>
            )}

            {/* Family Members */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Family Members</Text>
                <TouchableOpacity style={styles.addButton} onPress={() => setShowAddMember(true)}>
                  <Text style={styles.addButtonText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Add */}
              <View style={styles.quickAddContainer}>
                <Text style={styles.quickAddLabel}>Quick Add:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {QUICK_ADD_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.label}
                      style={styles.quickAddButton}
                      onPress={() => quickAddMember(option)}
                      disabled={saving}
                    >
                      <Text style={styles.quickAddButtonText}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Members List */}
              {familyMembers.map((member) => (
                <TouchableOpacity 
                  key={member.id} 
                  style={styles.memberCard}
                  onPress={() => editMember(member)}
                >
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarText}>
                      {member.gender === 'male' ? '👨' : '👩'}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberDetails}>
                      {member.age} yrs • {member.weight ? `${member.weight} lbs` : 'No weight'} • {member.gender}
                    </Text>
                    <Text style={styles.memberPortion}>
                      Portion: {(calculateBasePortion(member) * member.portionMultiplier).toFixed(2)}x
                      {member.portionMultiplier !== 1.0 && (
                        <Text style={styles.learned}> (learned: {member.portionMultiplier > 1 ? '+' : ''}{((member.portionMultiplier - 1) * 100).toFixed(0)}%)</Text>
                      )}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeMember(member.id)} style={styles.removeButton}>
                    <Text style={styles.removeButtonText}>×</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Account & Settings */}
        <TouchableOpacity style={styles.settingsCard} onPress={() => router.push('/settings')}>
          <View style={styles.settingsIcon}>
            <Text style={styles.creatorIconText}>⚙️</Text>
          </View>
          <View style={styles.creatorContent}>
            <Text style={styles.creatorTitle}>Account & Settings</Text>
            <Text style={styles.settingsSubtitle}>Profile picture, email, password</Text>
          </View>
          <Text style={styles.settingsArrow}>→</Text>
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={showAddMember} animationType="slide" transparent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingMember ? 'Edit Member' : 'Add Family Member'}
            </Text>

            <View style={styles.formRow}>
              <View style={styles.formHalf}>
                <Text style={styles.inputLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(t) => setFormData({ ...formData, name: t })}
                  placeholder="Name"
                />
              </View>
              <View style={styles.formHalf}>
                <Text style={styles.inputLabel}>Age</Text>
                <TextInput
                  style={styles.input}
                  value={formData.age}
                  onChangeText={(t) => setFormData({ ...formData, age: t })}
                  placeholder="Age"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formHalf}>
                <Text style={styles.inputLabel}>Weight (lbs)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.weight}
                  onChangeText={(t) => setFormData({ ...formData, weight: t })}
                  placeholder="150"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.formHalf}>
                <Text style={styles.inputLabel}>Gender</Text>
                <View style={styles.genderButtons}>
                  <TouchableOpacity
                    style={[styles.genderButton, formData.gender === 'male' && styles.genderButtonActive]}
                    onPress={() => setFormData({ ...formData, gender: 'male' })}
                  >
                    <Text style={[styles.genderButtonText, formData.gender === 'male' && styles.genderButtonTextActive]}>👨 Male</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.genderButton, formData.gender === 'female' && styles.genderButtonActive]}
                    onPress={() => setFormData({ ...formData, gender: 'female' })}
                  >
                    <Text style={[styles.genderButtonText, formData.gender === 'female' && styles.genderButtonTextActive]}>👩 Female</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <Text style={styles.inputLabel}>Dietary Restrictions</Text>
            <View style={styles.dietaryOptions}>
              {DIETARY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.dietaryChip, formData.dietaryRestrictions.includes(option) && styles.dietaryChipActive]}
                  onPress={() => toggleDietary(option)}
                >
                  <Text style={[styles.dietaryChipText, formData.dietaryRestrictions.includes(option) && styles.dietaryChipTextActive]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeForm}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={saveMember} disabled={saving}>
                <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  guestState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  guestIcon: { fontSize: 64, marginBottom: 16 },
  guestTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  guestText: { fontSize: 15, color: '#888', textAlign: 'center', marginTop: 10, lineHeight: 22 },
  guestButton: { backgroundColor: '#F57C00', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 24 },
  guestButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F57C00', fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  statsCard: { flexDirection: 'row', backgroundColor: '#FFF', marginHorizontal: 20, borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: '700', color: '#F57C00' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  statDivider: { width: 1, backgroundColor: '#E0E0E0' },
  section: { padding: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  addButton: { backgroundColor: '#F57C00', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addButtonText: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  budgetInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginTop: 12 },
  dollarSign: { fontSize: 24, fontWeight: '700', color: '#F57C00', marginRight: 4 },
  budgetTextInput: { fontSize: 24, fontWeight: '700', color: '#1A1A1A', flex: 1 },
  perWeek: { fontSize: 16, color: '#888' },
  quickAddContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  quickAddLabel: { fontSize: 14, color: '#888', marginRight: 10 },
  quickAddButton: { backgroundColor: '#FFF', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  quickAddButtonText: { fontSize: 14, color: '#1A1A1A' },
  memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 12 },
  memberAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFE0B2', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  memberAvatarText: { fontSize: 24 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 16, fontWeight: '600', color: '#1A1A1A' },
  memberDetails: { fontSize: 13, color: '#888', marginTop: 2 },
  memberPortion: { fontSize: 12, color: '#F57C00', marginTop: 4 },
  learned: { color: '#4CAF50', fontWeight: '600' },
  removeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFE0E0', justifyContent: 'center', alignItems: 'center' },
  removeButtonText: { fontSize: 20, color: '#E53935', fontWeight: '600' },
  settingsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#EEE' },
  settingsIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  settingsSubtitle: { fontSize: 13, color: '#888' },
  settingsArrow: { fontSize: 20, color: '#888' },
  creatorCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFEDE5', marginHorizontal: 20, marginBottom: 12, padding: 16, borderRadius: 16 },
  creatorIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  creatorIconText: { fontSize: 24 },
  creatorContent: { flex: 1 },
  creatorTitle: { fontSize: 16, fontWeight: '600', color: '#1A1A1A', marginBottom: 2 },
  creatorSubtitle: { fontSize: 13, color: '#F57C00' },
  creatorArrow: { fontSize: 20, color: '#F57C00' },
  logoutButton: { marginHorizontal: 20, padding: 16, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center', borderWidth: 1, borderColor: '#E53935' },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#E53935' },
  bottomSpacer: { height: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 24 },
  formRow: { flexDirection: 'row', marginBottom: 16 },
  formHalf: { flex: 1, marginRight: 8 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 14, fontSize: 16 },
  genderButtons: { flexDirection: 'row' },
  genderButton: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#F5F5F5', alignItems: 'center', marginRight: 4 },
  genderButtonActive: { backgroundColor: '#F57C00' },
  genderButtonText: { fontSize: 13, color: '#666' },
  genderButtonTextActive: { color: '#FFF', fontWeight: '600' },
  dietaryOptions: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 20 },
  dietaryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F5F5F5', marginRight: 8, marginBottom: 8 },
  dietaryChipActive: { backgroundColor: '#FFE0B2' },
  dietaryChipText: { fontSize: 13, color: '#666' },
  dietaryChipTextActive: { color: '#F57C00', fontWeight: '600' },
  modalButtons: { flexDirection: 'row', marginTop: 8 },
  cancelButton: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#F5F5F5', alignItems: 'center', marginRight: 8 },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#666' },
  saveButton: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#F57C00', alignItems: 'center' },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  // Creator profile styles
  editLink: { fontSize: 14, color: '#F57C00', fontWeight: '600' },
  bioInput: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 16, fontSize: 15, minHeight: 100, textAlignVertical: 'top' },
  saveBioButton: { backgroundColor: '#F57C00', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  saveBioButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  bioText: { fontSize: 15, color: '#666', lineHeight: 22 },
  categoriesRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  categoryChip: { backgroundColor: '#FFE0B2', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 8 },
  categoryChipText: { fontSize: 13, color: '#F57C00', fontWeight: '600' },
  emptyRecipes: { alignItems: 'center', padding: 32, backgroundColor: '#FFF', borderRadius: 16 },
  emptyRecipesText: { fontSize: 16, color: '#888', marginBottom: 16 },
  uploadFirstButton: { backgroundColor: '#F57C00', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  uploadFirstButtonText: { color: '#FFF', fontWeight: '600', fontSize: 15 },
  recipesGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  recipeCard: { width: '47%', backgroundColor: '#FFF', borderRadius: 12, marginHorizontal: '1.5%', marginBottom: 12, overflow: 'hidden' },
  recipeImage: { width: '100%', height: 120 },
  premiumBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#FFF', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  premiumBadgeText: { fontSize: 14 },
  recipeTitle: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', padding: 10, paddingBottom: 4 },
  recipeCategory: { fontSize: 12, color: '#888', paddingHorizontal: 10, paddingBottom: 10 },
  // Creator action buttons
  creatorActions: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 8, gap: 12 },
  creatorActionButton: { flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#F0F0F0' },
  creatorActionIcon: { fontSize: 28, marginBottom: 8 },
  creatorActionText: { fontSize: 15, fontWeight: '600', color: '#1A1A1A', marginBottom: 2 },
  creatorActionHint: { fontSize: 12, color: '#888' },
  emptyRecipesHint: { fontSize: 13, color: '#AAA', textAlign: 'center', marginTop: 8 },
});
