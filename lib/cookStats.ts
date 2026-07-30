import AsyncStorage from '@react-native-async-storage/async-storage';

// How many recipes the user has cooked (finished all steps in Cook Mode).
// Stored locally on the device — drives the awards/milestones.
const COUNT_KEY = 'cook_count_v1';

export async function getCookedCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(COUNT_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function incrementCooked(): Promise<number> {
  const next = (await getCookedCount()) + 1;
  try {
    await AsyncStorage.setItem(COUNT_KEY, String(next));
  } catch {
    // best-effort
  }
  return next;
}

export type Award = { threshold: number; icon: string; title: string };

export const AWARDS: Award[] = [
  { threshold: 1, icon: '🥉', title: 'First cook' },
  { threshold: 5, icon: '🍳', title: 'Getting started' },
  { threshold: 10, icon: '🥈', title: 'Home chef' },
  { threshold: 25, icon: '🥇', title: 'Kitchen pro' },
  { threshold: 50, icon: '👨‍🍳', title: 'Master chef' },
];

// Highest award earned at this count (null before the first cook).
export function awardFor(count: number): Award | null {
  let earned: Award | null = null;
  for (const a of AWARDS) if (count >= a.threshold) earned = a;
  return earned;
}

// The next milestone to aim for (null once all are earned).
export function nextAward(count: number): Award | null {
  return AWARDS.find(a => count < a.threshold) ?? null;
}
