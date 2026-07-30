import { Slot } from 'expo-router';
import { View } from 'react-native';
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

// Poppins as the default font across every screen (headlines override it).
applyGlobalFont();

// Incoming shared/deep links are handled in `app/+native-intent.ts`
// (redirectSystemPath), which runs before route matching. Doing it here too
// would double-navigate and race Expo Router's own linking.

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Anton_400Regular,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // Cream splash while the brand fonts load (avoids a white flash + FOUT).
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: COLORS.cream }} />;
  }

  return (
    <AuthProvider>
      <FavoritesProvider>
        <MealPlanProvider>
          <Slot />
        </MealPlanProvider>
      </FavoritesProvider>
    </AuthProvider>
  );
}
