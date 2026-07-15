import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const BUCKET = 'images';

// Opens the photo library, uploads the chosen image to Supabase Storage, and
// returns its public URL. Returns null if the user cancels; alerts on error.
// `folder` keeps recipe photos and avatars organised per user.
export async function pickAndUploadImage(
  folder: 'recipes' | 'avatars'
): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', 'Allow photo access to upload an image.');
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

  const { data: { user } } = await supabase.auth.getUser();
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
