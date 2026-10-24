// When the failure is ours, it should not look like the user's mistake.
//
// The red error box is right for "that link is not an Instagram post" — the
// person can fix that. It is wrong for an outage at a service they have never
// heard of and cannot do anything about, where alarm-red reads as "you broke
// something" and sends people off to check a post that is fine.
//
// So: a calmer surface, the fact stated plainly, and the route that still
// works given the same weight as the problem.
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../lib/theme';

export default function ServiceNotice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.icon}>🛠️</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.body}>{body}</Text>
      {action ? <Text style={styles.action}>{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF4E6',
    borderWidth: 1,
    borderColor: '#F6D9B8',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  icon: { fontSize: 17, marginRight: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: '#8A4B08' },
  body: { fontSize: 14, lineHeight: 20, color: '#6B4A28' },
  action: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.orange,
    fontWeight: '600',
    marginTop: 10,
  },
});
