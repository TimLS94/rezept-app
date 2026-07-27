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
import { extractRecipeWithAI, extractRecipeFromImages, ExtractedRecipe } from '../../lib/openai';
import { createRecipe } from '../../lib/recipes';
import { DietaryTag, Ingredient } from '../../data/recipes';

type Step = 'input' | 'extracting' | 'review' | 'saving';
type InputMode = 'url' | 'screenshot';

// A recipe's text can span several frames (ingredients + each step); Vision
// de-dupes across images, so allow a comfortable number.
const MAX_SCREENSHOTS = 10;

export default function ImportRecipeScreen() {
  const { role } = useAuth();
  const [step, setStep] = useState<Step>('input');
  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [url, setUrl] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]); // base64 images
  const [screenshotUris, setScreenshotUris] = useState<string[]>([]); // for preview
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

    const result = await createRecipe({
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
                Import from an Instagram link, or upload screenshots and let AI read the recipe.
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
                  📸 Screenshot
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
                  Upload screenshots of the recipe. AI reads the ingredients and steps from the images.
                </Text>
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
            <ActivityIndicator size="large" color="#FF6B35" />
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
              <Text style={styles.successText}>✓ Recipe extracted successfully!</Text>
            </View>

            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={styles.previewImage} />
            ) : null}

            <View style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>{recipe.title}</Text>
              <Text style={styles.reviewDescription}>{recipe.description}</Text>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaValue}>{recipe.prepTime + recipe.cookTime}</Text>
                  <Text style={styles.metaLabel}>min</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaValue}>{recipe.servings}</Text>
                  <Text style={styles.metaLabel}>servings</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaValue}>{recipe.calories}</Text>
                  <Text style={styles.metaLabel}>cal</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaValue}>{recipe.difficulty}</Text>
                  <Text style={styles.metaLabel}>level</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Ingredients ({recipe.ingredients.length})
              </Text>
              {recipe.ingredients.map((ing, i) => (
                <View key={i} style={styles.ingredientRow}>
                  <Text style={styles.ingredientAmount}>
                    {ing.amount} {ing.unit}
                  </Text>
                  <Text style={styles.ingredientName}>{ing.name}</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Steps ({recipe.steps.length})
              </Text>
              {recipe.steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            {recipe.dietary.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Tags</Text>
                <View style={styles.tagRow}>
                  {recipe.dietary.map((tag, i) => (
                    <View key={i} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

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
            <ActivityIndicator size="large" color="#FF6B35" />
            <Text style={styles.loadingTitle}>Saving Recipe...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
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
  backText: { fontSize: 16, color: '#FF6B35', fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
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
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  errorText: { color: '#C62828', fontSize: 14 },
  primaryButton: {
    backgroundColor: '#FF6B35',
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
  uploadButton: { backgroundColor: '#FFF', borderWidth: 2, borderColor: '#FF6B35', borderStyle: 'dashed', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 12 },
  uploadButtonText: { color: '#FF6B35', fontSize: 16, fontWeight: '600' },
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
  successText: { color: '#2E7D32', fontSize: 14, fontWeight: '600', textAlign: 'center' },
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
  metaValue: { fontSize: 18, fontWeight: '700', color: '#FF6B35' },
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
  ingredientAmount: { width: 80, fontSize: 14, color: '#FF6B35', fontWeight: '600' },
  ingredientName: { flex: 1, fontSize: 14, color: '#333' },
  stepRow: { flexDirection: 'row', marginBottom: 12 },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF6B35',
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
  tagText: { fontSize: 13, color: '#FF6B35', fontWeight: '500' },

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
    backgroundColor: '#4CAF50',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
