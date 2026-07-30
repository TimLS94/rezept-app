import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth, canUploadRecipes } from '../lib/auth';

// Guests land straight in the app — no registration wall. Creators go to their
// Studio (they only create & market); everyone else lands on Home.
export default function Index() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF9F2' }}>
        <ActivityIndicator size="large" color="#F57C00" />
      </View>
    );
  }

  return <Redirect href={canUploadRecipes(role) ? '/creator' : '/home'} />;
}
