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
