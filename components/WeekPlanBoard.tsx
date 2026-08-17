// The week as seven days, with meals you can pick up and move.
//
// The plan used to be one flat list of up to seven cards. It said nothing
// about *when* you were cooking any of it, so "move Thursday's dinner to
// Saturday" was not a thing you could express.
//
// Drag is built on PanResponder and Animated from React Native core, not
// react-native-draggable-flatlist. That library needs gesture-handler and
// reanimated — two native modules, which would mean every change to this app
// requires a new native build instead of an over-the-air update. The whole
// backlog reached testers as an OTA precisely because nothing native changed.
import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Animated,
  LayoutChangeEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { PlannedMeal } from '../lib/mealPlan';
import { COLORS } from '../lib/theme';

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const LONG_PRESS_MS = 300;

/**
 * Which day a meal sits on.
 *
 * Plans saved before days existed have no `day`, so they are spread across the
 * week by position rather than all landing on Monday — an old plan should look
 * like a week, not like a pile.
 */
export function dayOf(meal: PlannedMeal, index: number): number {
  return meal.day ?? index % 7;
}

type Props = {
  weekStart: Date;
  meals: PlannedMeal[];
  onChange: (next: PlannedMeal[]) => void;
  onOpen: (meal: PlannedMeal) => void;
  onCook: (meal: PlannedMeal) => void;
  onSwap: (meal: PlannedMeal) => void;
  onRemove: (meal: PlannedMeal) => void;
  onToggleDone: (meal: PlannedMeal) => void;
  onAddToDay: (day: number) => void;
  /** Locks the surrounding ScrollView while a card is being dragged. */
  onDragStateChange: (dragging: boolean) => void;
};

