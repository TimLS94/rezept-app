import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Enable swipe-to-go-back from anywhere on the screen, not just the edge.
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    />
  );
}
