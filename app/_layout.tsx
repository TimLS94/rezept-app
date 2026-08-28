import { Stack, useRouter } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ShareIntentProvider } from 'expo-share-intent';
import { useState, useEffect } from 'react';
import { useFonts, Anton_400Regular } from '@expo-google-fonts/anton';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { AuthProvider, useAuth } from '../lib/auth';
import { MealPlanProvider } from '../lib/mealPlan';
import { FavoritesProvider } from '../lib/favorites';
import ErrorBoundary from '../components/ErrorBoundary';
import { installGlobalErrorHandlers } from '../lib/errorLog';
import { COLORS } from '../lib/theme';
import { applyGlobalFont } from '../lib/applyGlobalFont';
import SplashDrop from '../components/SplashDrop';

// Poppins as the default font across every screen (headlines override it).
applyGlobalFont();

// Incoming shared/deep links are handled in `app/+native-intent.ts`
// (redirectSystemPath), which runs before route matching. Doing it here too
// would double-navigate and race Expo Router's own linking.
//
// The share sheet ("Share to SpoonDrop" from Instagram etc.) is a separate
// path: the native extension reopens the app, +native-intent routes to
// /shareintent, and that screen reads the payload out of this provider.

// Lives inside AuthProvider so it can hold the intro until the session check is
// done. Without that, the animation ends on whatever the app has managed to
// render — usually the spinner in app/index.tsx, which is exactly the "still
// loading" impression the intro exists to avoid.
function LaunchIntro() {
  const { loading } = useAuth();
  const [done, setDone] = useState(false);
  if (done) return null;
  return <SplashDrop ready={!loading} onDone={() => setDone(true)} />;
}

export default function RootLayout() {
  const router = useRouter();
  // The intro plays over the app rather than before it, so loading happens
  // behind it instead of after — by the time the drop lands, Home is ready.
  const [fontsLoaded] = useFonts({
    Anton_400Regular,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // Ink, not cream, while the fonts load: it matches the intro that follows, so
  // there is no flash between the two.
  // Installed before anything can throw. An exception during startup is the
  // one most likely to be invisible otherwise — the app dies before any
  // screen exists to report from.
  useEffect(() => { installGlobalErrorHandlers(); }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: COLORS.ink }} />;
  }

  return (
    <ErrorBoundary>
    <ShareIntentProvider
      options={{
        resetOnBackground: true,
        // Backgrounding the app drops a half-finished share; land on Home
        // rather than leaving the share screen sitting there with no payload.
        onResetShareIntent: () => router.replace('/'),
      }}
    >
      <SafeAreaProvider>
        <AuthProvider>
          <FavoritesProvider>
            <MealPlanProvider>
              {/* A Stack, not a Slot. Slot renders the current route and
                  nothing else: no push/pop animation, and — the part people
                  actually notice — no iOS edge-swipe back. Every screen drew
                  its own "← Back" button because that button was genuinely the
                  only way out. headerShown stays false so those existing
                  headers keep working; this adds the gesture and the
                  transitions underneath them. */}
              <Stack screenOptions={{ headerShown: false }} />
              <LaunchIntro />
            </MealPlanProvider>
          </FavoritesProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ShareIntentProvider>
    </ErrorBoundary>
  );
}
