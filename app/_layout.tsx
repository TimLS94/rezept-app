import { Slot } from 'expo-router';
import { AuthProvider } from '../lib/auth';
import { MealPlanProvider } from '../lib/mealPlan';
import { FavoritesProvider } from '../lib/favorites';

// Incoming shared/deep links are handled in `app/+native-intent.ts`
// (redirectSystemPath), which runs before route matching. Doing it here too
// would double-navigate and race Expo Router's own linking.

export default function RootLayout() {
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
