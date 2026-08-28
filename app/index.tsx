import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuth, canUploadRecipes } from '../lib/auth';
import { loadPreferences } from '../lib/preferences';

// Guests land straight in the app — no registration wall. Creators go to their
// Studio (they only create & market); everyone else lands on Home.
export default function Index() {
  const { role, loading, isGuest } = useAuth();

  // Onboarding runs once, for signed-in people who have not seen it. Guests
  // are left alone: asking someone to describe their household before they
  // have an account is asking them to fill in a form for nobody.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    // Guests are left alone, and so are creators — see lib/nav.ts. Marking it
    // done rather than skipping the redirect keeps one meaning for the flag:
    // "nothing left to ask".
    if (loading || isGuest || canUploadRecipes(role)) { setOnboarded(true); return; }
    loadPreferences()
      .then(r => setOnboarded(r.onboarded))
      // A failed lookup must not trap anyone in onboarding, so assume it is
      // done and let them into the app.
      .catch(() => setOnboarded(true));
  }, [loading, isGuest, role]);

  if (loading || onboarded === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF9F2' }}>
        <ActivityIndicator size="large" color="#F2701E" />
      </View>
    );
  }

  if (!onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href={canUploadRecipes(role) ? '/creator' : '/home'} />;
}
