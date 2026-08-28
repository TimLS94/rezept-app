// The difference between a crash and a bad moment.
//
// Without one of these, a single exception thrown while rendering takes the
// whole tree down: in a release build the app disappears, with no message and
// nothing recorded. One recipe with an unexpected shape could do it.
//
// It sits at the root, so it catches everything, and it offers the one action
// that actually helps — reload — rather than leaving someone with a screen
// that cannot be escaped.
import { Component, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import * as Updates from 'expo-updates';
import { reportError } from '../lib/errorLog';

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // The component stack is the useful half: it names the screen, which a
    // JavaScript stack trace on a minified bundle often does not.
    reportError('render', error, { componentStack: info.componentStack?.slice(0, 2000) });
  }

  reload = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // Not reloadable (Expo Go, dev). Clearing the error re-renders the tree,
      // which is often enough for a transient failure.
      this.setState({ error: null });
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.wrap}>
        <Text style={styles.icon}>🍳</Text>
        <Text style={styles.title}>That went wrong</Text>
        <Text style={styles.text}>
          Something broke while drawing this screen. It has been reported — nothing you
          did caused it, and nothing you saved is lost.
        </Text>
        <TouchableOpacity style={styles.button} onPress={this.reload}>
          <Text style={styles.buttonText}>Reload SpoonDrop</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FFF9F2', alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon: { fontSize: 52, marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '700', color: '#0D2B63', marginBottom: 10 },
  text: { fontSize: 14.5, color: '#6b6459', textAlign: 'center', lineHeight: 21, marginBottom: 26 },
  button: { backgroundColor: '#F2701E', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 15 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
