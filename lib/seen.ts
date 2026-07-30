import AsyncStorage from '@react-native-async-storage/async-storage';

// Recipe ids the user has already swiped in Discover (liked or skipped), so they
// don't reappear on later visits. Stored locally on the device.
const KEY = 'discover_seen_v1';

export async function getSeenIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function addSeenId(id: string): Promise<void> {
  try {
    const ids = await getSeenIds();
    if (!ids.includes(id)) await AsyncStorage.setItem(KEY, JSON.stringify([...ids, id]));
  } catch {
    // best-effort; ignore storage errors
  }
}

export async function clearSeenIds(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
