// Handing someone their data, as a file they can keep.
//
// The privacy policy has listed this as a right since it was written. Doing
// it by hand is lawful, but a promise with nothing behind it tends to be
// discovered by the person it was made to.
//
// No new dependency: expo-file-system and expo-sharing are already in
// package.json, so this ships over the air rather than needing a build.
//
// SDK 54's file system is the File/Directory API, not the old
// writeAsStringAsync — the legacy one still exists under
// expo-file-system/legacy, and reaching for it here would mean writing new
// code against something already on its way out.
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';

/**
 * Write the signed-in user's data to a file and open the share sheet.
 *
 * The file is named with the date because people ask for this more than once
 * — usually to compare what changed.
 */
export async function exportMyData(): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) {
    return {
      error: /export_my_data/.test(error.message)
        ? 'Data export is not switched on yet. Please write to privacy@spoondrop.app.'
        : error.message,
    };
  }
  if (data?.error === 'not_signed_in') return { error: 'Please sign in first.' };

  try {
    const day = new Date().toISOString().slice(0, 10);
    const file = new File(Paths.cache, `spoondrop-data-${day}.json`);
    // Overwrites a file from an earlier export on the same day rather than
    // failing, which is the behaviour someone pressing the button twice
    // expects.
    file.create({ overwrite: true });
    file.write(JSON.stringify(data, null, 2));

    if (!(await Sharing.isAvailableAsync())) {
      // Nothing to hand the file to. Saying so beats a button that silently
      // does nothing.
      return { error: 'This device has no way to share files.' };
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Your SpoonDrop data',
      UTI: 'public.json',
    });
    return {};
  } catch (e: any) {
    return { error: String(e?.message ?? 'Could not write the file.') };
  }
}
