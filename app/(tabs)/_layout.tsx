import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, canUploadRecipes } from '../../lib/auth';
import { COLORS, FONTS } from '../../lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Monoline vector icons that take the active/inactive tint colour. Filled when
// focused, outline otherwise — a cleaner, more modern tab bar than emoji.
const tabIcon = (outline: IoniconName, filled: IoniconName) =>
  function TabIcon({ color, focused, size }: { color: string; focused: boolean; size: number }) {
    return <Ionicons name={focused ? filled : outline} size={size ?? 24} color={color} />;
  };

export default function TabsLayout() {
  const { role } = useAuth();
  const isCreator = canUploadRecipes(role);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.orange,
        tabBarInactiveTintColor: COLORS.warmGray,
        tabBarStyle: { backgroundColor: COLORS.card, borderTopColor: COLORS.border, paddingTop: 6 },
        tabBarLabelStyle: { fontFamily: FONTS.semibold, fontSize: 11 },
      }}
    >
      {/* Consumer tabs — hidden for creators, who only create & market.
          `href: null` hides the tab and blocks the route. */}
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline', 'home'), href: isCreator ? null : undefined }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: tabIcon('flame-outline', 'flame'), href: isCreator ? null : undefined }} />
      <Tabs.Screen name="budget" options={{ title: 'Planner', tabBarIcon: tabIcon('calendar-outline', 'calendar'), href: isCreator ? null : undefined }} />
      <Tabs.Screen name="shopping" options={{ title: 'Shopping', tabBarIcon: tabIcon('cart-outline', 'cart'), href: isCreator ? null : undefined }} />
      {/* Creator Studio — only for creator/admin accounts. */}
      <Tabs.Screen name="creator" options={{ title: 'Studio', tabBarIcon: tabIcon('videocam-outline', 'videocam'), href: isCreator ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline', 'person') }} />
    </Tabs>
  );
}
