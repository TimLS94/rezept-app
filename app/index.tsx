import { Redirect } from 'expo-router';

// Guests land straight in the app — no registration wall. Login is only
// requested when the user tries to save something (list, plan, upload).
export default function Index() {
  return <Redirect href="/home" />;
}
