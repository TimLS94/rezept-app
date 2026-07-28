import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth, canUploadRecipes } from '../lib/auth';

// Guests land straight in the app — no registration wall. Creators go to their
// Studio (they only create & market); everyone else lands on Home.
export default function Index() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAFA' }}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return <Redirect href={canUploadRecipes(role) ? '/creator' : '/home'} />;
}
