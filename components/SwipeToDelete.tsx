import { useRef } from 'react';
import {
  Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View, ViewStyle,
} from 'react-native';

type Props = {
  children: React.ReactNode;
  onDelete: () => void;
  /** Shown on the revealed red panel. Keep it short — the panel is 88pt wide. */
  label?: string;
  style?: ViewStyle;
};

const ACTION_WIDTH = 88;
// How far you have to pull before it snaps open. Below this it springs back, so
// a slightly crooked vertical scroll never leaves a delete button hanging out.
const OPEN_THRESHOLD = 40;

/**
 * Swipe a row left to reveal a delete button. Deliberately built on
 * PanResponder from React Native core rather than react-native-gesture-handler:
 * that would pull in gesture-handler *and* reanimated plus a root provider, two
 * native modules and a rebuild, for one gesture. This needs none of that and
 * behaves the same in Expo Go.
 *
 * Revealing and deleting are separate taps on purpose. A swipe that deletes
 * immediately is the kind of gesture people trigger by accident while scrolling,
 * and a shopping list has no undo.
 */
export default function SwipeToDelete({ children, onDelete, label = 'Delete', style }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);

  const settle = (open: boolean) => {
    openRef.current = open;
    Animated.spring(translateX, {
      toValue: open ? -ACTION_WIDTH : 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  };

  const responder = useRef(
    PanResponder.create({
      // CAPTURE, not the bubbling variant: the row content is a TouchableOpacity,
      // which makes itself the responder as soon as a finger lands. Once a child
      // holds the responder the parent never sees the move, so the bubbling
      // handler simply never fired — the swipe did nothing at all. Capturing
      // intercepts first.
      //
      // Taps are unaffected: a tap has dx ≈ 0, so this stays false and the
      // touch reaches the row underneath.
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,

      // While a row is open, a tap on it should put it away — not tick the item
      // off. Capturing here keeps that touch from reaching the row underneath.
      // The delete button is unaffected: it lives outside this view.
      onStartShouldSetPanResponderCapture: () => openRef.current,

      onPanResponderGrant: () => {
        if (openRef.current) settle(false);
      },

      // The enclosing ScrollView asks for the responder back as soon as the
      // finger keeps moving. Granting that — which is the default — cancelled
      // the swipe mid-gesture and sprang the row shut every time. Once this
      // gesture has started it is ours until the finger lifts.
      onPanResponderTerminationRequest: () => false,
      // Android equivalent: stop the native scroll view from taking over.
      onShouldBlockNativeResponder: () => true,

      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -ACTION_WIDTH : 0;
        const next = Math.min(0, Math.max(-ACTION_WIDTH - 20, base + g.dx));
        translateX.setValue(next);
      },

      onPanResponderRelease: (_, g) => {
        const base = openRef.current ? -ACTION_WIDTH : 0;
        const travelled = base + g.dx;
        // A fast flick counts even if it didn't travel far.
        if (g.vx < -0.5) return settle(true);
        if (g.vx > 0.5) return settle(false);
        settle(travelled < -OPEN_THRESHOLD);
      },

      onPanResponderTerminate: () => settle(openRef.current),
    })
  ).current;

  return (
    <View style={[styles.wrap, style]}>
      {/* Tied to the swipe position, so at rest it is genuinely invisible
          rather than merely hidden behind the row. It sat permanently under the
          content before, which meant anything that made the row see-through
          revealed it — and TouchableOpacity fades to ~0.2 on every press, so
          the red flashed through each time an item was ticked off. */}
      <Animated.View
        style={[
          styles.actionLayer,
          {
            opacity: translateX.interpolate({
              inputRange: [-ACTION_WIDTH, -2, 0],
              outputRange: [1, 1, 0],
              extrapolate: 'clamp',
            }),
          },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.action}
          onPress={() => {
            settle(false);
            onDelete();
          }}
        >
          <Text style={styles.actionText}>{label}</Text>
        </TouchableOpacity>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Clips the row so the panel can't be seen peeking out when it's closed.
  // The caller passes the spacing (see `style`) so the wrapper hugs its content
  // exactly — any margin left on the child would open a gap through which the
  // red panel shows, which is what made it look like a stray red box.
  wrap: { overflow: 'hidden' },
  actionLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'flex-end', justifyContent: 'center' },
  action: {
    width: ACTION_WIDTH,
    height: '100%',
    backgroundColor: '#C0392B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: '#FFF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
