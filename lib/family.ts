import { supabase, getCurrentUser } from './supabase';
import { fetchMyProfile } from './profile';

// How many servings the household needs, for the one-tap "Family" button.
// Prefers the sum of family members' portion multipliers (e.g. 2 adults @1.0 +
// 2 kids @0.5 = 3), falling back to profiles.family_size, then 2.
let cache: number | null = null;

export async function getFamilyServings(force = false): Promise<number> {
  if (cache != null && !force) return cache;
  const user = await getCurrentUser();
  if (!user) return 2;

  const { data: members } = await supabase
    .from('family_members')
    .select('portion_multiplier')
    .eq('profile_id', user.id);

  if (members && members.length > 0) {
    const sum = members.reduce((a, m) => a + (Number(m.portion_multiplier) || 1), 0);
    cache = Math.max(1, Math.round(sum));
    return cache;
  }

  const profile = await fetchMyProfile();
  cache = Math.max(1, profile?.family_size ?? 2);
  return cache;
}

// Call after family members / family_size change so the next read is fresh.
export function invalidateFamilyServings() {
  cache = null;
}
