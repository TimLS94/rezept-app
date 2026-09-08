// Someone's picture, or their initial.
//
// The fallback used to be a stock photograph from Unsplash — a particular
// smiling stranger, shown as the avatar of every account that had not uploaded
// one. It read as a real person, which is exactly the problem: a profile with
// no picture claimed a face that belongs to somebody else entirely.
//
// An initial on a tinted circle says the same thing honestly: nobody has
// uploaded a picture here yet. It also loads instantly and works offline,
// which a remote photograph standing in for "no photograph" never did.
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

export default function Avatar({
  uri,
  name,
  size = 40,
}: {
  uri?: string | null;
  /** Used for the initial when there is no picture. */
  name?: string | null;
  size?: number;
}) {
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#EFE7DC' }}
      />
    );
  }

  // The first letter of whatever we know them by. Falls through to a neutral
  // mark rather than a random letter when we know nothing at all.
  const letter = (name ?? '').trim().charAt(0).toUpperCase();

  return (
    <View
      style={[
        s.fallback,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      <Text style={[s.letter, { fontSize: Math.round(size * 0.42) }]}>
        {letter || '·'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2E3D3',
  },
  letter: { color: '#B84B08', fontWeight: '700' },
});
