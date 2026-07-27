import { supabase } from './supabase';

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
};

export const emptyCreatorProfile: CreatorProfile = {
  fullName: '',
  username: '',
  avatarUrl: '',
  bio: '',
  instagramUrl: '',
  tiktokUrl: '',
  website: '',
};

// Strip a leading @ so handles are stored consistently.
export const normalizeHandle = (h: string) => h.trim().replace(/^@+/, '');

export async function getCreatorProfile(): Promise<CreatorProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('full_name, username, avatar_url, bio, instagram_url, tiktok_url, website')
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
  };
}

type SaveResult = { ok: true } | { error: string };

export async function updateCreatorProfile(p: CreatorProfile): Promise<SaveResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'not-authenticated' };

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: p.fullName.trim() || null,
      username: normalizeHandle(p.username) || null,
      avatar_url: p.avatarUrl || null,
      bio: p.bio.trim() || null,
      instagram_url: p.instagramUrl.trim() || null,
      tiktok_url: p.tiktokUrl.trim() || null,
      website: p.website.trim() || null,
    })
    .eq('id', user.id);

  if (error) return { error: error.message };
  return { ok: true };
}
