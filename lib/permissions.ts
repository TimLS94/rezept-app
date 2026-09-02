// Asking for a permission, and what to do when the answer is no.
//
// The alerts around the image picker used to end at "Allow photo access to
// pick a photo." — a sentence that names the fix and then withholds it. iOS
// only shows its own prompt once; after that `canAskAgain` is false and
// tapping the button again does nothing at all, forever, with no explanation
// on screen. The person is told what they need and given no way to get it.
//
// So the alert carries the way out. expo-linking's openSettings() opens this
// app's page in Settings, where the toggle actually lives.
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';

/** The shape both ImagePicker permission calls return. */
type PermissionLike = { granted: boolean; canAskAgain: boolean };

/**
 * Explain a refused permission and offer the Settings shortcut.
 *
 * `reason` says what the permission is for, in the user's terms — "to
 * photograph your fridge", not "for MEDIA_LIBRARY". It is shown as the middle
 * of a sentence, so it reads as one thought rather than a label and a string.
 */
export function explainDeniedPermission(perm: PermissionLike, reason: string): void {
  // Settings is offered either way. When iOS will still ask, the trip is
  // avoidable but harmless; when it will not, it is the only thing that works
  // — and the two cases are indistinguishable from the person's side, since
  // both look like a button that did nothing.
  const body = perm.canAskAgain
    ? `SpoonDrop needs permission ${reason}.`
    : `SpoonDrop needs permission ${reason}. iOS won't ask again once it has been ` +
      `turned off, so it has to be switched back on in Settings.`;

  Alert.alert('Permission needed', body, [
    { text: 'Not now', style: 'cancel' },
    {
      text: 'Open Settings',
      onPress: () => {
        // Nothing useful to do if this fails, and nothing to say either: the
        // alert has already been dismissed by the time it would throw.
        Linking.openSettings().catch(() => {});
      },
    },
  ]);
}
