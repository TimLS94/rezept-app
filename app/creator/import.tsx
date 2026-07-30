import { useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { useAuth, canUploadRecipes } from '../../lib/auth';
import { fetchInstagramContent, isValidInstagramUrl, buildExtractionContent } from '../../lib/instagram';
import { extractRecipeWithAI, extractRecipeFromImages, extractRecipeFromVideoAudio, ExtractedRecipe } from '../../lib/openai';
import { createRecipe } from '../../lib/recipes';
import { uploadBase64Image } from '../../lib/storage';
import { DietaryTag, Ingredient } from '../../data/recipes';

type Step = 'input' | 'extracting' | 'review' | 'saving';
type InputMode = 'url' | 'screenshot' | 'video' | 'text';

// A recipe's text can span several frames (ingredients + each step); Vision
// de-dupes across images, so allow a comfortable number.
const MAX_SCREENSHOTS = 10;

export default function ImportRecipeScreen() {
  const { role } = useAuth();
  const [step, setStep] = useState<Step>('input');
  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [url, setUrl] = useState('');
  const [manualText, setManualText] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]); // base64 images
  const [screenshotUris, setScreenshotUris] = useState<string[]>([]); // for preview
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [recipe, setRecipe] = useState<ExtractedRecipe | null>(null);
  const [error, setError] = useState('');

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

  const removeScreenshot = (index: number) => {
    setScreenshotUris(prev => prev.filter((_, i) => i !== index));
    setScreenshots(prev => prev.filter((_, i) => i !== index));
  };

  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setVideoUri(result.assets[0].uri);
    }
  };

  const handleImport = async () => {
    setError('');

    // Screenshot mode — Vision OCR from uploaded images.
    if (inputMode === 'screenshot') {
      if (screenshots.length === 0) {
        Alert.alert('No screenshots', 'Please add at least one screenshot');
        return;
      }
      setStep('extracting');
      const aiResult = await extractRecipeFromImages(screenshots);
      if (!aiResult.success) {
        setError(aiResult.error);
        setStep('input');
        return;
      }
      if (screenshotUris.length > 0) setThumbnailUrl(screenshotUris[0]);
      setRecipe(aiResult.recipe);
      setStep('review');
      return;
    }

    // Video mode — transcribe audio and extract recipe
    if (inputMode === 'video') {
      if (!videoUri) {
        Alert.alert('No video', 'Please select a video');
        return;
      }
      setStep('extracting');
      const aiResult = await extractRecipeFromVideoAudio(videoUri);
      if (!aiResult.success) {
        setError(aiResult.error);
        setStep('input');
        return;
      }
      setRecipe(aiResult.recipe);
      setStep('review');
      return;
    }

    // Text mode — paste any recipe text, AI structures it into the app format.
    if (inputMode === 'text') {
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
      setRecipe(aiResult.recipe);
      setStep('review');
      return;
    }

    // URL mode — Instagram link.
    if (!url.trim()) {
      Alert.alert('Missing URL', 'Please paste an Instagram link');
      return;
    }

    if (!isValidInstagramUrl(url.trim())) {
      Alert.alert('Invalid URL', 'Please use a valid Instagram post, reel, or IGTV link');
      return;
    }

    setStep('extracting');

    // Step 1: Fetch Instagram content
    const igResult = await fetchInstagramContent(url.trim());

    if (!igResult.success) {
      setError(igResult.error);
      setStep('input');
      return;
    }

    if (igResult.content.thumbnailUrl) {
      setThumbnailUrl(igResult.content.thumbnailUrl);
    }

    // Step 2: Extract recipe with AI
    const content = buildExtractionContent(igResult.content);

    if (!content.trim()) {
      setError('No content found in this post. Try a different link.');
      setStep('input');
      return;
    }

    const aiResult = await extractRecipeWithAI(content);

    if (!aiResult.success) {
      setError(aiResult.error);
      setStep('input');
      return;
    }

    setRecipe(aiResult.recipe);
    setStep('review');
  };

  const handleSave = async () => {
    if (!recipe) return;

    setStep('saving');

    // A screenshot thumbnail is a device-local file:// URI — upload it to Storage
    // so the recipe keeps a real hosted image. URL imports already have a remote
    // thumbnail; text imports fall back to a stock image.
    let image = thumbnailUrl || 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=800';
    if (screenshots.length > 0) {
      const hosted = await uploadBase64Image(screenshots[0], 'recipes');
      if (hosted) image = hosted;
    }

    const result = await createRecipe({
      title: recipe.title,
      description: recipe.description,
      image,
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
    });

    if ('error' in result) {
      Alert.alert('Error', result.error);
      setStep('review');
      return;
    }

    Alert.alert('Recipe Imported! 🎉', 'Your recipe is now live.', [
      { text: 'View Recipe', onPress: () => router.replace(`/recipe/${result.id}`) },
      { text: 'Import Another', onPress: () => {
        setStep('input');
        setUrl('');
        setManualText('');
        setScreenshots([]);
        setScreenshotUris([]);
        setRecipe(null);
        setThumbnailUrl('');
      }},
    ]);
  };

  // Access control
  if (!canUploadRecipes(role)) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import Recipe</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.blockedState}>
          <Text style={styles.blockedIcon}>🔒</Text>
          <Text style={styles.blockedTitle}>Creators only</Text>
          <Text style={styles.blockedText}>
            Recipe imports are available for creator accounts.
          </Text>
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
        <Text style={styles.headerTitle}>Import Recipe</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Input Step */}
        {step === 'input' && (
          <View style={styles.inputSection}>
            <View style={styles.heroBox}>
              <Text style={styles.heroIcon}>📱</Text>
              <Text style={styles.heroTitle}>Import a Recipe</Text>
              <Text style={styles.heroText}>
                From an Instagram link, screenshots, or just paste the text — AI turns it into a structured recipe.
              </Text>
            </View>

            {/* Mode Toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeButton, inputMode === 'url' && styles.modeButtonActive]}
                onPress={() => setInputMode('url')}
              >
                <Text style={[styles.modeButtonText, inputMode === 'url' && styles.modeButtonTextActive]}>
                  🔗 Instagram
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, inputMode === 'screenshot' && styles.modeButtonActive]}
                onPress={() => setInputMode('screenshot')}
              >
                <Text style={[styles.modeButtonText, inputMode === 'screenshot' && styles.modeButtonTextActive]}>
                  📸 Foto
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, inputMode === 'video' && styles.modeButtonActive]}
                onPress={() => setInputMode('video')}
              >
                <Text style={[styles.modeButtonText, inputMode === 'video' && styles.modeButtonTextActive]}>
                  🎬 Video
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

            {/* URL Mode */}
            {inputMode === 'url' && (
              <View style={styles.field}>
                <Text style={styles.label}>Instagram URL</Text>
                <TextInput
                  style={styles.input}
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://instagram.com/reel/..."
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
            )}

            {/* Screenshot Mode */}
            {inputMode === 'screenshot' && (
              <View style={styles.field}>
                <Text style={styles.label}>Screenshots (max {MAX_SCREENSHOTS})</Text>
                {screenshotUris.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.screenshotRow}>
                    {screenshotUris.map((uri, index) => (
                      <View key={index} style={styles.screenshotPreview}>
                        <Image source={{ uri }} style={styles.screenshotImage} />
                        <TouchableOpacity style={styles.removeScreenshot} onPress={() => removeScreenshot(index)}>
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
                    {screenshots.length === 0 ? '📸 Add Screenshots' : '+ Add More'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.screenshotHint}>
                  Upload recipe screenshots. AI reads ingredients and steps from the images.
                </Text>
              </View>
            )}

            {/* Video Mode */}
            {inputMode === 'video' && (
              <View style={styles.field}>
                <Text style={styles.label}>Recipe Video</Text>
                {videoUri ? (
                  <View style={styles.videoPreview}>
                    <View style={styles.videoPlaceholder}>
                      <Text style={styles.videoPlaceholderIcon}>🎬</Text>
                      <Text style={styles.videoPlaceholderText}>Video selected</Text>
                    </View>
                    <TouchableOpacity style={styles.removeVideo} onPress={() => setVideoUri(null)}>
                      <Text style={styles.removeVideoText}>× Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.uploadButton} onPress={pickVideo}>
                    <Text style={styles.uploadButtonText}>🎬 Select Video</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.screenshotHint}>
                  Upload a cooking video. AI transcribes the audio and extracts the recipe.
                </Text>
              </View>
            )}

            {/* Text Mode */}
            {inputMode === 'text' && (
              <View style={styles.field}>
                <Text style={styles.label}>Recipe text</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={manualText}
                  onChangeText={setManualText}
                  placeholder={"Paste any recipe text here — a caption, notes, a website copy…\n\nAI will turn it into a structured recipe (title, ingredients with amounts, steps, tags)."}
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={12}
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
              <Text style={styles.primaryButtonText}>Extract Recipe</Text>
            </TouchableOpacity>

            {inputMode === 'url' && (
              <View style={styles.supportedBox}>
                <Text style={styles.supportedTitle}>Supported links:</Text>
                <Text style={styles.supportedText}>• Instagram Posts (/p/...)</Text>
                <Text style={styles.supportedText}>• Instagram Reels (/reel/...)</Text>
                <Text style={styles.supportedText}>• IGTV Videos (/tv/...)</Text>
              </View>
            )}
          </View>
        )}

        {/* Extracting Step */}
        {step === 'extracting' && (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="large" color="#F57C00" />
            <Text style={styles.loadingTitle}>Extracting Recipe...</Text>
            <Text style={styles.loadingText}>
              Analyzing the post content with AI. This may take a few seconds.
            </Text>
            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
            ) : null}
          </View>
        )}

        {/* Review Step */}
        {step === 'review' && recipe && (
          <View style={styles.reviewSection}>
            <View style={styles.successBadge}>
              <Text style={styles.successText}>✓ Recipe extracted — edit if needed</Text>
            </View>

            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={styles.previewImage} />
            ) : null}

            <View style={styles.reviewCard}>
              <Text style={styles.editLabel}>Title</Text>
              <TextInput
                style={styles.editInput}
                value={recipe.title}
                onChangeText={(t) => setRecipe({ ...recipe, title: t })}
                placeholder="Recipe name"
              />
              <Text style={styles.editLabel}>Description</Text>
              <TextInput
                style={[styles.editInput, styles.editTextArea]}
                value={recipe.description}
                onChangeText={(t) => setRecipe({ ...recipe, description: t })}
                placeholder="Short description"
                multiline
              />

              <View style={styles.metaEditRow}>
                <View style={styles.metaEditItem}>
                  <Text style={styles.editLabel}>Prep (min)</Text>
                  <TextInput
                    style={styles.editInputSmall}
                    value={String(recipe.prepTime)}
                    onChangeText={(t) => setRecipe({ ...recipe, prepTime: parseInt(t) || 0 })}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.metaEditItem}>
                  <Text style={styles.editLabel}>Cook (min)</Text>
                  <TextInput
                    style={styles.editInputSmall}
                    value={String(recipe.cookTime)}
                    onChangeText={(t) => setRecipe({ ...recipe, cookTime: parseInt(t) || 0 })}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.metaEditItem}>
                  <Text style={styles.editLabel}>Servings</Text>
                  <TextInput
                    style={styles.editInputSmall}
                    value={String(recipe.servings)}
                    onChangeText={(t) => setRecipe({ ...recipe, servings: parseInt(t) || 4 })}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.metaEditItem}>
                  <Text style={styles.editLabel}>Calories</Text>
                  <TextInput
                    style={styles.editInputSmall}
                    value={String(recipe.calories)}
                    onChangeText={(t) => setRecipe({ ...recipe, calories: parseInt(t) || 0 })}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Ingredients ({recipe.ingredients.length})
                </Text>
                <TouchableOpacity onPress={() => setRecipe({
                  ...recipe,
                  ingredients: [...recipe.ingredients, { name: '', amount: 1, unit: 'piece', category: 'other' }]
                })}>
                  <Text style={styles.addLink}>+ Add</Text>
                </TouchableOpacity>
              </View>
              {recipe.ingredients.map((ing, i) => (
                <View key={i} style={styles.ingredientEditRow}>
                  <TextInput
                    style={styles.ingredientAmountInput}
                    value={String(ing.amount)}
                    onChangeText={(t) => {
                      const updated = [...recipe.ingredients];
                      updated[i] = { ...ing, amount: parseFloat(t) || 0 };
                      setRecipe({ ...recipe, ingredients: updated });
                    }}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={styles.ingredientUnitInput}
                    value={ing.unit}
                    onChangeText={(t) => {
                      const updated = [...recipe.ingredients];
                      updated[i] = { ...ing, unit: t };
                      setRecipe({ ...recipe, ingredients: updated });
                    }}
                  />
                  <TextInput
                    style={styles.ingredientNameInput}
                    value={ing.name}
                    onChangeText={(t) => {
                      const updated = [...recipe.ingredients];
                      updated[i] = { ...ing, name: t };
                      setRecipe({ ...recipe, ingredients: updated });
                    }}
                    placeholder="Ingredient"
                  />
                  <TouchableOpacity onPress={() => {
                    const updated = recipe.ingredients.filter((_, idx) => idx !== i);
                    setRecipe({ ...recipe, ingredients: updated });
                  }}>
                    <Text style={styles.removeIngredient}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  Steps ({recipe.steps.length})
                </Text>
                <TouchableOpacity onPress={() => setRecipe({
                  ...recipe,
                  steps: [...recipe.steps, '']
                })}>
                  <Text style={styles.addLink}>+ Add</Text>
                </TouchableOpacity>
              </View>
              {recipe.steps.map((stepText, i) => (
                <View key={i} style={styles.stepEditRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <TextInput
                    style={styles.stepEditInput}
                    value={stepText}
                    onChangeText={(t) => {
                      const updated = [...recipe.steps];
                      updated[i] = t;
                      setRecipe({ ...recipe, steps: updated });
                    }}
                    placeholder={`Step ${i + 1}`}
                    multiline
                  />
                  <TouchableOpacity onPress={() => {
                    const updated = recipe.steps.filter((_, idx) => idx !== i);
                    setRecipe({ ...recipe, steps: updated });
                  }}>
                    <Text style={styles.removeIngredient}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

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
                <Text style={styles.saveButtonText}>Save Recipe</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </View>
        )}

        {/* Saving Step */}
        {step === 'saving' && (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="large" color="#F57C00" />
            <Text style={styles.loadingTitle}>Saving Recipe...</Text>
          </View>
        )}
      </ScrollView>
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
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: { width: 60 },
  backText: { fontSize: 16, color: '#F57C00', fontWeight: '600' },
  headerTitle: { fontFamily: 'Anton_400Regular', fontSize: 20, color: '#0D2B63', letterSpacing: 0.3 },
  content: { flex: 1 },
  blockedState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  blockedIcon: { fontSize: 64, marginBottom: 16 },
  blockedTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  blockedText: { fontSize: 15, color: '#888', textAlign: 'center', marginTop: 10 },

  // Input section
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
  textArea: { minHeight: 200, paddingTop: 14, textAlignVertical: 'top' },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  errorText: { color: '#C62828', fontSize: 14 },
  primaryButton: {
    backgroundColor: '#F57C00',
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
  supportedText: { fontSize: 13, color: '#888', marginBottom: 4 },

  // Mode toggle + screenshot picker
  modeToggle: { flexDirection: 'row', backgroundColor: '#F0F0F0', borderRadius: 12, padding: 4, marginBottom: 20 },
  modeButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  modeButtonActive: { backgroundColor: '#FFF' },
  modeButtonText: { fontSize: 14, fontWeight: '600', color: '#888' },
  modeButtonTextActive: { color: '#1A1A1A' },
  screenshotRow: { marginBottom: 12 },
  screenshotPreview: { position: 'relative', marginRight: 10 },
  screenshotImage: { width: 100, height: 150, borderRadius: 10 },
  removeScreenshot: { position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: '#FF5252', justifyContent: 'center', alignItems: 'center' },
  removeScreenshotText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  uploadButton: { backgroundColor: '#FFF', borderWidth: 2, borderColor: '#F57C00', borderStyle: 'dashed', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 12 },
  uploadButtonText: { color: '#F57C00', fontSize: 16, fontWeight: '600' },
  screenshotHint: { fontSize: 13, color: '#888', lineHeight: 20, textAlign: 'center' },

  // Loading section
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

  // Review section
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
  metaValue: { fontSize: 18, fontWeight: '700', color: '#F57C00' },
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
  ingredientAmount: { width: 80, fontSize: 14, color: '#F57C00', fontWeight: '600' },
  ingredientName: { flex: 1, fontSize: 14, color: '#333' },
  stepRow: { flexDirection: 'row', marginBottom: 12 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F57C00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  stepText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: '#FFF5F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: { fontSize: 13, color: '#F57C00', fontWeight: '500' },

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
  // Video styles
  videoPreview: { marginBottom: 12 },
  videoPlaceholder: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 32, alignItems: 'center' },
  videoPlaceholderIcon: { fontSize: 48, marginBottom: 8 },
  videoPlaceholderText: { fontSize: 15, color: '#666', fontWeight: '500' },
  removeVideo: { marginTop: 12, alignItems: 'center' },
  removeVideoText: { fontSize: 14, color: '#E53935', fontWeight: '600' },
  // Edit styles for review step
  editLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6, marginTop: 12 },
  editInput: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 14, fontSize: 16, color: '#1A1A1A' },
  editTextArea: { minHeight: 80, textAlignVertical: 'top' },
  metaEditRow: { flexDirection: 'row', marginTop: 16, gap: 8 },
  metaEditItem: { flex: 1 },
  editInputSmall: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, fontSize: 15, textAlign: 'center', color: '#1A1A1A' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addLink: { fontSize: 14, color: '#F57C00', fontWeight: '600' },
  ingredientEditRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  ingredientAmountInput: { width: 50, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14, textAlign: 'center' },
  ingredientUnitInput: { width: 60, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14 },
  ingredientNameInput: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14 },
  removeIngredient: { fontSize: 22, color: '#E53935', fontWeight: '600', paddingHorizontal: 8 },
  stepEditRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  stepEditInput: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14, minHeight: 40 },
});
