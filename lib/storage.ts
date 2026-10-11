import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { explainDeniedPermission } from './permissions';
import { decode } from 'base64-arraybuffer';
import { supabase, getCurrentUser } from './supabase';

const BUCKET = 'images';

// Opens the photo library, uploads the chosen image to Supabase Storage, and
// returns its public URL. Returns null if the user cancels; alerts on error.
// `folder` keeps recipe photos and avatars organised per user.
export async function pickAndUploadImage(
  folder: 'recipes' | 'avatars'
): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    explainDeniedPermission(perm, 'to choose a photo to upload');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 0.7,
    base64: true,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset.base64) {
    Alert.alert('Upload failed', 'Could not read the selected image.');
    return null;
  }

  const user = await getCurrentUser();
  if (!user) {
    Alert.alert('Please log in', 'You need to be logged in to upload images.');
    return null;
  }

  const path = `${folder}/${user.id}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(asset.base64), { contentType: 'image/jpeg', upsert: true });
  if (error) {
    Alert.alert('Upload failed', error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Upload an already-picked base64 image (e.g. an import screenshot) to Storage
// and return its public URL. Imported recipes must use a hosted URL — never a
// device-local file:// path, which only works briefly on the source device.
export async function uploadBase64Image(
  base64: string,
  folder: 'recipes' | 'avatars'
): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const path = `${folder}/${user.id}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(base64), { contentType: 'image/jpeg', upsert: true });
  if (error) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Copy a remote image into our own storage and return the new URL.
 *
 * Instagram's thumbnails are signed and short-lived. Storing the link it hands
 * back meant every imported recipe looked right for a few hours and then lost
 * its picture for good — the CDN answers 403 once the signature expires, and
 * by then the recipe is in people's cookbooks with a hole where the photo was.
 *
 * So the picture is taken at import, while the link still works. Returns null
 * on any failure; the caller keeps whatever it had rather than losing the
 * recipe over a photograph.
 */
export async function uploadImageFromUrl(
  url: string,
  folder: 'recipes' | 'avatars'
): Promise<string | null> {
  if (!url || url.startsWith('data:')) return null;
  // Already ours — copying it again would just make a second copy of the same
  // bytes on every edit.
  if (url.includes('/storage/v1/object/')) return url;

  try {
    // Fifteen seconds. The import is already a long wait and the picture is
    // the least important part of it; a slow CDN must not hold up a recipe
    // that has otherwise finished extracting.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, { signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
    if (!res.ok) return null;

    const blob = await res.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read-failed'));
      // readAsDataURL gives "data:image/jpeg;base64,…"; the upload wants only
      // the payload.
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.readAsDataURL(blob);
    });
    if (!base64) return null;

    return await uploadBase64Image(base64, folder);
  } catch {
    return null;
  }
}
