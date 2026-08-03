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
  Linking,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { pickAndUploadImage } from '../lib/storage';
import { VERSION_STRING } from '../lib/version';
import { useAuth, canUploadRecipes } from '../lib/auth';
import { restorePurchases, grantPlatformEntitlement } from '../lib/purchases';
import Paywall from '../components/Paywall';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200';

export default function SettingsScreen() {
  const { isPremium, role, refresh } = useAuth();
  const isCreator = canUploadRecipes(role);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  // IAP subscriptions can only be cancelled in the store, so we deep-link there.
  const manageSubscription = () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
    Linking.openURL(url).catch(() => {});
  };

  // Debug/unlock: write the entitlement via the SQL RPC, reload, and show the
  // result + current entitlement rows so we can see the gate working.
  const debugSync = async () => {
    const g = await grantPlatformEntitlement('premium_monthly');
    await refresh();
    const { data, error } = await supabase
      .from('entitlements')
      .select('scope, status, current_period_end');
    Alert.alert(
      g.ok ? 'Unlocked ✓' : 'Failed',
      `grant: ${g.ok ? 'ok' : (g.error ?? 'error')}\n` +
      `rows: ${error ? error.message : JSON.stringify(data)}`
    );
  };

  const handleRestore = async () => {
    const r = await restorePurchases();
    if (r === 'success') {
      await refresh();
      Alert.alert('Restored', 'Your subscription is active again.');
    } else if (r === 'unavailable') {
      Alert.alert('Not available', 'Restoring purchases works in a store/dev build.');
    } else {
      Alert.alert('No purchases found', "We couldn't restore an active subscription.");
    }
  };

  // Profile
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const chooseAvatar = async () => {
    setUploadingAvatar(true);
    const url = await pickAndUploadImage('avatars');
    setUploadingAvatar(false);
    if (url) setAvatarUrl(url);
  };

  // Email
  const [email, setEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // Password
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    loadAccount();
  }, []);

  const loadAccount = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setUserId(user.id);
    setEmail(user.email || '');

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, username, avatar_url')
      .eq('id', user.id)
      .single();

    if (profile) {
      setFullName(profile.full_name || '');
      setUsername(profile.username || '');
      setAvatarUrl(profile.avatar_url || '');
    }
    setLoading(false);
  };

  const saveProfile = async () => {
    if (!userId) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        username: username.trim().replace(/^@/, ''),
        avatar_url: avatarUrl.trim(),
      })
      .eq('id', userId);
    setSavingProfile(false);
    Alert.alert(
      error ? 'Could not save' : 'Saved',
      error ? error.message : 'Your profile has been updated.'
    );
  };

  const changeEmail = async () => {
    if (!newEmail.trim()) return;
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setSavingEmail(false);
    if (error) {
      Alert.alert('Could not change email', error.message);
      return;
    }
    Alert.alert(
      'Confirm your new email',
      `We sent a confirmation link to ${newEmail.trim()}. Your email changes once you confirm.`
    );
    setNewEmail('');
  };

  const changePassword = async () => {
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please re-enter the same password.');
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      Alert.alert('Could not change password', error.message);
      return;
    }
    setPassword('');
    setConfirmPassword('');
    Alert.alert('Password updated', 'Your password has been changed.');
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account, family members, shopping list and uploaded recipes. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: deleteAccount },
      ]
    );
  };

  const deleteAccount = async () => {
    const { error } = await supabase.rpc('delete_account');
    if (error) {
      Alert.alert('Could not delete account', error.message);
      return;
    }
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#F57C00" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account & Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Public profile (avatar, name, @handle) is only relevant for creators. */}
        {isCreator && (<>
        {/* Profile picture */}
        <View style={styles.avatarWrap}>
          <Image
            source={{ uri: avatarUrl.trim() || DEFAULT_AVATAR }}
            style={styles.avatar}
          />
          <TouchableOpacity style={styles.avatarButton} onPress={chooseAvatar} disabled={uploadingAvatar}>
            {uploadingAvatar ? (
              <ActivityIndicator color="#F57C00" />
            ) : (
              <Text style={styles.avatarButtonText}>📷 Change photo</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Profile</Text>

          <Text style={styles.label}>Profile picture URL</Text>
          <TextInput
            style={styles.input}
            value={avatarUrl}
            onChangeText={setAvatarUrl}
            placeholder="https://…"
            placeholderTextColor="#999"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Display name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor="#999"
          />

          <Text style={styles.label}>Username</Text>
          <View style={styles.usernameRow}>
            <Text style={styles.at}>@</Text>
            <TextInput
              style={[styles.input, styles.usernameInput]}
              value={username}
              onChangeText={setUsername}
              placeholder="handle"
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={saveProfile} disabled={savingProfile}>
            {savingProfile ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Save Profile</Text>
            )}
          </TouchableOpacity>
        </View>
        </>)}

        {/* Email */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Email</Text>
          <Text style={styles.currentValue}>Current: {email || '—'}</Text>
          <TextInput
            style={styles.input}
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="new@email.com"
            placeholderTextColor="#999"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={styles.secondaryButton} onPress={changeEmail} disabled={savingEmail}>
            {savingEmail ? (
              <ActivityIndicator color="#F57C00" />
            ) : (
              <Text style={styles.secondaryButtonText}>Change Email</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Password */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="New password"
            placeholderTextColor="#999"
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            placeholderTextColor="#999"
            secureTextEntry
          />
          <TouchableOpacity style={styles.secondaryButton} onPress={changePassword} disabled={savingPassword}>
            {savingPassword ? (
              <ActivityIndicator color="#F57C00" />
            ) : (
              <Text style={styles.secondaryButtonText}>Change Password</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Subscription */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Subscription</Text>
          {isPremium ? (
            <>
              <Text style={styles.subActive}>✓ Premium active</Text>
              <Text style={styles.subHint}>You have access to all premium recipes.</Text>
              <TouchableOpacity style={styles.secondaryButton} onPress={manageSubscription}>
                <Text style={styles.secondaryButtonText}>Manage / cancel subscription</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.subHint}>Unlock all premium recipes and support the creators.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setShowPaywall(true)}>
                <Text style={styles.primaryButtonText}>Unlock Premium</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity style={styles.restoreLink} onPress={handleRestore}>
            <Text style={styles.restoreLinkText}>Restore purchases</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.restoreLink} onPress={debugSync}>
            <Text style={[styles.restoreLinkText, { color: '#888' }]}>Debug: unlock &amp; check status</Text>
          </TouchableOpacity>
        </View>

        {/* Legal */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Legal</Text>
          <TouchableOpacity style={styles.legalLink} onPress={() => router.push('/privacy')}>
            <Text style={styles.legalLinkText}>Privacy Policy</Text>
            <Text style={styles.legalArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.legalLink} onPress={() => router.push('/terms')}>
            <Text style={styles.legalLinkText}>Terms of Service</Text>
            <Text style={styles.legalArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Danger zone */}
        <View style={[styles.card, styles.dangerCard]}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <Text style={styles.dangerText}>
            Deleting your account removes all your data permanently.
          </Text>
          <TouchableOpacity style={styles.deleteButton} onPress={confirmDelete}>
            <Text style={styles.deleteButtonText}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>FeedFamily {VERSION_STRING}</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Paywall visible={showPaywall} onClose={() => setShowPaywall(false)} onSubscribed={refresh} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F57C00', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },
  avatarWrap: { alignItems: 'center', marginTop: 8, marginBottom: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: '#F57C00', backgroundColor: '#EEE' },
  avatarButton: { marginTop: 10, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#F57C00', backgroundColor: '#FFF5F0' },
  avatarButtonText: { color: '#F57C00', fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: '#FFF', marginHorizontal: 20, marginTop: 16, borderRadius: 16, padding: 18 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#F7F7F7', borderRadius: 10, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#EEE', marginBottom: 4 },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  at: { fontSize: 18, color: '#888', marginRight: 6 },
  usernameInput: { flex: 1 },
  currentValue: { fontSize: 14, color: '#888', marginBottom: 12 },
  primaryButton: { backgroundColor: '#F57C00', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 14 },
  primaryButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#F57C00' },
  secondaryButtonText: { color: '#F57C00', fontSize: 15, fontWeight: '700' },
  dangerCard: { borderWidth: 1, borderColor: '#FFCDD2' },
  dangerTitle: { fontSize: 16, fontWeight: '700', color: '#E53935', marginBottom: 6 },
  dangerText: { fontSize: 13, color: '#888', marginBottom: 14 },
  deleteButton: { padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: '#E53935' },
  deleteButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  legalLink: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  legalLinkText: { fontSize: 15, color: '#1A1A1A' },
  legalArrow: { fontSize: 20, color: '#CCC' },
  subActive: { fontSize: 16, fontWeight: '700', color: '#3C8D40', marginBottom: 6 },
  subHint: { fontSize: 13, color: '#888', marginBottom: 12, lineHeight: 19 },
  restoreLink: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  restoreLinkText: { fontSize: 14, color: '#0D2B63', fontWeight: '600' },
  versionContainer: { alignItems: 'center', marginTop: 24 },
  versionText: { fontSize: 13, color: '#AAA' },
});
