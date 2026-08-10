import { supabase, getCurrentUser, updateByIdTolerant } from './supabase';

// The public-facing creator identity, edited in the Creator Studio and used as
// the `influencer_*` fields on every recipe the creator publishes.
export type CreatorProfile = {
  fullName: string;      // display name
  username: string;      // @handle (stored without the leading @)
  avatarUrl: string;
  bio: string;
  instagramUrl: string;
  tiktokUrl: string;
  website: string;
  // Pricing (Phase 2). Null = not offered. Values must be one of the tiers in
  // lib/pricing.ts — the DB rejects anything else via a check constraint.
  subscriptionEnabled: boolean;
  subscriptionPriceCents: number | null;
  defaultRecipePriceCents: number | null;
};

export const emptyCreatorProfile: CreatorProfile = {
  fullName: '',
  username: '',
  avatarUrl: '',
  bio: '',
  instagramUrl: '',
  tiktokUrl: '',
  website: '',
  subscriptionEnabled: false,
  subscriptionPriceCents: null,
  defaultRecipePriceCents: null,
};

// Strip a leading @ so handles are stored consistently.
export const normalizeHandle = (h: string) => h.trim().replace(/^@+/, '');

export async function getCreatorProfile(): Promise<CreatorProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('full_name, username, avatar_url, bio, instagram_url, tiktok_url, website, subscription_enabled, subscription_price_cents, default_recipe_price_cents')
    .eq('id', user.id)
    .maybeSingle();

  return {
    fullName: data?.full_name ?? '',
    username: data?.username ?? '',
    avatarUrl: data?.avatar_url ?? '',
    bio: data?.bio ?? '',
    instagramUrl: data?.instagram_url ?? '',
    tiktokUrl: data?.tiktok_url ?? '',
    website: data?.website ?? '',
    subscriptionEnabled: data?.subscription_enabled ?? false,
    subscriptionPriceCents: data?.subscription_price_cents ?? null,
    defaultRecipePriceCents: data?.default_recipe_price_cents ?? null,
  };
}

// `degraded` = saved, but the pricing fields were dropped because
// creator_pricing.sql hasn't been run against this database yet.
type SaveResult = { ok: true; degraded?: boolean } | { error: string };

export async function updateCreatorProfile(p: CreatorProfile): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!user) return { error: 'not-authenticated' };

  const { error, degraded } = await updateByIdTolerant('profiles', user.id, {
      full_name: p.fullName.trim() || null,
      username: normalizeHandle(p.username) || null,
      avatar_url: p.avatarUrl || null,
      bio: p.bio.trim() || null,
      instagram_url: p.instagramUrl.trim() || null,
      tiktok_url: p.tiktokUrl.trim() || null,
      website: p.website.trim() || null,
      subscription_enabled: p.subscriptionEnabled,
      // A subscription with no price would be an unbuyable button.
      subscription_price_cents: p.subscriptionEnabled ? p.subscriptionPriceCents : null,
      default_recipe_price_cents: p.defaultRecipePriceCents,
    },
    ['default_recipe_price_cents'],
  );

  if (error) return { error };
  return { ok: true, degraded };
}