export default function WeekPlanBoard({
  weekStart, meals, onChange, onOpen, onCook, onSwap, onRemove, onToggleDone,
  onAddToDay, onDragStateChange,
}: Props) {
  // Where each day section sits on screen, captured when a drag starts. The
  // list cannot scroll during a drag, so the numbers stay valid for its whole
  // duration.
  const bands = useRef<{ day: number; top: number; bottom: number }[]>([]);
  const sectionRefs = useRef<Record<number, View | null>>({});

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverDay, setHoverDay] = useState<number | null>(null);

  const byDay = (day: number) =>
    meals.map((m, i) => ({ meal: m, day: dayOf(m, i) })).filter(x => x.day === day);

  const measureBands = () => {
    const next: { day: number; top: number; bottom: number }[] = [];
    let pending = 7;
    return new Promise<void>(resolve => {
      for (let d = 0; d < 7; d++) {
        const node = sectionRefs.current[d];
        if (!node) { pending--; if (!pending) { bands.current = next; resolve(); } continue; }
        node.measureInWindow((_x, y, _w, h) => {
          next.push({ day: d, top: y, bottom: y + h });
          pending--;
          if (!pending) { bands.current = next.sort((a, b) => a.top - b.top); resolve(); }
        });
      }
    });
  };

  const dayAt = (pageY: number): number | null => {
    const band = bands.current.find(b => pageY >= b.top && pageY <= b.bottom);
    return band ? band.day : null;
  };

  const moveMealToDay = (mealId: string, day: number) => {
    // Reassign, then reorder so the array follows the visible order. Storing
    // the day alone would leave the list order stale, and the shopping list
    // reads the array.
    const next = meals.map((m, i) => (m.id === mealId ? { ...m, day } : { ...m, day: dayOf(m, i) }));
    next.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
    onChange(next);
  };

  return (
    <View>
      {WEEKDAY_NAMES.map((name, day) => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + day);
        const entries = byDay(day);
        const isToday = new Date().toDateString() === date.toDateString();
        const isTarget = hoverDay === day;

        return (
          <View
            key={day}
            ref={n => { sectionRefs.current[day] = n; }}
            collapsable={false}
            style={[styles.section, isTarget && styles.sectionTarget]}
          >
            <View style={styles.dayHeader}>
              <Text style={[styles.dayName, isToday && styles.dayNameToday]}>{name}</Text>
              <Text style={styles.dayDate}>
                {date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                {isToday ? ' · today' : ''}
              </Text>
            </View>

            {entries.length === 0 ? (
              <TouchableOpacity style={styles.emptyDay} onPress={() => onAddToDay(day)}>
                <Ionicons name="add" size={16} color={COLORS.warmGray} />
                <Text style={styles.emptyDayText}>Add a meal</Text>
              </TouchableOpacity>
            ) : (
              entries.map(({ meal }) => (
                <DraggableMeal
                  key={meal.id}
                  meal={meal}
                  dragging={draggingId === meal.id}
                  onOpen={() => onOpen(meal)}
                  onCook={() => onCook(meal)}
                  onSwap={() => onSwap(meal)}
                  onRemove={() => onRemove(meal)}
                  onToggleDone={() => onToggleDone(meal)}
                  onDragStart={async () => {
                    await measureBands();
                    setDraggingId(meal.id);
                    onDragStateChange(true);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  }}
                  onDragMove={pageY => setHoverDay(dayAt(pageY))}
                  onDragEnd={pageY => {
                    const target = dayAt(pageY);
                    setDraggingId(null);
                    setHoverDay(null);
                    onDragStateChange(false);
                    if (target != null) moveMealToDay(meal.id, target);
                  }}
                />
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

function DraggableMeal({
  meal, dragging, onOpen, onCook, onSwap, onRemove, onToggleDone,
  onDragStart, onDragMove, onDragEnd,
}: {
  meal: PlannedMeal;
  dragging: boolean;
  onOpen: () => void;
  onCook: () => void;
  onSwap: () => void;
  onRemove: () => void;
  onToggleDone: () => void;
  onDragStart: () => void;
  onDragMove: (pageY: number) => void;
  onDragEnd: (pageY: number) => void;
}) {
  const lift = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  // Set by a plain touch handler rather than by the responder, so the
  // surrounding ScrollView keeps the responder — and keeps scrolling — until
  // the finger has actually been held still.
  const armed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    armed.current = false;
  };

  const responder = useRef(
    PanResponder.create({
      // Only once the long press has armed this card. Before that every move
      // belongs to the scroll view.
      onMoveShouldSetPanResponder: () => armed.current,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: () => {
        onDragStart();
        Animated.spring(lift, { toValue: 1, useNativeDriver: true, friction: 7 }).start();
      },
      onPanResponderMove: (e, g) => {
        translateY.setValue(g.dy);
        onDragMove(e.nativeEvent.pageY);
      },
      onPanResponderRelease: (e) => {
        onDragEnd(e.nativeEvent.pageY);
        disarm();
        translateY.setValue(0);
        Animated.spring(lift, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
      },
      onPanResponderTerminate: () => {
        disarm();
        translateY.setValue(0);
        lift.setValue(0);
      },
    })
  ).current;

  return (
    <Animated.View
      {...responder.panHandlers}
      onTouchStart={() => {
        timer.current = setTimeout(() => { armed.current = true; }, LONG_PRESS_MS);
      }}
      onTouchEnd={disarm}
      onTouchCancel={disarm}
      style={[
        styles.card,
        meal.done && styles.cardDone,
        {
          transform: [
            { translateY },
            { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) },
          ],
          shadowOpacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.28] }),
          zIndex: dragging ? 20 : 1,
        },
      ]}
    >
      <TouchableOpacity style={styles.cardMain} activeOpacity={0.85} onPress={onOpen}>
        <Image source={{ uri: meal.recipe.image }} style={styles.thumb} />
        <View style={styles.cardText}>
          <Text style={[styles.title, meal.done && styles.titleDone]} numberOfLines={2}>
            {meal.recipe.title}
          </Text>
          <Text style={styles.meta}>
            {meal.recipe.prepTime + meal.recipe.cookTime} min · {meal.recipe.ingredients.length} ingredients
          </Text>
        </View>
        <Ionicons name="reorder-three" size={20} color="#C9C2B8" />
      </TouchableOpacity>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.check, meal.done && styles.checkOn]}
          onPress={onToggleDone}
        >
          {meal.done && <Text style={styles.checkMark}>✓</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cook} onPress={onCook} activeOpacity={0.85}>
          <Ionicons name="restaurant" size={15} color="#FFF" />
          <Text style={styles.cookText}>Cook</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.icon} onPress={onSwap}>
          <Ionicons name="refresh" size={16} color={COLORS.navy} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.icon} onPress={onRemove}>
          <Ionicons name="close" size={16} color={COLORS.warmGray} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 16,
    marginBottom: 14,
    paddingBottom: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sectionTarget: { borderColor: COLORS.orange, backgroundColor: '#FFF3E9' },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 8,
  },
  dayName: { fontSize: 15, fontWeight: '700', color: COLORS.navy },
  dayNameToday: { color: COLORS.orange },
  dayDate: { fontSize: 12, color: '#9A9A9A' },

  emptyDay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#E4DACA',
  },
  emptyDayText: { fontSize: 13, color: COLORS.warmGray, fontWeight: '600' },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 10,
    elevation: 3,
  },
  cardDone: { opacity: 0.6 },
  cardMain: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  cardText: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  titleDone: { textDecorationLine: 'line-through', color: '#9A9A9A' },
  meta: { fontSize: 11, color: '#999', marginTop: 3 },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  check: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: '#DCD4C8',
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  checkMark: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  cook: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, height: 30, borderRadius: 15,
    backgroundColor: COLORS.orange,
  },
  cookText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  icon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#F4F1EC',
    alignItems: 'center', justifyContent: 'center',
  },
});
