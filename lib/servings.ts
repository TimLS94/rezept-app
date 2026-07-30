import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-recipe serving overrides, device-local (mirrors cookStats). Lets the user
// scale a favorite up/down; cook mode reads it to scale ingredient amounts.
const KEY = 'servingsById';
let cache: Record<string, number> | null = null;

async function load(): Promise<Record<string, number>> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

export async function getAllServings(): Promise<Record<string, number>> {
  return { ...(await load()) };
}

export async function setServings(id: string, servings: number): Promise<void> {
  const m = await load();
  m[id] = servings;
  cache = m;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(m));
  } catch {}
}

// Scale an ingredient amount from the recipe's base servings to a target count,
// rounded to a tidy value (whole numbers stay whole, else 1 decimal).
export function scaleAmount(amount: number, base: number, target: number): number {
  if (!base || base === target) return amount;
  const scaled = (amount * target) / base;
  return Math.round(scaled * 10) / 10;
}
