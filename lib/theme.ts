// SpoonDrop — brand tokens. Single source of truth for colours + type.
export const COLORS = {
  // ── SpoonDrop brand ──────────────────────────────────────────────────────
  // Taken from the logo: near-black ground, the orange of the drop, and the
  // warm off-white of the spoon.
  ink: '#141414',        // logo background
  inkSoft: '#1F1F1F',    // raised surface on ink
  orange: '#F2701E',     // the drop
  orangeDark: '#D65F14',
  bone: '#F5F0E6',       // the spoon

  // ── Surfaces currently in use ────────────────────────────────────────────
  // The app still runs on the light scheme. The brand is dark, so these are the
  // pair to swap when the dark theme lands — but that is not a token change:
  // roughly 500 colour literals are written directly into the screens
  // (171x the orange alone), so flipping these alone would produce a half-dark
  // mess rather than a dark app. See the note at the bottom of this file.
  cream: '#FFF9F2',
  card: '#FFFFFF',
  charcoal: '#232323',
  warmGray: '#6F6F6F',
  border: '#EFE7DC',

  // Kept: navy is still referenced across the screens as the text/heading
  // colour. It is no longer a brand colour and goes away with the dark theme.
  navy: '#0D2B63',
  navyDeep: '#081F49',

  green: '#3C8D40',
  overlay: 'rgba(20,20,20,0.55)',
};

// Straplines from the brand sheet, for the paywall, the store listing and the
// marketing site — so the wording stays identical wherever it appears.
export const TAGLINE = 'Good food. Real people. Worth the drop.';
export const TAGLINE_SHORT = 'Find food worth dropping your spoon for.';

// Fonts (loaded in the root layout). `display` is the bold condensed headline
// look (Anton); Poppins carries the body copy.
export const FONTS = {
  display: 'Anton_400Regular',
  body: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
};

export const RADIUS = { sm: 10, md: 14, lg: 20, xl: 28 };
