import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../lib/auth';
import {
  detectFridgeItems, matchRecipes, getFridgeQuota, recordFridgeScan,
  saveScan, loadScan, clearScan,
  FRIDGE_SCAN_LIMIT, type RecipeMatch, type FridgeQuota,
} from '../lib/fridge';
import { addRecipesToShoppingList } from '../lib/shopping';
import { fetchCookableRecipes } from '../lib/recipes';
import Paywall from '../components/Paywall';
import { COLORS, FONTS, RADIUS } from '../lib/theme';
import { HEADER_TOP } from '../lib/layout';

const MAX_PHOTOS = 3;

type Shot = { uri: string; base64: string };

const agoText = (at: number) => {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};

// "…again on Tuesday" reads better than a raw date, but only inside the week
// the window actually rolls over in.
function quotaResetText(quota: { resets_at: string | null }): string {
  if (!quota.resets_at) return `You get ${FRIDGE_SCAN_LIMIT} scans every 7 days.`;
  const when = new Date(quota.resets_at);
  const days = Math.max(0, Math.ceil((when.getTime() - Date.now()) / 86_400_000));
  if (days <= 0) return 'Your next scan is available now.';
  if (days === 1) return 'Your next scan unlocks tomorrow.';
  return `Your next scan unlocks in ${days} days.`;
}

