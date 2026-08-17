import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Recipe } from '../data/recipes';
import { weekKey } from './week';
import { useAuth } from './auth';
import { supabase } from './supabase';

export type PlannedMeal = {
  id: string;
  recipe: Recipe;
  done?: boolean;
  /** 0 = Monday … 6 = Sunday. Absent on plans saved before days existed; the
   *  board derives one from the position so an old plan still reads as a
   *  week rather than a single overloaded Monday. */
  day?: number;
};

export type PlansByWeek = Record<string, PlannedMeal[]>;

type MealPlanContextValue = {
  plansByWeek: PlansByWeek;
  // False until the signed-in user's saved plan has been loaded (or resolved as
  // empty for guests). Screens gate auto-seeding on this so a starter plan can't
  // clobber a persisted one before it arrives.
  loaded: boolean;
  // Replace an entire week's plan (used by regenerate / filter changes).
  setWeekPlan: (key: string, plan: PlannedMeal[]) => void;
  // Apply a functional update to a week's plan.
  updateWeekPlan: (key: string, updater: (plan: PlannedMeal[]) => PlannedMeal[]) => void;
  // Append a recipe to a week, skipping duplicates. Returns whether it was added.
  addRecipeToWeek: (key: string, recipe: Recipe) => boolean;
};

const MealPlanContext = createContext<MealPlanContextValue | null>(null);

export function MealPlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [plansByWeek, setPlansByWeek] = useState<PlansByWeek>({});
  const [loaded, setLoaded] = useState(false);

  // Per-week JSON snapshot of what's already in the database, so the sync effect
  // only writes weeks that actually changed (and skips freshly-loaded ones).
  const persistedRef = useRef<Record<string, string>>({});
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the signed-in user's plan; clear it on sign-out (guests are session-
  // only, in memory). week_start matches the 'YYYY-MM-DD' key the app computes.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) {
        persistedRef.current = {};
        setPlansByWeek({});
        setLoaded(true);
        return;
      }
      setLoaded(false);
      const { data } = await supabase
        .from('meal_plan_items')
        .select('id, week_start, recipe, done, sort')
        .eq('user_id', user.id)
        .order('sort', { ascending: true });
      if (!active) return;
      const grouped: PlansByWeek = {};
      (data ?? []).forEach(row => {
        const key = row.week_start as string;
        (grouped[key] ??= []).push({
          id: row.id as string,
          recipe: row.recipe as Recipe,
          done: row.done as boolean,
        });
      });
      persistedRef.current = Object.fromEntries(
        Object.entries(grouped).map(([key, plan]) => [key, JSON.stringify(plan)])
      );
      setPlansByWeek(grouped);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  // Persist changed weeks (debounced). Each changed week is replaced wholesale —
  // delete its rows, then re-insert the current plan with a stable sort order.
  // Debouncing coalesces rapid edits (e.g. "add all to this week") into one write
  // per week and keeps overlapping delete/insert cycles from racing.
  useEffect(() => {
    if (!loaded || !user) return;
    const uid = user.id;
    if (flushRef.current) clearTimeout(flushRef.current);
    flushRef.current = setTimeout(() => {
      Object.entries(plansByWeek).forEach(([key, plan]) => {
        const snapshot = JSON.stringify(plan);
        if (persistedRef.current[key] === snapshot) return;
        persistedRef.current[key] = snapshot;
        (async () => {
          await supabase.from('meal_plan_items').delete().eq('user_id', uid).eq('week_start', key);
          if (plan.length) {
            await supabase.from('meal_plan_items').insert(
              plan.map((m, i) => ({
                user_id: uid,
                week_start: key,
                recipe: m.recipe,
                done: m.done ?? false,
                sort: i,
              }))
            );
          }
        })();
      });
    }, 600);
    return () => {
      if (flushRef.current) clearTimeout(flushRef.current);
    };
  }, [plansByWeek, loaded, user]);

  const setWeekPlan = useCallback((key: string, plan: PlannedMeal[]) => {
    setPlansByWeek(prev => ({ ...prev, [key]: plan }));
  }, []);

  const updateWeekPlan = useCallback(
    (key: string, updater: (plan: PlannedMeal[]) => PlannedMeal[]) => {
      setPlansByWeek(prev => ({ ...prev, [key]: updater(prev[key] ?? []) }));
    },
    []
  );

  const addRecipeToWeek = useCallback((key: string, recipe: Recipe) => {
    let added = false;
    setPlansByWeek(prev => {
      const plan = prev[key] ?? [];
      if (plan.some(m => m.recipe.id === recipe.id)) return prev; // already planned
      added = true;
      return { ...prev, [key]: [...plan, { id: `m${Date.now()}-${recipe.id}`, recipe }] };
    });
    return added;
  }, []);

  return (
    <MealPlanContext.Provider
      value={{ plansByWeek, loaded, setWeekPlan, updateWeekPlan, addRecipeToWeek }}
    >
      {children}
    </MealPlanContext.Provider>
  );
}

export function useMealPlan(): MealPlanContextValue {
  const ctx = useContext(MealPlanContext);
  if (!ctx) throw new Error('useMealPlan must be used within a MealPlanProvider');
  return ctx;
}

// Convenience: the key for the current calendar week.
export const thisWeekKey = () => weekKey(new Date());
