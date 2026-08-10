import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, getCurrentUser } from './supabase';
import { FEATURES } from './features';
import { initPurchases, logOutPurchases } from './purchases';

export type Role = 'user' | 'creator' | 'admin';

// Who may upload recipes: creators/admins always; everyone only if the public
// uploads flag is on. Guests (role null) can never upload.
export const canUploadRecipes = (role: Role | null): boolean =>
  role === 'creator' || role === 'admin' || (FEATURES.publicRecipeUploads && role != null);

// Importing a recipe into your OWN cookbook is not publishing — nobody else
// ever sees it. The two were gated by the same check, which meant sharing a
// reel from Instagram landed a normal user on "Creators only". Anyone signed in
// may import; how many times is a Premium question, not a role question.
export const canImportToCookbook = (role: Role | null): boolean => role != null;

type AuthValue = {
  user: User | null;
  role: Role | null; // null while signed out (guest)
  isPremium: boolean;
  isGuest: boolean;
  loading: boolean;
  // Reloads the user + profile and returns the resolved role, so callers can
  // route by role right after login without waiting for a re-render.
  refresh: () => Promise<Role | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (u: User | null): Promise<Role | null> => {
    if (!u) {
      setRole(null);
      setIsPremium(false);
      logOutPurchases();
      return null;
    }
    initPurchases(u.id); // inert until real RevenueCat keys + dev build
    // Both run in parallel: this is the app-start critical path, and chaining
    // them cost a second round trip for every non-premium user (the common case).
    const [{ data }, { data: ent }] = await Promise.all([
      supabase.from('profiles').select('role, is_premium').eq('id', u.id).single(),
      supabase
        .from('entitlements')
        .select('id')
        .eq('user_id', u.id)
        .eq('scope', 'platform')
        .eq('status', 'active')
        .limit(1),
    ]);
    const resolved = (data?.role as Role) ?? 'user';
    setRole(resolved);

    // App-wide premium = legacy is_premium flag OR an active platform entitlement
    // (written by the RevenueCat webhook). Failure is non-fatal (stays false).
    setIsPremium(!!data?.is_premium || (ent?.length ?? 0) > 0);
    return resolved;
  }, []);

  const refresh = useCallback(async (): Promise<Role | null> => {
    const u = await getCurrentUser();
    setUser(u);
    return loadProfile(u);
  }, [loadProfile]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(session?.user ?? null);
      await loadProfile(session?.user ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, role, isPremium, isGuest: !user, loading, refresh, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

// Helper to prompt login for guests
export function useRequireAuth() {
  const auth = useAuth();
  const { Alert } = require('react-native');
  const { router } = require('expo-router');

  const requireAuth = (action: string, callback?: () => void) => {
    if (auth.isGuest) {
      Alert.alert(
        'Sign in required',
        `Sign in to ${action}`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign in', onPress: () => router.push('/login') },
        ]
      );
      return false;
    }
    callback?.();
    return true;
  };

  return { ...auth, requireAuth };
}
