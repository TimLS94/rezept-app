import { Slot, useRouter } from 'expo-router';
import { View } from 'react-native';
import { ShareIntentProvider } from 'expo-share-intent';
import { useState } from 'react';
import { useFonts, Anton_400Regular } from '@expo-google-fonts/anton';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { AuthProvider } from '../lib/auth';
import { MealPlanProvider } from '../lib/mealPlan';
import { FavoritesProvider } from '../lib/favorites';
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

export default function RootLayout() {
  const router = useRouter();
  // The intro plays over the app rather than before it, so loading happens
  // behind it instead of after — by the time the drop lands, Home is ready.
  const [introDone, setIntroDone] = useState(false);
  const [fontsLoaded] = useFonts({
    Anton_400Regular,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // Ink, not cream, while the fonts load: it matches the intro that follows, so
  // there is no flash between the two.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: COLORS.ink }} />;
  }

  return (
    <ShareIntentProvider
      options={{
        resetOnBackground: true,
        // Backgrounding the app drops a half-finished share; land on Home
        // rather than leaving the share screen sitting there with no payload.
        onResetShareIntent: () => router.replace('/'),
      }}
    >
      <AuthProvider>
        <FavoritesProvider>
          <MealPlanProvider>
            <Slot />
            {!introDone && <SplashDrop onDone={() => setIntroDone(true)} />}
          </MealPlanProvider>
        </FavoritesProvider>
      </AuthProvider>
    </ShareIntentProvider>
  );
}
