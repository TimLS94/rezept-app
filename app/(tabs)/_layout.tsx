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
        // A creator sees seven tabs, everyone else six. At 10pt with seven,
        // "Cookbook" and "Shopping" rendered as "Cookb…" and "Shoppi…", and a
        // truncated word carries less than a shorter one. Nine point, and the
        // two long labels shortened below — the icons carry the meaning.
        tabBarLabelStyle: { fontFamily: FONTS.semibold, fontSize: 9 },
      }}
    >
      {/* Everyone gets these, creators included. They were hidden behind
          `href: null` for creator accounts on the idea that a creator "only
          creates & markets" — but they cook, keep a cookbook, plan a week, and
          could not even open their own recipe the way a reader sees it.
          Studio is the only tab that depends on the role. */}
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon('home-outline', 'home') }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: tabIcon('flame-outline', 'flame') }} />
      {/* Labelled "Book" and "List" rather than truncated. The full words live
          in each screen's own header, where there is room for them. */}
      <Tabs.Screen name="cookbook" options={{ title: 'Book', tabBarIcon: tabIcon('book-outline', 'book') }} />
      <Tabs.Screen name="budget" options={{ title: 'Planner', tabBarIcon: tabIcon('calendar-outline', 'calendar') }} />
      <Tabs.Screen name="shopping" options={{ title: 'List', tabBarIcon: tabIcon('cart-outline', 'cart') }} />
      {/* Creator Studio — only for creator/admin accounts. */}
      <Tabs.Screen name="creator" options={{ title: 'Studio', tabBarIcon: tabIcon('videocam-outline', 'videocam'), href: isCreator ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline', 'person') }} />
    </Tabs>
  );
}
