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

/**
 * Turn the household answer into actual people.
 *
 * Onboarding asks how many of you there are and how many are children. That
 * is enough to lay out "Who you cook for" straight away, which is the
 * difference between a portions screen that already knows your household and
 * one that greets you with an empty list and a plus button.
 *
 * Portions are 1.0 for an adult and 0.5 for a child, and nothing else is
 * guessed. Age, weight and gender are left blank: they are asked for nowhere
 * in onboarding, and inventing them would put numbers on the screen that look
 * like the user typed them. The estimate button in "Who you cook for" is
 * there for anyone who wants a portion worked out properly.
 *
 * Only ever seeds an empty household. Someone who already listed their family
 * — or who runs onboarding a second time — keeps exactly what they had.
 */
export async function seedHouseholdMembers(total: number, kids: number): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from('family_members')
    .select('id')
    .eq('profile_id', user.id)
    .limit(1);
  if (existing?.length) return;

  // The account holder is always one of the adults, so there is at least one
  // and the children can never add up to the whole household.
  const people = Math.max(1, Math.round(total));
  const children = Math.max(0, Math.min(Math.round(kids), people - 1));
  const adults = people - children;

  const rows: Record<string, unknown>[] = [
    {
      profile_id: user.id,
      name: 'You',
      portion_multiplier: 1,
      dietary_restrictions: [],
      is_self: true,
    },
  ];
  for (let i = 2; i <= adults; i++) {
    rows.push({
      profile_id: user.id, name: `Adult ${i}`,
      portion_multiplier: 1, dietary_restrictions: [], is_self: false,
    });
  }
  for (let i = 1; i <= children; i++) {
    rows.push({
      profile_id: user.id, name: children === 1 ? 'Child' : `Child ${i}`,
      portion_multiplier: 0.5, dietary_restrictions: [], is_self: false,
    });
  }

  const { error } = await supabase.from('family_members').insert(rows);
  if (!error) invalidateFamilyServings();
}

// Call after family members / family_size change so the next read is fresh.
export function invalidateFamilyServings() {
  cache = null;
}
