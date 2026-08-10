import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { pickAndUploadImage } from '../../lib/storage';
import {
  getCreatorProfile,
  updateCreatorProfile,
  CreatorProfile,
  emptyCreatorProfile,
} from '../../lib/creatorProfile';
import {
  RECIPE_PRICE_TIERS, CREATOR_SUB_TIERS, creatorTakeHomeCents, feeBreakdown, usd,
} from '../../lib/pricing';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200';

export default function EditCreatorProfileScreen() {
  const { refresh } = useAuth();
  const [profile, setProfile] = useState<CreatorProfile>(emptyCreatorProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await getCreatorProfile();
      if (p) setProfile(p);
      setLoading(false);
    })();
  }, []);

  const set = <K extends keyof CreatorProfile>(key: K, value: CreatorProfile[K]) =>
    setProfile(prev => ({ ...prev, [key]: value }));

  const changeAvatar = async () => {
    setUploading(true);
    const url = await pickAndUploadImage('avatars');
    setUploading(false);
    if (url) set('avatarUrl', url);
  };

  const save = async () => {
    setSaving(true);
    const result = await updateCreatorProfile(profile);
    setSaving(false);
    if ('error' in result) {
      Alert.alert('Could not save', result.error);
      return;
    }
    if (result.degraded) {
      Alert.alert(
        'Saved without pricing',
        'Your profile was saved, but the recipe price needs supabase/creator_pricing.sql to be run first.',
      );
    }
    await refresh();
    router.back();
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#F57C00" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Creator Profile</Text>
        <TouchableOpacity onPress={save} style={styles.headerBtn} disabled={saving}>
          <Text style={[styles.headerBtnText, styles.saveText]}>{saving ? '…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={changeAvatar} disabled={uploading}>
            <Image source={{ uri: profile.avatarUrl || DEFAULT_AVATAR }} style={styles.avatar} />
            <View style={styles.avatarEdit}>
              <Text style={styles.avatarEditText}>{uploading ? '…' : '✏️'}</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </View>

        <Field label="Display name">
          <TextInput
            style={styles.input}
            value={profile.fullName}
            onChangeText={t => set('fullName', t)}
            placeholder="e.g. Tim's Family Kitchen"
            placeholderTextColor="#999"
          />
        </Field>

        <Field label="Handle">
          <View style={styles.handleRow}>
            <Text style={styles.handleAt}>@</Text>
            <TextInput
              style={styles.handleInput}
              value={profile.username}
              onChangeText={t => set('username', t.replace(/^@+/, ''))}
              placeholder="timcooks"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={styles.hint}>Shown on every recipe you publish.</Text>
        </Field>

        <Field label="Bio">
          <TextInput
            style={[styles.input, styles.textArea]}
            value={profile.bio}
            onChangeText={t => set('bio', t)}
            placeholder="Tell people what your recipes are about…"
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </Field>

        <Text style={styles.groupLabel}>Links & socials</Text>

        <Field label="📸 Instagram">
          <TextInput
            style={styles.input}
            value={profile.instagramUrl}
            onChangeText={t => set('instagramUrl', t)}
            placeholder="instagram.com/yourhandle"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>

        <Field label="🎵 TikTok">
          <TextInput
            style={styles.input}
            value={profile.tiktokUrl}
            onChangeText={t => set('tiktokUrl', t)}
            placeholder="tiktok.com/@yourhandle"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>

        <Field label="🌐 Website">
          <TextInput
            style={styles.input}
            value={profile.website}
            onChangeText={t => set('website', t)}
            placeholder="yoursite.com"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>

        <Text style={styles.groupLabel}>Pricing</Text>

        {/* Profile subscription — unlocks everything this creator publishes. */}
        <View style={styles.priceCard}>
          <View style={styles.priceHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.priceTitle}>Profile membership</Text>
              <Text style={styles.priceSub}>
                Members pay monthly and get <Text style={styles.priceBold}>every premium recipe you have published — and everything you publish later</Text>, for as long as they stay. They never pay per recipe.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, profile.subscriptionEnabled && styles.toggleOn]}
              onPress={() => set('subscriptionEnabled', !profile.subscriptionEnabled)}
            >
              <Text style={[styles.toggleText, profile.subscriptionEnabled && styles.toggleTextOn]}>
                {profile.subscriptionEnabled ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
          </View>

          {profile.subscriptionEnabled && (
            <>
              <View style={styles.tierRow}>
                {CREATOR_SUB_TIERS.map(t => (
                  <TouchableOpacity
                    key={t.cents}
                    style={[styles.tier, profile.subscriptionPriceCents === t.cents && styles.tierOn]}
                    onPress={() => set('subscriptionPriceCents', t.cents)}
                  >
                    <Text style={[styles.tierText, profile.subscriptionPriceCents === t.cents && styles.tierTextOn]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {profile.subscriptionPriceCents != null && (
                <FeeRows cents={profile.subscriptionPriceCents} per="per member, per month" />
              )}
            </>
          )}
        </View>

        {/* Default single-recipe price. Per-recipe overrides live on the recipe. */}
        <View style={styles.priceCard}>
          <Text style={styles.priceTitle}>Default price per recipe</Text>
          <Text style={styles.priceSub}>
            Used when you mark a recipe premium. You can override it on any individual recipe.
          </Text>
          <View style={styles.tierRow}>
            {RECIPE_PRICE_TIERS.map(t => (
              <TouchableOpacity
                key={t.cents}
                style={[styles.tier, profile.defaultRecipePriceCents === t.cents && styles.tierOn]}
                onPress={() => set('defaultRecipePriceCents',
                  profile.defaultRecipePriceCents === t.cents ? null : t.cents)}
              >
                <Text style={[styles.tierText, profile.defaultRecipePriceCents === t.cents && styles.tierTextOn]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {profile.defaultRecipePriceCents != null ? (
            <FeeRows cents={profile.defaultRecipePriceCents} per="per sale" />
          ) : (
            <Text style={styles.priceSub}>
              No price set — premium recipes will only be available through subscriptions.
            </Text>
          )}
        </View>

        <Text style={styles.priceFootnote}>
          You keep 75% of the net on everything you sell here, and it's yours alone —
          app Premium does not give anyone access to your recipes, so nothing you
          price is given away by a subscription you see no money from.
          {'\n\n'}
          Prices are fixed tiers because Apple and Google only bill through pre-registered products.
        </Text>

        <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save profile'}</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// Where the money actually goes. Showing only the take-home invites "why not
// the full $4.99?", and the honest answer is that the larger deduction is
// Apple's and Google's, not ours — so it's spelled out rather than summarised.
function FeeRows({ cents, per }: { cents: number; per: string }) {
  const f = feeBreakdown(cents);
  return (
    <View style={styles.feeBox}>
      <View style={styles.feeRow}>
        <Text style={styles.feeLabel}>Buyer pays</Text>
        <Text style={styles.feeValue}>{usd(f.price)}</Text>
      </View>
      <View style={styles.feeRow}>
        <Text style={styles.feeLabel}>− {f.storeFeeLabel}</Text>
        <Text style={styles.feeValue}>− {usd(f.storeFee)}</Text>
      </View>
      <View style={styles.feeRow}>
        <Text style={styles.feeLabel}>− {f.platformFeeLabel}</Text>
        <Text style={styles.feeValue}>− {usd(f.platformFee)}</Text>
      </View>
      <View style={[styles.feeRow, styles.feeTotal]}>
        <Text style={styles.feeLabelStrong}>You keep {per}</Text>
        <Text style={styles.feeValueStrong}>{usd(f.takeHome)}</Text>
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerBtn: { minWidth: 60 },
  headerBtnText: { fontSize: 16, color: '#888' },
  saveText: { color: '#F57C00', fontWeight: '700', textAlign: 'right' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 18, color: '#0D2B63', letterSpacing: 0.3 },
  content: { flex: 1, padding: 20 },

  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#F57C00' },
  avatarEdit: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: '#F57C00', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFF' },
  avatarEditText: { fontSize: 13 },
  avatarHint: { fontSize: 13, color: '#888', marginTop: 8 },

  field: { marginBottom: 18 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#E0E0E0' },
  textArea: { minHeight: 100, paddingTop: 12 },
  hint: { fontSize: 12, color: '#999', marginTop: 6 },
  handleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0', paddingLeft: 14 },
  handleAt: { fontSize: 15, color: '#888' },
  handleInput: { flex: 1, padding: 14, fontSize: 15 },
  groupLabel: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, marginTop: 4 },

  priceCard: {
    backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#EFE7DC',
    padding: 16, marginBottom: 12,
  },
  priceHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  priceTitle: { fontSize: 15, fontWeight: '700', color: '#0D2B63' },
  priceSub: { fontSize: 12.5, color: '#6F6F6F', marginTop: 3, lineHeight: 18 },
  priceBold: { fontWeight: '700', color: '#0D2B63' },
  toggle: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: '#F1EADF' },
  toggleOn: { backgroundColor: '#F57C00' },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#6F6F6F' },
  toggleTextOn: { color: '#FFF' },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  tier: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18,
    borderWidth: 1, borderColor: '#EFE7DC', backgroundColor: '#FFF9F2',
  },
  tierOn: { backgroundColor: '#0D2B63', borderColor: '#0D2B63' },
  tierText: { fontSize: 13.5, fontWeight: '600', color: '#0D2B63' },
  tierTextOn: { color: '#FFF' },
  feeBox: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#EFE7DC', paddingTop: 10 },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  feeLabel: { fontSize: 12.5, color: '#6F6F6F' },
  feeValue: { fontSize: 12.5, color: '#6F6F6F' },
  feeTotal: { borderTopWidth: 1, borderTopColor: '#EFE7DC', marginTop: 6, paddingTop: 7 },
  feeLabelStrong: { fontSize: 13, color: '#3C8D40', fontWeight: '700' },
  feeValueStrong: { fontSize: 13, color: '#3C8D40', fontWeight: '700' },
  priceFootnote: { fontSize: 11.5, color: '#6F6F6F', lineHeight: 17, marginBottom: 16 },
  saveButton: { backgroundColor: '#F57C00', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
