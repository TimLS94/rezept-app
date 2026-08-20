// The other end of a shared recipe link.
//
// Two shapes arrive here, and the difference is deliberate:
//
//   A creator's recipe is only ever an id. This screen hands it straight to
//   the ordinary recipe screen, which is where the paywall already lives — a
//   paid recipe shared by a subscriber opens as a preview for the recipient
//   until they buy it or subscribe to the creator. Nothing is copied, so a
//   link cannot be used to get round paying.
//
//   A personal recipe arrives as a snapshot, because it lives behind RLS in
//   the sender's cookbook and no amount of asking would let a recipient read
//   it. Here it is shown as a preview with one button: put a copy in my
//   cookbook. Importing is a copy, not a reference — the sender can delete
//   theirs afterwards and yours stays.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { snapshotToMyRecipe, snapshotToInput, saveMyRecipe, MyRecipe } from '../../lib/myRecipes';
import { COLORS, FONTS } from '../../lib/theme';
import { HEADER_TOP } from '../../lib/layout';
import { goBackOr } from '../../lib/nav';

type State =
  | { step: 'loading' }
  | { step: 'error'; message: string }
  | { step: 'recipe'; recipe: MyRecipe; from: string };

export default function SharedRecipeScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { isGuest } = useAuth();
  const [state, setState] = useState<State>({ step: 'loading' });
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) {
        setState({ step: 'error', message: 'That link is incomplete.' });
        return;
      }
      const { data, error } = await supabase.rpc('get_recipe_share', { p_token: token });
      if (!active) return;

      if (error) {
        setState({ step: 'error', message: error.message });
        return;
      }
      if (!data?.ok) {
        setState({
          step: 'error',
          message:
            data?.error === 'not_found'
              ? 'This link has expired, or the recipe was unshared.'
              : 'That link could not be opened.',
        });
        return;
      }

      // Creator recipes resolve through the normal screen, paywall and all.
      if (data.kind === 'creator') {
        router.replace(`/recipe/${data.recipe_id}`);
        return;
      }

      if (!data.payload) {
        setState({ step: 'error', message: 'The recipe behind this link is empty.' });
        return;
      }
      setState({
        step: 'recipe',
        recipe: snapshotToMyRecipe(data.payload),
        from: data.shared_by || 'A SpoonDrop user',
      });
    })();
    return () => { active = false; };
  }, [token]);

  const importIt = async () => {
    if (state.step !== 'recipe' || importing) return;
    if (isGuest) {
      Alert.alert(
        'Sign in first',
        'Your cookbook lives with your account, so importing needs one.',
        [{ text: 'Not now', style: 'cancel' }, { text: 'Sign in', onPress: () => router.push('/login') }],
      );
      return;
    }

    setImporting(true);
    const result = await saveMyRecipe(snapshotToInput({
      ...toRow(state.recipe),
    }));
    setImporting(false);

    if ('error' in result) {
      Alert.alert('Could not import', result.error);
      return;
    }
    router.replace(`/cookbook/${result.id}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/')}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shared recipe</Text>
        <View style={{ width: 60 }} />
      </View>

      {state.step === 'loading' ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.orange} /></View>
      ) : state.step === 'error' ? (
        <View style={styles.center}>
          <Text style={styles.errorIcon}>🔗</Text>
          <Text style={styles.errorTitle}>Nothing to open</Text>
          <Text style={styles.errorText}>{state.message}</Text>
          <TouchableOpacity style={styles.primary} onPress={() => router.replace('/')}>
            <Text style={styles.primaryText}>Go home</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {state.recipe.image ? (
            <Image source={{ uri: state.recipe.image }} style={styles.hero} contentFit="cover" />
          ) : (
            <View style={[styles.hero, styles.heroEmpty]}><Text style={styles.heroIcon}>🍽️</Text></View>
          )}

          <View style={styles.body}>
            <Text style={styles.from}>{state.from} shared this with you</Text>
            <Text style={styles.title}>{state.recipe.title}</Text>
            {state.recipe.description ? (
              <Text style={styles.description}>{state.recipe.description}</Text>
            ) : null}

            <View style={styles.facts}>
              <Fact value={`${state.recipe.prepTime + state.recipe.cookTime}`} label="min" />
              <Fact value={`${state.recipe.servings}`} label="servings" />
              <Fact value={`${state.recipe.ingredients.length}`} label="ingredients" />
              <Fact value={`${state.recipe.steps.length}`} label="steps" />
            </View>

            <TouchableOpacity style={styles.primary} onPress={importIt} disabled={importing}>
              <Text style={styles.primaryText}>
                {importing ? 'Adding…' : '📖 Add to my cookbook'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.note}>
              You get your own copy — edit it, cook it, change the servings. Nothing you do
              touches theirs, and nothing they do changes yours.
            </Text>

            {state.recipe.ingredients.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.section}>Ingredients</Text>
                {state.recipe.ingredients.map((ing, i) => (
                  <View key={i} style={styles.ingredient}>
                    <Text style={styles.amount}>{ing.amount} {ing.unit}</Text>
                    <Text style={styles.ingName}>{ing.name}</Text>
                  </View>
                ))}
              </View>
            )}

            {state.recipe.steps.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.section}>Steps</Text>
                {state.recipe.steps.map((step, i) => (
                  <View key={i} style={styles.step}>
                    <View style={styles.stepNo}><Text style={styles.stepNoText}>{i + 1}</Text></View>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/** Back to the row shape snapshotToInput expects, so the import path is the
 *  same one the editor and the importer already use. */
function toRow(r: MyRecipe) {
  return {
    title: r.title,
    description: r.description,
    image_url: r.image,
    prep_time: r.prepTime,
    cook_time: r.cookTime,
    servings: r.servings,
    calories: r.calories,
    cost: r.cost,
    difficulty: r.difficulty,
    tags: r.dietary,
    ingredients: r.ingredients,
    nutrition: r.nutrition,
    instructions: r.steps.map((text, i) => ({
      text,
      timer: r.stepTimers?.[i] ?? null,
      image: r.stepImages?.[i] ?? null,
    })),
    source_url: r.sourceUrl,
  };
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: HEADER_TOP, paddingBottom: 16,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  back: { fontSize: 16, color: COLORS.orange, fontWeight: '600', width: 60 },
  headerTitle: { fontFamily: FONTS.display, fontSize: 18, color: COLORS.navy },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  hero: { width: '100%', height: 220 },
  heroEmpty: { backgroundColor: '#F0EAE0', alignItems: 'center', justifyContent: 'center' },
  heroIcon: { fontSize: 56 },

  body: { padding: 20 },
  from: { fontSize: 13, color: COLORS.orange, fontWeight: '700', marginBottom: 6 },
  title: { fontFamily: FONTS.display, fontSize: 26, color: COLORS.navy },
  description: { fontSize: 15, color: COLORS.warmGray, lineHeight: 22, marginTop: 8 },

  facts: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: '#FFF', borderRadius: 16, paddingVertical: 16, marginTop: 16, marginBottom: 16,
  },
  fact: { alignItems: 'center' },
  factValue: { fontSize: 18, fontWeight: '700', color: COLORS.navy },
  factLabel: { fontSize: 12, color: '#8A8378', marginTop: 2 },

  primary: {
    backgroundColor: COLORS.orange, borderRadius: 14, paddingVertical: 17,
    alignItems: 'center', marginTop: 8,
  },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  note: { fontSize: 12.5, color: '#8A8378', lineHeight: 18, marginTop: 10, marginBottom: 8 },

  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, marginTop: 16 },
  section: { fontSize: 16, fontWeight: '700', color: COLORS.navy, marginBottom: 10 },
  ingredient: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F5F1EA' },
  amount: { width: 84, fontSize: 14, color: COLORS.orange, fontWeight: '600' },
  ingName: { flex: 1, fontSize: 14, color: '#333' },
  step: { flexDirection: 'row', marginBottom: 12 },
  stepNo: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.orange,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  stepNoText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  stepText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },

  errorIcon: { fontSize: 48, marginBottom: 12 },
  errorTitle: { fontSize: 19, fontWeight: '700', color: COLORS.navy },
  errorText: { fontSize: 14, color: COLORS.warmGray, textAlign: 'center', marginTop: 8 },
});
