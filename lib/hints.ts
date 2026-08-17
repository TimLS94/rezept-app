// One-off nudges that teach a gesture, then never appear again.
//
// A hint that replays on every visit stops being a hint and becomes a tic, so
// each one is remembered by key. Local storage is the right home: it is per
// device, which is what "has this person seen it here" means, and losing it on
// reinstall just means the hint plays once more.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'hint:';

export async function hintSeen(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREFIX + key)) === '1';
  } catch {
    // Unreadable storage should not mean an endlessly repeating animation.
    return true;
  }
}

export async function markHintSeen(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, '1');
  } catch {
    // Not worth surfacing: the cost of failure is one extra hint.
  }
}

export const HINT_SWIPE_TO_DELETE = 'swipe-to-delete';
