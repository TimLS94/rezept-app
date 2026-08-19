import { useState, useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  View,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth, canImportToCookbook } from '../../lib/auth';
import { extractRecipeWithAI, extractRecipeFromImages, ExtractedRecipe } from '../../lib/openai';
import { saveMyRecipe, countMyRecipes } from '../../lib/myRecipes';
import Paywall from '../../components/Paywall';
import { DietaryTag, Ingredient } from '../../data/recipes';
import RecipeEditor, { EditableRecipe } from '../../components/RecipeEditor';
import { HEADER_TOP } from '../../lib/layout';
import { goBackOr } from '../../lib/nav';

type Step = 'input' | 'extracting' | 'review' | 'saving';
// Import modes: screenshot from gallery, camera photo, or pasted text
type InputMode = 'screenshot' | 'camera' | 'text';

// A recipe's text can span several on-screen frames (ingredients + each step).
// Vision de-dupes across images, so allow a comfortable number.
const MAX_SCREENSHOTS = 10;

// Free accounts may build a small cookbook before the paywall appears, so the
// feature can be tried before it's bought. The AI cost of an import is ~0.24
// cents, so a handful of free ones is cheap next to the conversion it buys.
const FREE_IMPORT_LIMIT = 3;

export default function ImportRecipeScreen() {
  const { isGuest, role, isPremium, refresh } = useAuth();
  const [ownedCount, setOwnedCount] = useState<number | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const params = useLocalSearchParams<{ sharedUrl?: string; sharedText?: string }>();
  
  const [step, setStep] = useState<Step>('input');
  const [inputMode, setInputMode] = useState<InputMode>('screenshot'); // Default to screenshot
  const [url, setUrl] = useState('');
  const [manualText, setManualText] = useState('');
  // The field grows with its content instead of scrolling inside a fixed box.
  // Nested scrolling — a 200pt window inside a scrolling page — is what made a
  // long recipe unreadable: neither scroll surface did what the finger meant.
  const [textHeight, setTextHeight] = useState(180);
  const [textFocused, setTextFocused] = useState(false);
  const [screenshots, setScreenshots] = useState<string[]>([]); // base64 images
  const [screenshotUris, setScreenshotUris] = useState<string[]>([]); // for preview
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [recipe, setRecipe] = useState<EditableRecipe | null>(null);
  const [error, setError] = useState('');

  // Move an extracted recipe into the editable review step, pre-filling the
  // source link from whatever URL we know (typed, or shared into the app).
  const showReview = (extracted: ExtractedRecipe) => {
    setRecipe({ ...extracted, sourceUrl: url.trim() || params.sharedUrl || '' });
    setStep('review');
  };

  // Handle incoming shared URL or text
  useEffect(() => {
    if (isGuest || isPremium) return;
    countMyRecipes().then(setOwnedCount);
  }, [isGuest, isPremium]);

  useEffect(() => {
    if (params.sharedUrl) {
      // Keep the link as the recipe's source, but users can't extract straight
      // from a URL — direct Instagram import is a creator-only feature. Guide
      // them to screenshot the recipe instead.
      setUrl(params.sharedUrl);
      setInputMode('screenshot');
      setTimeout(() => {
        Alert.alert(
          'Recipe Link Received! 📱',
          "We saved the link as the source. To import the recipe, add a screenshot of it — AI will read the ingredients and steps from the image.",
          [{ text: 'Got it' }]
        );
      }, 300);
    } else if (params.sharedText) {
      setManualText(params.sharedText);
      setInputMode('text');
    }
  }, [params.sharedUrl, params.sharedText]);

  // Pick screenshots from gallery
  const pickScreenshots = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newUris = result.assets.map(a => a.uri);
      const newBase64 = result.assets.map(a => a.base64 || '').filter(Boolean);
      
      setScreenshotUris(prev => [...prev, ...newUris].slice(0, MAX_SCREENSHOTS));
      setScreenshots(prev => [...prev, ...newBase64].slice(0, MAX_SCREENSHOTS));
    }
  };

  // Remove a screenshot
  const removeScreenshot = (index: number) => {
    setScreenshotUris(prev => prev.filter((_, i) => i !== index));
    setScreenshots(prev => prev.filter((_, i) => i !== index));
  };

  // Take photo with camera
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      if (asset.base64) {
        setScreenshotUris(prev => [...prev, asset.uri].slice(0, MAX_SCREENSHOTS));
        setScreenshots(prev => [...prev, asset.base64!].slice(0, MAX_SCREENSHOTS));
      }
    }
  };

  const handleImport = async () => {
    setError('');

    // Screenshot or Camera mode (both use images)
    if (inputMode === 'screenshot' || inputMode === 'camera') {
      if (screenshots.length === 0) {
        Alert.alert('No images', 'Please add at least one image');
        return;
      }

      setStep('extracting');

      // Use Vision AI to extract from screenshots
      const aiResult = await extractRecipeFromImages(screenshots);

      if (!aiResult.success) {
        setError(aiResult.error);
        setStep('input');
        return;
      }

      // Use first screenshot as thumbnail
      if (screenshotUris.length > 0) {
        setThumbnailUrl(screenshotUris[0]);
      }

      showReview(aiResult.recipe);
      return;
    }

    // Text mode
    if (!manualText.trim()) {
      Alert.alert('Missing text', 'Please paste the recipe text');
      return;
    }

    setStep('extracting');
    
    const aiResult = await extractRecipeWithAI(manualText.trim());

    if (!aiResult.success) {
      setError(aiResult.error);
      setStep('input');
      return;
    }

    showReview(aiResult.recipe);
  };

  const handleSave = async () => {
    if (!recipe) return;

    setStep('saving');

    const result = await saveMyRecipe({
      title: recipe.title,
      description: recipe.description,
      image: thumbnailUrl || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=800',
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      servings: recipe.servings,
      calories: recipe.calories,
      cost: 0,
      difficulty: recipe.difficulty,
      dietary: recipe.dietary.filter(d => 
        ['healthy', 'high-protein', 'gluten-free', 'vegetarian', 'vegan', 'dairy-free'].includes(d)
      ) as DietaryTag[],
      ingredients: recipe.ingredients as Ingredient[],
      steps: recipe.steps,
      sourceUrl: recipe.sourceUrl?.trim() || undefined,
    });

    if ('error' in result) {
      if (result.error === 'not-authenticated') {
        Alert.alert('Sign in required', 'Sign in to save recipes to your cookbook.', [
          { text: 'Cancel', style: 'cancel', onPress: () => setStep('review') },
          { text: 'Sign in', onPress: () => router.push('/login') },
        ]);
      } else {
        Alert.alert('Error', result.error);
        setStep('review');
      }
      return;
    }

    Alert.alert('Saved to Cookbook! 📚', 'Your recipe is ready to use.', [
      { text: 'View Cookbook', onPress: () => router.replace('/cookbook') },
      { text: 'Import Another', onPress: () => {
        setStep('input');
        setUrl('');
        setRecipe(null);
        setThumbnailUrl('');
      }},
    ]);
  };

  // Guest prompt
  if (!canImportToCookbook(role)) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBackOr('/cookbook')} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import Recipe</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.guestState}>
          <Text style={styles.guestIcon}>📱</Text>
          <Text style={styles.guestTitle}>Sign in to import</Text>
          <Text style={styles.guestText}>
            Create an account to keep your recipes in a cookbook.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/login')}>
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Signed in but out of free imports: offer Premium rather than a dead end.
  // Note this gates the IMPORT, not the role — publishing as a creator is a
  // separate thing and still lives behind canUploadRecipes.
  if (!isPremium && ownedCount !== null && ownedCount >= FREE_IMPORT_LIMIT) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => goBackOr('/cookbook')} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import Recipe</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.guestState}>
          <Text style={styles.guestIcon}>✨</Text>
          <Text style={styles.guestTitle}>You've used your {FREE_IMPORT_LIMIT} free imports</Text>
          <Text style={styles.guestText}>
            Premium turns a screenshot, a photo or pasted text into a
            proper recipe — as often as you like.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setShowPaywall(true)}>
            <Text style={styles.primaryButtonText}>Unlock Premium</Text>
          </TouchableOpacity>
        </View>
        <Paywall
          visible={showPaywall}
          onClose={() => setShowPaywall(false)}
          onSubscribed={refresh}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBackOr('/cookbook')} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import Recipe</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Input Step */}
        {step === 'input' && (
          <View style={styles.inputSection}>
            <View style={styles.heroBox}>
              <Text style={styles.heroIcon}>✨</Text>
              <Text style={styles.heroTitle}>Import a recipe</Text>
              <Text style={styles.heroText}>
                Photograph it, pick a screenshot, or paste the text — it gets turned into a recipe you can cook from.
              </Text>
            </View>

            {/* Mode Toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeButton, inputMode === 'screenshot' && styles.modeButtonActive]}
                onPress={() => setInputMode('screenshot')}
              >
                <Text style={[styles.modeButtonText, inputMode === 'screenshot' && styles.modeButtonTextActive]}>
                  🖼️ Gallery
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, inputMode === 'camera' && styles.modeButtonActive]}
                onPress={() => setInputMode('camera')}
              >
                <Text style={[styles.modeButtonText, inputMode === 'camera' && styles.modeButtonTextActive]}>
                  📷 Camera
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, inputMode === 'text' && styles.modeButtonActive]}
                onPress={() => setInputMode('text')}
              >
                <Text style={[styles.modeButtonText, inputMode === 'text' && styles.modeButtonTextActive]}>
                  📝 Text
                </Text>
              </TouchableOpacity>
            </View>

            {/* Screenshot Mode */}
            {inputMode === 'screenshot' && (
              <View style={styles.field}>
                <Text style={styles.label}>Screenshots (max {MAX_SCREENSHOTS})</Text>
                
                {/* Screenshot previews */}
                {screenshotUris.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.screenshotRow}>
                    {screenshotUris.map((uri, index) => (
                      <View key={index} style={styles.screenshotPreview}>
                        <Image source={{ uri }} style={styles.screenshotImage} />
                        <TouchableOpacity 
                          style={styles.removeScreenshot}
                          onPress={() => removeScreenshot(index)}
                        >
                          <Text style={styles.removeScreenshotText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}

                <TouchableOpacity 
                  style={styles.uploadButton} 
                  onPress={pickScreenshots}
                  disabled={screenshots.length >= MAX_SCREENSHOTS}
                >
                  <Text style={styles.uploadButtonText}>
                    {screenshots.length === 0 ? '🖼️ Select from Gallery' : '+ Add More'}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.screenshotHint}>
                  Pick screenshots of the recipe. The ingredients and steps are read straight off the images.
                </Text>
              </View>
            )}

            {/* Camera Mode */}
            {inputMode === 'camera' && (
              <View style={styles.field}>
                <Text style={styles.label}>Photos (max {MAX_SCREENSHOTS})</Text>
                
                {/* Photo previews */}
                {screenshotUris.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.screenshotRow}>
                    {screenshotUris.map((uri, index) => (
                      <View key={index} style={styles.screenshotPreview}>
                        <Image source={{ uri }} style={styles.screenshotImage} />
                        <TouchableOpacity 
                          style={styles.removeScreenshot}
                          onPress={() => removeScreenshot(index)}
                        >
                          <Text style={styles.removeScreenshotText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}

                <TouchableOpacity 
                  style={styles.uploadButton} 
                  onPress={takePhoto}
                  disabled={screenshots.length >= MAX_SCREENSHOTS}
                >
                  <Text style={styles.uploadButtonText}>
                    {screenshots.length === 0 ? '📷 Take Photo' : '+ Take Another'}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.screenshotHint}>
                  Take a photo of a recipe from a cookbook, magazine, or handwritten note. AI will extract the ingredients and steps.
                </Text>
              </View>
            )}

            {/* Text Mode */}
            {inputMode === 'text' && (
              <View style={styles.field}>
                <View style={styles.fieldHeader}>
                  <Text style={styles.label}>Recipe Text</Text>
                  <View style={styles.fieldTools}>
                    {manualText.length > 0 && (
                      <Text style={styles.charCount}>
                        {manualText.trim().split(/\s+/).length} words
                      </Text>
                    )}
                    {manualText.length === 0 ? (
                      <TouchableOpacity
                        onPress={async () => {
                          const t = await Clipboard.getStringAsync();
                          if (t?.trim()) setManualText(t);
                        }}
                      >
                        <Text style={styles.fieldAction}>Paste</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => setManualText('')}>
                        <Text style={styles.fieldAction}>Clear</Text>
                      </TouchableOpacity>
                    )}
                    {/* A multiline field has no return-to-dismiss — return
                        inserts a newline — so without this the keyboard could
                        only be dismissed by guessing where to tap. */}
                    {textFocused && (
                      <TouchableOpacity onPress={() => Keyboard.dismiss()}>
                        <Text style={styles.fieldActionStrong}>Done</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <TextInput
                  style={[styles.input, styles.textArea, { height: Math.max(180, textHeight) }]}
                  onContentSizeChange={e => setTextHeight(e.nativeEvent.contentSize.height + 24)}
                  onFocus={() => setTextFocused(true)}
                  onBlur={() => setTextFocused(false)}
                  scrollEnabled={false}
                  value={manualText}
                  onChangeText={setManualText}
                  placeholder="Paste the recipe caption or description here...

Example:
🍝 Creamy Garlic Pasta

Ingredients:
- 400g pasta
- 4 cloves garlic
- 200ml cream
- Parmesan cheese

Steps:
1. Cook pasta
2. Sauté garlic in butter
3. Add cream and cheese
4. Toss with pasta"
                  placeholderTextColor="#999"
                  multiline
                  textAlignVertical="top"
                />
              </View>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.primaryButton} onPress={handleImport}>
              <Text style={styles.primaryButtonText}>Extract Recipe with AI</Text>
            </TouchableOpacity>

            <View style={styles.supportedBox}>
              <Text style={styles.supportedTitle}>💡 Tip:</Text>
              <Text style={styles.supportedText}>Screenshots work best when the ingredients and steps are both visible. Long recipes: take two shots and add them together.</Text>
            </View>
          </View>
        )}

        {/* Extracting Step */}
        {step === 'extracting' && (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="large" color="#F2701E" />
            <Text style={styles.loadingTitle}>Extracting Recipe...</Text>
            <Text style={styles.loadingText}>
              AI is analyzing the post. This may take a few seconds.
            </Text>
            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
            ) : null}
          </View>
        )}

        {/* Review Step — fully editable before saving */}
        {step === 'review' && recipe && (
          <View style={styles.reviewSection}>
            <View style={styles.successBadge}>
              <Text style={styles.successText}>✓ Recipe extracted — review & edit below</Text>
            </View>

            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={styles.previewImage} />
            ) : null}

            <RecipeEditor value={recipe} onChange={setRecipe} />

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setStep('input');
                  setRecipe(null);
                }}
              >
                <Text style={styles.secondaryButtonText}>Try Another</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save to Cookbook</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </View>
        )}

        {/* Saving Step */}
        {step === 'saving' && (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="large" color="#F2701E" />
            <Text style={styles.loadingTitle}>Saving...</Text>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF9F2' },
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
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },
  content: { flex: 1 },
  guestState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  guestIcon: { fontSize: 64, marginBottom: 16 },
  guestTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  guestText: { fontSize: 15, color: '#888', textAlign: 'center', marginTop: 10, lineHeight: 22 },

  inputSection: { padding: 20 },
  heroBox: {
    backgroundColor: '#FFF5F0',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  heroIcon: { fontSize: 48, marginBottom: 12 },
  heroTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  heroText: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  input: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  errorText: { color: '#C62828', fontSize: 14 },
  primaryButton: {
    backgroundColor: '#F2701E',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 24,
  },
  primaryButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  supportedBox: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
  },
  supportedTitle: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 },
  supportedText: { fontSize: 13, color: '#888', lineHeight: 20 },

  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  modeButtonActive: {
    backgroundColor: '#FFF',
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  modeButtonTextActive: {
    color: '#1A1A1A',
  },
  textArea: {
    minHeight: 180,
    textAlignVertical: 'top',
    paddingTop: 14,
    fontSize: 15,
    lineHeight: 22,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fieldTools: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  charCount: { fontSize: 12, color: '#9A9A9A' },
  fieldAction: { fontSize: 14, color: '#F2701E', fontWeight: '600' },
  fieldActionStrong: { fontSize: 14, color: '#0D2B63', fontWeight: '700' },
  urlHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },

  screenshotRow: {
    marginBottom: 12,
  },
  screenshotPreview: {
    position: 'relative',
    marginRight: 10,
  },
  screenshotImage: {
    width: 100,
    height: 150,
    borderRadius: 10,
  },
  removeScreenshot: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF5252',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeScreenshotText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  uploadButton: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#F2701E',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadButtonText: {
    color: '#F2701E',
    fontSize: 16,
    fontWeight: '600',
  },
  screenshotHint: {
    fontSize: 13,
    color: '#888',
    lineHeight: 20,
    textAlign: 'center',
  },

  loadingSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    paddingTop: 80,
  },
  loadingTitle: { fontSize: 18, fontWeight: '600', color: '#1A1A1A', marginTop: 20 },
  loadingText: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8 },
  thumbnail: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginTop: 24,
  },

  reviewSection: { padding: 20 },
  successBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successText: { color: '#3C8D40', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  reviewCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  reviewTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  reviewDescription: { fontSize: 15, color: '#666', lineHeight: 22, marginBottom: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-around' },
  metaItem: { alignItems: 'center' },
  metaValue: { fontSize: 18, fontWeight: '700', color: '#F2701E' },
  metaLabel: { fontSize: 12, color: '#888', marginTop: 2 },

  section: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  ingredientRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  ingredientAmount: { width: 80, fontSize: 14, color: '#F2701E', fontWeight: '600' },
  ingredientName: { flex: 1, fontSize: 14, color: '#333' },
  stepRow: { flexDirection: 'row', marginBottom: 12 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F2701E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  stepText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },

  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  secondaryButtonText: { fontSize: 15, fontWeight: '600', color: '#666' },
  saveButton: {
    flex: 2,
    backgroundColor: '#3C8D40',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
