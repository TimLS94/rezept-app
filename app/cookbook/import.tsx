import { useState, useEffect, useRef } from 'react';
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
import { explainDeniedPermission } from '../../lib/permissions';
import { useAuth, canImportToCookbook } from '../../lib/auth';
import {
  extractRecipeWithAI, extractRecipeFromImages, extractRecipeFromVideo, ExtractedRecipe,
} from '../../lib/openai';
import { saveMyRecipe } from '../../lib/myRecipes';
import {
  fetchInstagramWithFallback, isValidInstagramUrl, buildExtractionContent,
} from '../../lib/instagram';
import {
  getImportQuota, recordImport, quotaText, ImportQuota, ImportKind,
} from '../../lib/importQuota';
import { Ionicons } from '@expo/vector-icons';
import Paywall from '../../components/Paywall';
import { DietaryTag, Ingredient } from '../../data/recipes';
import RecipeEditor, { EditableRecipe } from '../../components/RecipeEditor';
import { HEADER_TOP } from '../../lib/layout';
import { goBackOr } from '../../lib/nav';
import CookingProgress, { estimateSeconds } from '../../components/CookingProgress';

type Step = 'input' | 'extracting' | 'review' | 'saving';
// Import modes: an Instagram link, a screenshot from the gallery, a camera
// photo, or pasted text.
type InputMode = 'link' | 'screenshot' | 'camera' | 'text';

// A recipe's text can span several on-screen frames (ingredients + each step).
// Vision de-dupes across images, so allow a comfortable number.
//
// Six, not ten, and at half quality rather than 0.8 — because these are held
// in JavaScript memory as base64 strings, all of them at once, and then
// copied again into the request body. A full-resolution iPhone photo is
// several megabytes before base64 adds a third; ten of those is tens of
// megabytes of string on a device that will kill the app rather than page it
// out. That is the shape of a crash "for no reason".
//
// Nothing is lost by it. The model is reading text off a screenshot, and a
// screenshot at 0.5 quality is still perfectly legible — the fridge scan has
// worked at this setting all along.
const MAX_SCREENSHOTS = 6;
const IMAGE_QUALITY = 0.5;

// Where an imported recipe goes, and why it is not a creator recipe.
//
// Everything imported here lands in `my_recipes`: your own cookbook, private
// to you, with the link kept as its source. That is not a technical detail,
// it is the only defensible answer. The person whose post you imported is not
// a SpoonDrop creator — they have no account here, no say in it and no share
// of anything it earns — so publishing their recipe into the creator
// catalogue would be republishing someone else's work, and letting a user
// sell it would be worse. Creator recipes are what a creator publishes about
// their own cooking, which is a different act entirely and still lives behind
// canUploadRecipes.
//
// The visible attribution follows from the same reasoning: the source link
// travels with the recipe, and sharing it sends your copy, never a claim of
// authorship.

const MIN_TEXT_HEIGHT = 180;
const MAX_TEXT_HEIGHT = 360;