export default function FridgeScreen() {
  const { isPremium, isGuest, refresh } = useAuth();
  const [shots, setShots] = useState<Shot[]>([]);
  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<string[] | null>(null);
  const [matches, setMatches] = useState<RecipeMatch[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const [quota, setQuota] = useState<FridgeQuota | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);

  useEffect(() => {
    if (isPremium) getFridgeQuota().then(setQuota);
  }, [isPremium]);

  // A scan costs one of three weekly slots, so it survives leaving the screen
  // and restarting the app. Only the detected items are stored; the matches are
  // recomputed here so they track the current recipe catalogue and whatever the
  // user has since unlocked.
  useEffect(() => {
    if (!isPremium) return;
    let active = true;
    (async () => {
      const saved = await loadScan();
      if (!active || !saved?.items.length) return;
      setItems(saved.items);
      setScannedAt(saved.at);
      const recipes = await fetchCookableRecipes();
      if (active) setMatches(matchRecipes(recipes, saved.items));
    })();
    return () => { active = false; };
  }, [isPremium]);

  // Multi-shot capture: the library takes up to three in one multi-select, the
  // camera confirms each shot and offers to continue. The confirmation is the
  // point — silently reopening the camera reads as "my photo wasn't accepted",
  // and it also gave the previous modal no time to dismiss before the next
  // launch, which came straight back as cancelled.
  const addShots = async (from: 'camera' | 'library') => {
    const room = MAX_PHOTOS - shots.length;
    if (room <= 0) return;

    const perm = from === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission needed',
        from === 'camera' ? 'Allow camera access to photograph your fridge.' : 'Allow photo access to pick a photo.',
      );
      return;
    }

    const base = {
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      // Recognising food needs far less detail than a photo carries, and the
      // whole batch has to fit in one request now that it goes through our
      // own function rather than straight to Google.
      quality: 0.35,
      base64: true,
    };

    // Each photo is committed to state the moment it comes back, never held in
    // a local array until the loop finishes. The previous version collected
    // everything first, so one hiccup — a throw, or the second launch returning
    // `canceled` because the first modal was still dismissing — silently threw
    // away shots the user had already taken.
    const commit = (a: { uri: string; base64?: string | null }) => {
      if (!a.base64) return false;
      setShots(prev => [...prev, { uri: a.uri, base64: a.base64! }].slice(0, MAX_PHOTOS));
      setItems(null);   // new photos invalidate the previous result
      setMatches([]);
      return true;
    };

    if (from === 'library') {
      const result = await ImagePicker.launchImageLibraryAsync({
        ...base,
        allowsMultipleSelection: true,
        selectionLimit: room,
      });
      if (result.canceled) return;
      for (const a of result.assets) commit(a);
      return;
    }

    for (let i = 0; i < room; i++) {
      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchCameraAsync(base);
      } catch {
        // Camera unavailable or busy — keep whatever was already taken.
        break;
      }
      if (result.canceled) break;          // cancelling means "that's enough"
      if (!commit(result.assets[0])) break;

      const total = shots.length + i + 1;
      if (total >= MAX_PHOTOS) break;
      if (!(await askForAnother(total))) break;
    }
  };

  // Resolves true if the user wants to keep shooting. Also serves as the beat
  // that lets the camera modal dismiss before the next launch.
  const askForAnother = (taken: number) =>
    new Promise<boolean>(resolve => {
      Alert.alert(
        `Photo ${taken} of ${MAX_PHOTOS} added`,
        'Add another angle — a second shelf, the door, or the freezer?',
        [
          { text: 'Done', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Take another', onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });

  const removeShot = (index: number) => {
    setShots(prev => prev.filter((_, i) => i !== index));
    setItems(null);
    setMatches([]);
  };

  const scan = async () => {
    if (!shots.length) return;

    // Cheap pre-check so we don't pay for an AI call the server will reject.
    // Not the enforcement point — record_fridge_scan re-checks server-side.
    const current = await getFridgeQuota();
    setQuota(current);
    if (current.remaining <= 0) {
      Alert.alert('No scans left', quotaResetText(current));
      return;
    }

    setScanning(true);
    try {
      const detected = await detectFridgeItems(shots.map(s => s.base64));
      if (!detected.success) {
        const message = {
          'no-key': 'The AI key is not configured in this build.',
          'nothing-found': "I couldn't identify any food in those photos. Try a brighter, closer shot.",
          'no-images': 'Add at least one photo first.',
          // Not the user's fault and not fixable by retaking the photo — say so.
          'response-truncated': 'Your fridge had more in it than the scan could list in one go. Please try again.',
          'photos-too-large': 'Those photos are too big to send in one go. Try again with fewer of them.',
          'quota-exceeded': "You've used today's scans. They reset tomorrow.",
        }[detected.error] ??
          // Anything else is a real fault, and the reason is worth showing:
          // "please try again" on a broken session or a rejected upload just
          // sends people round the same loop.
          `The scan failed (${detected.error}). Please try again.`;
        Alert.alert('No results', message);
        return;
      }
      // Booked only now: a scan that errored out shouldn't cost the user one of
      // their three. The AI call is already paid for either way, but failures
      // are rare and charging for them is the worse deal for a paying customer.
      const booked = await recordFridgeScan(detected.items.length);
      setQuota(booked);
      if (!booked.ok) {
        Alert.alert('No scans left', quotaResetText(booked));
        return;
      }

      const recipes = await fetchCookableRecipes();
      setItems(detected.items);
      setMatches(matchRecipes(recipes, detected.items));
      setScannedAt(Date.now());
      await saveScan(detected.items);
    } finally {
      setScanning(false);
    }
  };

  // Removing a misdetected item only re-runs the local ranking — no second AI call.
  const dropItem = useCallback(async (item: string) => {
    if (!items) return;
    const next = items.filter(i => i !== item);
    setItems(next);
    await saveScan(next);   // the correction sticks too, not just the raw scan
    const recipes = await fetchCookableRecipes();
    setMatches(matchRecipes(recipes, next));
  }, [items]);

  const reset = () => {
    setShots([]);
    setItems(null);
    setMatches([]);
    setScannedAt(null);
    clearScan();
  };

  // Put just the missing items on the shopping list, tagged with the recipe so
  // the list shows what they're for. What's already in the fridge is left off —
  // that's the whole point of having scanned it.
  const addMissing = async (m: RecipeMatch) => {
    if (!m.missing.length) return;
    setAddingFor(m.recipe.id);
    const result = await addRecipesToShoppingList([
      { recipe: m.recipe, ingredients: m.missing },
    ]);
    setAddingFor(null);
    if ('error' in result) {
      Alert.alert('Sign in required', 'Sign in to build a shopping list.');
      return;
    }
    Alert.alert(
      'Added to your list',
      `${m.missing.length} item${m.missing.length === 1 ? '' : 's'} for ${m.recipe.title}.`,
      [
        { text: 'Keep browsing', style: 'cancel' },
        { text: 'Open list', onPress: () => router.push('/shopping') },
      ],
    );
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Fridge Scan</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  // ── Gates ────────────────────────────────────────────────────────────────
  if (isGuest) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.gate}>
          <Text style={styles.gateIcon}>🧊</Text>
          <Text style={styles.gateTitle}>Sign in to scan</Text>
          <Text style={styles.gateText}>Fridge Scan is part of Premium. Sign in to get started.</Text>
          <TouchableOpacity style={styles.gateBtn} onPress={() => router.push('/login')}>
            <Text style={styles.gateBtnText}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!isPremium) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.gate}>
          <Text style={styles.gateIcon}>🧊</Text>
          <Text style={styles.gateTitle}>A Premium feature</Text>
          <Text style={styles.gateText}>
            Photograph your fridge and let AI work out what you can cook tonight — ranked by how little you'd have to buy.
          </Text>
          <TouchableOpacity style={styles.gateBtn} onPress={() => setShowPaywall(true)}>
            <Text style={styles.gateBtnText}>Unlock Premium</Text>
          </TouchableOpacity>
        </View>
        <Paywall visible={showPaywall} onClose={() => setShowPaywall(false)} onSubscribed={refresh} />
      </View>
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>
          Take up to {MAX_PHOTOS} photos of your fridge, freezer or pantry. Keep the door wide open and the shelves visible.
        </Text>

        {quota && (
          <View style={styles.quotaBar}>
            <Ionicons
              name={quota.remaining > 0 ? 'sparkles-outline' : 'time-outline'}
              size={16}
              color={quota.remaining > 0 ? COLORS.orange : COLORS.warmGray}
            />
            <Text style={styles.quotaText}>
              {quota.remaining > 0
                ? `${quota.remaining} of ${quota.limit} scans left this week`
                : quotaResetText(quota)}
            </Text>
          </View>
        )}

        {/* Photo tray */}
        <View style={styles.tray}>
          {shots.map((shot, i) => (
            <View key={shot.uri} style={styles.thumbWrap}>
              <Image source={{ uri: shot.uri }} style={styles.thumb} contentFit="cover" />
              <TouchableOpacity style={styles.thumbRemove} onPress={() => removeShot(i)}>
                <Ionicons name="close" size={14} color="#FFF" />
              </TouchableOpacity>
            </View>
          ))}
          {shots.length < MAX_PHOTOS && (
            <>
              <TouchableOpacity style={styles.addTile} onPress={() => addShots('camera')}>
                <Ionicons name="camera-outline" size={24} color={COLORS.navy} />
                <Text style={styles.addTileText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addTile} onPress={() => addShots('library')}>
                <Ionicons name="images-outline" size={24} color={COLORS.navy} />
                <Text style={styles.addTileText}>Photos</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.scanBtn, (!shots.length || scanning || quota?.remaining === 0) && styles.scanBtnDisabled]}
          onPress={scan}
          disabled={!shots.length || scanning || quota?.remaining === 0}
          activeOpacity={0.85}
        >
          {scanning
            ? <ActivityIndicator color="#FFF" />
            : <Text style={styles.scanBtnText}>{items ? 'Scan again' : 'Scan my fridge'}</Text>}
        </TouchableOpacity>

        {/* What the AI saw */}
        {items && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                Found {items.length} ingredients{scannedAt ? ` · ${agoText(scannedAt)}` : ''}
              </Text>
              <TouchableOpacity onPress={reset}><Text style={styles.resetText}>Start over</Text></TouchableOpacity>
            </View>
            <Text style={styles.hint}>Tap anything it got wrong to remove it.</Text>
            <View style={styles.chips}>
              {items.map(item => (
                <TouchableOpacity key={item} style={styles.chip} onPress={() => dropItem(item)}>
                  <Text style={styles.chipText}>{item}</Text>
                  <Ionicons name="close" size={13} color={COLORS.warmGray} />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Cook tonight</Text>
            {matches.length === 0 ? (
              <Text style={styles.empty}>No recipes to match against yet.</Text>
            ) : (
              matches.slice(0, 10).map(m => (
                <TouchableOpacity
                  key={m.recipe.id}
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/recipe/${m.recipe.id}`)}
                >
                  <Image source={{ uri: m.recipe.image }} style={styles.cardImage} contentFit="cover" />
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={2}>{m.recipe.title}</Text>
                    <View style={styles.badgeRow}>
                      <View style={[styles.badge, m.missing.length === 0 ? styles.badgeGreen : styles.badgeOrange]}>
                        <Text style={[styles.badgeText, m.missing.length === 0 ? styles.badgeTextGreen : styles.badgeTextOrange]}>
                          {m.missing.length === 0 ? 'Ready to cook' : `Buy ${m.missing.length}`}
                        </Text>
                      </View>
                      <Text style={styles.coverage}>{Math.round(m.coverage * 100)}% in your fridge</Text>
                    </View>
                    {m.missing.length > 0 && (
                      <>
                        <Text style={styles.missing} numberOfLines={2}>
                          Missing: {m.missing.map(i => i.name).join(', ')}
                        </Text>
                        <TouchableOpacity
                          style={styles.addBtn}
                          onPress={() => addMissing(m)}
                          disabled={addingFor !== null}
                        >
                          <Ionicons name="cart-outline" size={14} color={COLORS.navy} />
                          <Text style={styles.addBtnText}>
                            {addingFor === m.recipe.id
                              ? 'Adding…'
                              : `Add ${m.missing.length} missing to list`}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: HEADER_TOP, paddingBottom: 14,
    backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.navy, letterSpacing: 0.3 },
  body: { padding: 20 },
  lead: { fontFamily: FONTS.body, fontSize: 14, color: COLORS.warmGray, lineHeight: 20, marginBottom: 14 },
  quotaBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: 13, paddingVertical: 10, marginBottom: 18,
  },
  quotaText: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.charcoal },

  gate: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  gateIcon: { fontSize: 52, marginBottom: 14 },
  gateTitle: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.navy, marginBottom: 8 },
  gateText: { fontFamily: FONTS.body, fontSize: 14.5, color: COLORS.warmGray, textAlign: 'center', lineHeight: 21, marginBottom: 22 },
  gateBtn: { backgroundColor: COLORS.orange, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24 },
  gateBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: '#FFF' },

  tray: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 92, height: 92, borderRadius: RADIUS.md },
  thumbRemove: {
    position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.navy, justifyContent: 'center', alignItems: 'center',
  },
  addTile: {
    width: 92, height: 92, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    borderStyle: 'dashed', backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', gap: 4,
  },
  addTileText: { fontFamily: FONTS.medium, fontSize: 12, color: COLORS.navy },

  scanBtn: { backgroundColor: COLORS.orange, borderRadius: 26, paddingVertical: 16, alignItems: 'center' },
  scanBtnDisabled: { backgroundColor: '#E8D9C8' },
  scanBtnText: { fontFamily: FONTS.bold, fontSize: 15, color: '#FFF', letterSpacing: 0.3 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28 },
  sectionTitle: { fontFamily: FONTS.display, fontSize: 20, color: COLORS.navy, marginTop: 28, marginBottom: 10 },
  resetText: { fontFamily: FONTS.semibold, fontSize: 13, color: COLORS.orange, marginTop: 28 },
  hint: { fontFamily: FONTS.body, fontSize: 12.5, color: COLORS.warmGray, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7,
  },
  chipText: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.charcoal },

  empty: { fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.warmGray },
  card: {
    flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: RADIUS.md, marginBottom: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border,
  },
  cardImage: { width: 104, height: 104 },
  cardBody: { flex: 1, padding: 13, justifyContent: 'center' },
  cardTitle: { fontFamily: FONTS.semibold, fontSize: 15.5, color: COLORS.navy, marginBottom: 7 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
  badgeGreen: { backgroundColor: '#E8F5E9' },
  badgeOrange: { backgroundColor: '#FFF3EC' },
  badgeText: { fontFamily: FONTS.semibold, fontSize: 11.5 },
  badgeTextGreen: { color: COLORS.green },
  badgeTextOrange: { color: COLORS.orange },
  coverage: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.warmGray },
  missing: { fontFamily: FONTS.body, fontSize: 12, color: COLORS.warmGray, marginTop: 6 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 9, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cream,
  },
  addBtnText: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.navy },
});
