import { createClient, type User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// AsyncStorage handles large values (Supabase sessions can exceed SecureStore's 2KB limit)
const AsyncStorageAdapter = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// The signed-in user, or null for guests.
//
// Prefer this over `supabase.auth.getUser()`, which round-trips to /auth/v1/user
// on EVERY call — a full request just to learn who is already signed in. The
// session persisted in AsyncStorage carries the user, so this is a local read
// (it only goes to the network when the access token has actually expired).
// Nothing is lost security-wise: the JWT is validated server-side by RLS on
// every query anyway, so a stale local session can't read anything it shouldn't.
export async function getCurrentUser(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}

// PostgREST rejects an entire write if it names one column the database doesn't
// have (PGRST204, or 42703 from Postgres itself). That is exactly what happens
// when the app ships ahead of a migration that hasn't been run yet — and it
// takes the whole save down, including the fields that were working fine
// before. A new feature going quiet is acceptable; breaking recipe editing is
// not.
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST204'
    || error.code === '42703'
    || /column .* does not exist|Could not find the '.*' column/i.test(error.message ?? '');
}

// Update a row by id, retrying without `optionalKeys` if the database doesn't
// know them yet. `degraded` tells the caller the optional fields were dropped,
// so it can say so instead of silently pretending they saved.
export async function updateByIdTolerant(
  table: string,
  id: string,
  payload: Record<string, any>,
  optionalKeys: string[],
): Promise<{ error: string | null; degraded: boolean }> {
  const { error } = await supabase.from(table).update(payload as never).eq('id', id);
  if (!error) return { error: null, degraded: false };
  if (!isMissingColumnError(error)) return { error: error.message, degraded: false };

  const reduced = { ...payload };
  for (const key of optionalKeys) delete reduced[key];
  const retry = await supabase.from(table).update(reduced as never).eq('id', id);
  return { error: retry.error?.message ?? null, degraded: !retry.error };
}