export default function ImportRecipeScreen() {
  const { isGuest, role, isPremium, refresh } = useAuth();
  // One per bucket. Instagram is scarcer than the rest, so showing a single
  // number would misstate whichever mode the user is not looking at.
  // Watching a reel takes noticeably longer than reading a caption, so the
  // waiting screen says which one is happening — and, because it can run to
  // minutes, how long it has been going and how to stop it.
  const [watching, setWatching] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // The reel's own length, so the wait can be estimated from something real.
  const [videoSeconds, setVideoSeconds] = useState<number | undefined>();
  const cancelRef = useRef<AbortController | null>(null);
  // Every import run gets a number. Cancelling bumps it, so an answer that
  // arrives afterwards belongs to a run nobody is waiting for and is dropped
  // — without this, a cancelled request could still navigate the user into a
  // review screen they had already walked away from.
  const runRef = useRef(0);
  const [quotas, setQuotas] = useState<Record<'instagram' | 'other', ImportQuota | null>>({
    instagram: null,
    other: null,
  });
  const [showPaywall, setShowPaywall] = useState(false);
  const params = useLocalSearchParams<{ sharedUrl?: string; sharedText?: string }>();
  
  const [step, setStep] = useState<Step>('input');

  // Counts from the moment extraction starts, so a long wait is a number the
  // user can judge rather than an indefinite spinner.
  useEffect(() => {
    if (step !== 'extracting') { setElapsed(0); return; }
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [step]);
  const [inputMode, setInputMode] = useState<InputMode>('screenshot'); // Default to screenshot
  const [url, setUrl] = useState('');
  const [manualText, setManualText] = useState('');
  // The field grows with its content, but only so far. Unbounded growth turned
  // a long recipe into a page you had to scroll twenty times to get past; a
  // fixed 200pt box made it scroll inside a window while the page scrolled too.
  // Growing to a comfortable maximum and scrolling internally beyond that means
  // a normal recipe never scrolls twice and a very long one still fits on
  // screen.
  const [textHeight, setTextHeight] = useState(MIN_TEXT_HEIGHT);
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

  // Only Premium sees a number, because only Premium can spend one.
  useEffect(() => {
    if (!isPremium) return;
    Promise.all([getImportQuota('instagram'), getImportQuota('screenshot')])
      .then(([instagram, other]) => setQuotas({ instagram, other }))
      .catch(() => {});
  }, [isPremium]);

  /** The allowance the current mode spends from. */
  const bucketOf = (mode: InputMode): 'instagram' | 'other' =>
    mode === 'link' ? 'instagram' : 'other';
  const activeQuota = quotas[bucketOf(inputMode)];

  useEffect(() => {
    if (params.sharedUrl) {
      // A link shared into the app now lands ready to import, rather than on
      // an apology telling the user to go and take a screenshot instead.
      setUrl(params.sharedUrl);
      setInputMode('link');
    } else if (params.sharedText) {
      setManualText(params.sharedText);
      setInputMode('text');
    }
  }, [params.sharedUrl, params.sharedText]);

  // Pick screenshots from gallery
  const pickScreenshots = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: IMAGE_QUALITY,
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
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    const { status } = perm;
    if (status !== 'granted') {
      explainDeniedPermission(perm, 'to take a photo of the recipe');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: IMAGE_QUALITY,
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

  /**
   * Books the import against this week's allowance.
   *
   * Called once the AI has answered, not before: the allowance exists to cap
   * what we spend, and a call that failed cost us nothing worth charging the
   * user for. The pre-check below is what stops a call we already know will
   * be refused.
   */
  const book = async (kind: ImportKind) => {
    const after = await recordImport(kind);
    setQuotas(prev => ({ ...prev, [kind === 'instagram' ? 'instagram' : 'other']: after }));
  };

  /** True when this mode's allowance is spent. Says which, and stops. */
  const outOfImports = (): boolean => {
    const q = activeQuota;
    if (!q || q.remaining > 0) return false;
    Alert.alert(
      q.kind === 'instagram' ? 'No Instagram imports left' : 'No imports left',
      q.kind === 'instagram'
        ? `${quotaText(q)} A screenshot of the post still works — that comes out of a different allowance.`
        : quotaText(q),
    );
    return true;
  };

  const handleImport = async () => {
    try {
      await runImport();
    } catch (e: any) {
      // Nothing in here had a catch, so one unexpected throw — a model
      // answering with prose instead of JSON was enough — left the screen on
      // 'extracting' with no timeout, no message and no way back. Whatever
      // else goes wrong, the user gets the screen back and a sentence.
      console.warn('Import failed:', e);
      setError(
        'Something went wrong while reading that recipe. A screenshot works — pick Gallery or Camera above.',
      );
      setStep('input');
      setWatching(false);
    }
  };

  const runImport = async () => {
    setError('');
    if (outOfImports()) return;

    // Instagram link mode
    if (inputMode === 'link') {
      const link = url.trim();
      if (!link) {
        Alert.alert('Missing link', 'Paste an Instagram post or reel link.');
        return;
      }
      if (!isValidInstagramUrl(link)) {
        Alert.alert('Not an Instagram link', 'Use a link to a post, reel or IGTV video.');
        return;
      }

      setStep('extracting');
      const run = ++runRef.current;

      // A ceiling over the whole operation, not just each call inside it.
      // Per-call deadlines add up — fetch the post, watch the reel, fall back
      // to the caption — and three limits in a row is still a wait long
      // enough to abandon. This is the one the user actually experiences.
      cancelRef.current = new AbortController();
      const overall = setTimeout(() => cancelRef.current?.abort(), 240_000);

      const ig = await fetchInstagramWithFallback(link);
      clearTimeout(overall);
      if (runRef.current !== run) return;
      if (!ig.success) {
        setError(ig.error);
        setStep('input');
        return;
      }
      if (ig.content.thumbnailUrl) setThumbnailUrl(ig.content.thumbnailUrl);

      // Everything at once, not one source until something sticks.
      //
      // A reel spreads its recipe across three places: the caption, the text
      // on screen, and what the person says. Taking them in turn and stopping
      // at the first that "worked" is how you get half a recipe — a caption
      // listing ingredients passes the not-empty check, and the steps spoken
      // thirty seconds in never get looked at. So when there is a video, the
      // video and the caption go up together in one call and the model reads
      // all three.
      //
      // The caption-only path is what is left when there is no video to
      // watch, and the fallback for when the video is too long to send.
      const caption = ig.content.caption?.trim() ?? '';
      const videoUrl = ig.content.videoUrl;

      let aiResult: Awaited<ReturnType<typeof extractRecipeWithAI>>;

      if (videoUrl) {
        setVideoSeconds(ig.content.durationSeconds);
        setWatching(true);
        aiResult = await extractRecipeFromVideo(
          videoUrl, caption || undefined, cancelRef.current.signal,
        );
        setWatching(false);
        if (runRef.current !== run) return;

        // Stopped on purpose. Nothing to report and nothing to fall back to —
        // an error box after someone pressed Cancel reads as a failure they
        // caused.
        if (!aiResult.success && aiResult.error === 'cancelled') {
          setStep('input');
          return;
        }

        // A reel we could not fetch or that was too long still has its
        // caption, and a caption is better than an apology.
        if (!aiResult.success && caption) {
          aiResult = await extractRecipeWithAI(buildExtractionContent(ig.content));
        }
      } else {
        aiResult = caption
          ? await extractRecipeWithAI(buildExtractionContent(ig.content))
          : { success: false as const, error: '' };
      }

      if (!aiResult.success) {
        setError(
          !caption && !videoUrl
            ? 'Nothing came back from that post — no caption, and no video to watch. A screenshot of the recipe works.'
            : aiResult.error,
        );
        setStep('input');
        return;
      }

      await book('instagram');
      showReview(aiResult.recipe);
      return;
    }

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

      await book(inputMode as ImportKind);
      // The base64 has done its job. Holding several megabytes of string
      // through the review step, the save and whatever comes next is how a
      // later screen gets blamed for a crash this one caused.
      setScreenshots([]);
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

    await book('text');
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
      cost: recipe.cost ?? 0,
      nutrition: recipe.nutrition,
      difficulty: recipe.difficulty,
      dietary: recipe.dietary.filter(d => 
        ['healthy', 'high-protein', 'gluten-free', 'vegetarian', 'vegan', 'dairy-free'].includes(d)
      ) as DietaryTag[],
      ingredients: recipe.ingredients as Ingredient[],
      steps: recipe.steps,
      stepTimers: recipe.stepTimers,
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

  // Premium only, the same as the fridge scan and for the same reason: every
  // import is an AI call billed per use. Note this gates the IMPORT, not the
  // role — publishing as a creator is a separate thing and still lives behind
  // canUploadRecipes.
  if (!isPremium) {
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
          <Text style={styles.guestTitle}>Importing is a Premium feature</Text>
          <Text style={styles.guestText}>
            Paste an Instagram link, a screenshot, a photo or plain text and it comes
            back as a recipe you can cook from — ingredients, steps and all.
            {'\n\n'}Three Instagram imports a week, plus ten from screenshots, photos
            or text. They go into your own cookbook, with the link kept as the source.
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

            {activeQuota && (
              <View style={styles.quotaBar}>
                <Ionicons
                  name={activeQuota.remaining > 0 ? 'sparkles-outline' : 'time-outline'}
                  size={14}
                  color="#8A4B1E"
                />
                <Text style={styles.quotaText}>{quotaText(activeQuota)}</Text>
              </View>
            )}

            {/* Mode Toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeButton, inputMode === 'link' && styles.modeButtonActive]}
                onPress={() => setInputMode('link')}
              >
                <Text style={[styles.modeButtonText, inputMode === 'link' && styles.modeButtonTextActive]}>
                  🔗 Link
                </Text>
              </TouchableOpacity>
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

            {inputMode === 'link' && (
              <View style={styles.field}>
                <View style={styles.fieldHeader}>
                  <Text style={styles.label}>Instagram link</Text>
                  <View style={styles.fieldTools}>
                    {url.length === 0 ? (
                      <TouchableOpacity
                        onPress={async () => {
                          const t = await Clipboard.getStringAsync();
                          if (t?.trim()) setUrl(t.trim());
                        }}
                      >
                        <Text style={styles.fieldAction}>Paste</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => setUrl('')}>
                        <Text style={styles.fieldAction}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <TextInput
                  style={styles.input}
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://www.instagram.com/reel/…"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="done"
                />
                <Text style={styles.helpText}>
                  Reads the post's caption. If the recipe is only spoken in the video and
                  never written down, use a screenshot instead — and you can share a post
                  straight from Instagram into SpoonDrop.
                </Text>
              </View>
            )}

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
                  style={[
                    styles.input,
                    styles.textArea,
                    { height: Math.min(MAX_TEXT_HEIGHT, Math.max(MIN_TEXT_HEIGHT, textHeight)) },
                  ]}
                  onContentSizeChange={e => {
                    // Store the measurement as-is. Adding a constant fed the
                    // result back in: the measured size already includes the
                    // padding, so every pass added another 24pt and the field
                    // oscillated. The threshold stops sub-pixel reflows from
                    // re-rendering on every keystroke.
                    const h = e.nativeEvent.contentSize.height;
                    setTextHeight(prev => (Math.abs(prev - h) > 4 ? h : prev));
                  }}
                  onFocus={() => setTextFocused(true)}
                  onBlur={() => setTextFocused(false)}
                  scrollEnabled={textHeight > MAX_TEXT_HEIGHT}
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
            <Text style={styles.loadingTitle}>
              {watching ? 'Watching the video…' : 'Extracting Recipe...'}
            </Text>
            <Text style={styles.loadingText}>
              {watching
                ? 'Reading the caption, the text on screen and what is said in the reel — all together. A long reel can take a couple of minutes.'
                : 'AI is analyzing the post. This may take a few seconds.'}
            </Text>

            {/* Watching a reel is the only wait long enough to need pacing.
                A bar for a two-second caption read would be theatre. */}
            {watching ? (
              <>
                <CookingProgress seconds={estimateSeconds(videoSeconds)} />
                <Text style={styles.elapsed}>
                  {elapsed < 60
                    ? `${elapsed}s so far`
                    : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')} so far`}
                </Text>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => {
                    // Leave immediately. Asking the request to stop is worth
                    // doing, but a button that waits for the network to agree
                    // before it does anything is a button that does nothing.
                    runRef.current += 1;
                    cancelRef.current?.abort();
                    setWatching(false);
                    setStep('input');
                  }}
                >
                  <Text style={styles.cancelText}>Stop and use a screenshot instead</Text>
                </TouchableOpacity>
              </>
            ) : null}
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
  helpText: { fontSize: 12.5, color: '#8A8378', lineHeight: 18, marginTop: 8 },
  elapsed: { fontSize: 13, color: '#8A8378', fontWeight: '700', marginTop: 14 },
  cancelBtn: { marginTop: 18, paddingVertical: 12, paddingHorizontal: 18 },
  cancelText: { fontSize: 14, color: '#F2701E', fontWeight: '600' },
  quotaBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFF3E9', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14,
  },
  quotaText: { fontSize: 12.5, color: '#8A4B1E', fontWeight: '600' },
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
    paddingHorizontal: 2,
    alignItems: 'center',
    borderRadius: 10,
  },
  modeButtonActive: {
    backgroundColor: '#FFF',
  },
  // Four across on a narrow phone: the labels have to be small enough that
  // "Gallery" does not wrap into its neighbour.
  modeButtonText: {
    fontSize: 12.5,
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
