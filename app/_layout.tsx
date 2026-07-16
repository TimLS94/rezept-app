import { Slot } from 'expo-router';
import { AuthProvider } from '../lib/auth';
import { MealPlanProvider } from '../lib/mealPlan';

export default function RootLayout() {
  return (
    <AuthProvider>
      <MealPlanProvider>
        <Slot />
      </MealPlanProvider>
    </AuthProvider>
  );
}
