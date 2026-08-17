// Screen metrics that have to be right on the device, not on the simulator the
// number was guessed on.
//
// Every screen used to hardcode `paddingTop: 60` for its header. That is the
// status bar plus a bit, measured once on one iPhone: too much room on devices
// with no notch, too little under a Dynamic Island, and wrong on Android where
// the status bar height varies by manufacturer.
//
// `initialWindowMetrics` is filled in natively before the first render, so it
// can be read at module scope — which is what makes it usable inside
// StyleSheet.create, where hooks are not.
import { initialWindowMetrics } from 'react-native-safe-area-context';

const topInset = initialWindowMetrics?.insets.top ?? 20;
const bottomInset = initialWindowMetrics?.insets.bottom ?? 0;

/** Top padding for a screen header: clear of the status bar, plus breathing room. */
export const HEADER_TOP = topInset + 12;

/** Bottom padding for content that must clear the home indicator. */
export const SAFE_BOTTOM = bottomInset;
