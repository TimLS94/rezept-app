import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { usd } from '../../lib/pricing';
import { useAuth, canUploadRecipes } from '../../lib/auth';
import { getCreatorProfile, CreatorProfile, emptyCreatorProfile } from '../../lib/creatorProfile';
import { fetchRecipesByCreator, setRecipePaid } from '../../lib/recipes';
import { Recipe } from '../../data/recipes';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200';

export default function CreatorStudioScreen() {
  const { user, role } = useAuth();
  const [profile, setProfile] = useState<CreatorProfile>(emptyCreatorProfile);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  // Reload on focus so edits from the profile screen show up immediately.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        // In parallel — the recipe list doesn't depend on the profile, and
        // chaining them cost a needless second round trip on every focus.
        const [p, r] = await Promise.all([
          getCreatorProfile(),
          user ? fetchRecipesByCreator(user.id) : Promise.resolve(null),
        ]);
        if (!active) return;
        if (p) setProfile(p);
        if (r) setRecipes(r);
      })();
      return () => {
        active = false;
      };
    }, [user])
  );

  // Non-creators shouldn't reach this tab (it's hidden in the layout), but guard
  // anyway in case they land here via a direct link.
  if (!canUploadRecipes(role)) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Creator Studio</Text>
        </View>
        <View style={styles.blocked}>
          <Text style={styles.blockedIcon}>🎬</Text>
          <Text style={styles.blockedTitle}>Creators only</Text>
          <Text style={styles.blockedText}>
            This area is for creator accounts. Want to publish recipes? Get in touch and we'll set you up.
          </Text>
        </View>
      </View>
    );
  }

  const handle = profile.username ? `@${profile.username}` : `@${user?.email?.split('@')[0] ?? 'creator'}`;
  const displayName = profile.fullName || 'Your creator name';
  const socials = [
    { label: 'Instagram', url: profile.instagramUrl, icon: '📸' },
    { label: 'TikTok', url: profile.tiktokUrl, icon: '🎵' },
    { label: 'Website', url: profile.website, icon: '🌐' },
  ].filter(s => s.url);

  const openLink = (url: string) => {
    const full = url.startsWith('http') ? url : `https://${url}`;
    Linking.openURL(full).catch(() => {});
  };

  // Flip a recipe between free and paywalled (optimistic, reverts on error).
  const togglePaid = async (r: Recipe) => {
    const next = !r.isPaid;
    setRecipes(prev => prev.map(x => (x.id === r.id ? { ...x, isPaid: next } : x)));
    const res = await setRecipePaid(r.id, next);
    if ('error' in res) {
      setRecipes(prev => prev.map(x => (x.id === r.id ? { ...x, isPaid: !next } : x)));
      Alert.alert('Could not update', res.error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Creator Studio</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <Image source={{ uri: profile.avatarUrl || DEFAULT_AVATAR }} style={styles.avatar} />
          <View style={styles.nameRow}>
            <Text style={styles.name}>{displayName}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>✓ CREATOR</Text>
            </View>
          </View>
          <Text style={styles.handle}>{handle} · {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          {socials.length > 0 && (
            <View style={styles.socialRow}>
              {socials.map(s => (
                <TouchableOpacity key={s.label} style={styles.socialChip} onPress={() => openLink(s.url)}>
                  <Text style={styles.socialText}>{s.icon} {s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.editButton} onPress={() => router.push('/creator/profile')}>
            <Text style={styles.editButtonText}>✏️ Edit creator profile</Text>
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/creator/upload')}>
            <Text style={styles.actionIcon}>⬆️</Text>
            <View style={styles.actionBody}>
              <Text style={styles.actionTitle}>Upload a recipe</Text>
              <Text style={styles.actionSub}>Create a recipe from scratch</Text>
            </View>
            <Text style={styles.actionArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/creator/import')}>
            <Text style={styles.actionIcon}>📥</Text>
            <View style={styles.actionBody}>
              <Text style={styles.actionTitle}>Import a recipe</Text>
              <Text style={styles.actionSub}>Instagram link, screenshots or text</Text>
            </View>
            <Text style={styles.actionArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/creator/profile')}>
            <Text style={styles.actionIcon}>🏷️</Text>
            <View style={styles.actionBody}>
              <Text style={styles.actionTitle}>Prices & memberships</Text>
              <Text style={styles.actionSub}>
                {profile.subscriptionEnabled && profile.subscriptionPriceCents != null
                  ? `Membership ${usd(profile.subscriptionPriceCents)}/mo${
                      profile.defaultRecipePriceCents != null
                        ? ` · recipes ${usd(profile.defaultRecipePriceCents)}`
                        : ''}`
                  : 'Set what your recipes and your membership cost'}
              </Text>
            </View>
            <Text style={styles.actionArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/creator/earnings')}>
            <Text style={styles.actionIcon}>💶</Text>
            <View style={styles.actionBody}>
              <Text style={styles.actionTitle}>Earnings</Text>
              <Text style={styles.actionSub}>See what you earn & how it's calculated</Text>
            </View>
            <Text style={styles.actionArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* My recipes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My recipes ({recipes.length})</Text>
          {recipes.length > 0 && (
            <Text style={styles.sectionHint}>Tap 🔓/🔒 to set a recipe free or behind the paywall.</Text>
          )}
          {recipes.length === 0 ? (
            <Text style={styles.emptyText}>No published recipes yet. Upload or import your first one above.</Text>
          ) : (
            recipes.map(r => (
              <View key={r.id} style={styles.recipeRow}>
                <TouchableOpacity style={styles.recipeMain} onPress={() => router.push(`/recipe/${r.id}`)}>
                  <Image source={{ uri: r.image }} style={styles.recipeImage} />
                  <View style={styles.recipeBody}>
                    <Text style={styles.recipeTitle} numberOfLines={1}>{r.title}</Text>
                    <Text style={styles.recipeMeta}>{r.prepTime + r.cookTime} min · {r.calories} cal</Text>
                    {r.dietary.length > 0 && (
                      <View style={styles.tagRow}>
                        {r.dietary.slice(0, 3).map(t => (
                          <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
                        ))}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.payToggle, r.isPaid && styles.payToggleOn]}
                  onPress={() => togglePaid(r)}
                >
                  <Text style={[styles.payToggleText, r.isPaid && styles.payToggleTextOn]}>
                    {r.isPaid ? '🔒 Paid' : '🔓 Free'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 12, alignItems: 'center' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },

  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  blockedIcon: { fontSize: 64, marginBottom: 16 },
  blockedTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  blockedText: { fontSize: 15, color: '#888', textAlign: 'center', marginTop: 10, lineHeight: 22 },

  profileCard: { backgroundColor: '#FFF', borderRadius: 20, marginHorizontal: 20, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  avatar: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: '#F2701E' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  name: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  badge: { backgroundColor: '#FFF0EA', borderColor: '#FFC7B0', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#F2701E', letterSpacing: 0.5 },
  handle: { fontSize: 14, color: '#888', marginTop: 4 },
  bio: { fontSize: 14, color: '#444', textAlign: 'center', marginTop: 10, lineHeight: 20 },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  socialChip: { backgroundColor: '#F5F5F5', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  socialText: { fontSize: 13, color: '#333', fontWeight: '600' },
  editButton: { marginTop: 16, backgroundColor: '#F2701E', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, alignSelf: 'stretch', alignItems: 'center' },
  editButtonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  actions: { marginTop: 16, marginHorizontal: 20, gap: 12 },
  actionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F0F0F0' },
  actionIcon: { fontSize: 24, marginRight: 14 },
  actionBody: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  actionSub: { fontSize: 13, color: '#888', marginTop: 2 },
  actionArrow: { fontSize: 20, color: '#F2701E' },

  section: { marginTop: 24, marginHorizontal: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  sectionHint: { fontSize: 12, color: '#888', marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#888', lineHeight: 20 },
  recipeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#F0F0F0' },
  recipeMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  recipeImage: { width: 84, height: 84 },
  recipeBody: { flex: 1, padding: 10, justifyContent: 'center' },
  payToggle: { paddingHorizontal: 10, paddingVertical: 7, marginRight: 10, borderRadius: 10, borderWidth: 1, borderColor: '#C8E6C9', backgroundColor: '#E8F5E9' },
  payToggleOn: { borderColor: '#FFD3C2', backgroundColor: '#FFF0EA' },
  payToggleText: { fontSize: 12, fontWeight: '700', color: '#3C8D40' },
  payToggleTextOn: { color: '#F2701E' },
  recipeTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  recipeMeta: { fontSize: 12, color: '#888', marginTop: 4 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { backgroundColor: '#FFF5F0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, color: '#F2701E', fontWeight: '600' },
});
