import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useAuth, canUploadRecipes } from '../../lib/auth';

// Emoji tab icons match the app's emoji-led visual style. Emoji ignore tint
// color, so the active state is conveyed with opacity instead.
const tabIcon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  const { role } = useAuth();
  const isCreator = canUploadRecipes(role);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FF6B35',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { paddingTop: 4 },
      }}
    >
      {/* Consumer tabs — hidden for creators, who only create & market.
          `href: null` hides the tab and blocks the route. */}
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon('🏠'), href: isCreator ? null : undefined }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: tabIcon('🔥'), href: isCreator ? null : undefined }} />
      <Tabs.Screen name="budget" options={{ title: 'Planner', tabBarIcon: tabIcon('📅'), href: isCreator ? null : undefined }} />
      <Tabs.Screen name="shopping" options={{ title: 'Shopping', tabBarIcon: tabIcon('🛒'), href: isCreator ? null : undefined }} />
      {/* Creator Studio — only for creator/admin accounts. */}
      <Tabs.Screen name="creator" options={{ title: 'Studio', tabBarIcon: tabIcon('🎬'), href: isCreator ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('👤') }} />
    </Tabs>
  );
}
