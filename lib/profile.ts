// Reading your own profile.
//
// The profiles table only grants the columns a stranger may see — a creator
// row is public, and Postgres RLS cannot make some of its columns private
// (see supabase/harden_profile_reads.sql). Everything else, including your own
// role, budget and household size, comes through my_profile(), which returns
// the caller's row and nobody else's.
import { supabase } from './supabase';

export type MyProfile = {
  id: string;
  role?: string | null;
  is_premium?: boolean | null;
  premium_until?: string | null;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  weekly_budget?: number | null;
  family_size?: number | null;
  is_creator?: boolean | null;
  stripe_connect_id?: string | null;
  payouts_enabled?: boolean | null;
  subscription_enabled?: boolean | null;
  subscription_price_cents?: number | null;
  default_recipe_price_cents?: number | null;
};

/**
 * The signed-in user's own profile row, or null when signed out.
 *
 * Returns null rather than throwing on failure: every caller has a sensible
 * default (role 'user', family size 2), and an exception on the app-start path
 * would be a blank screen instead of a working, unpersonalised one.
 */
export async function fetchMyProfile(): Promise<MyProfile | null> {
  const { data, error } = await supabase.rpc('my_profile');
  if (error || !data) return null;
  return data as MyProfile;
}
