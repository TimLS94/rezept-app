import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { Recipe } from '../data/recipes';
import { weekKey } from './week';

export type PlannedMeal = {
  id: string;
  recipe: Recipe;
  done?: boolean;
};

export type PlansByWeek = Record<string, PlannedMeal[]>;

type MealPlanContextValue = {
  plansByWeek: PlansByWeek;
  // Replace an entire week's plan (used by regenerate / filter changes).
  setWeekPlan: (key: string, plan: PlannedMeal[]) => void;
  // Apply a functional update to a week's plan.
  updateWeekPlan: (key: string, updater: (plan: PlannedMeal[]) => PlannedMeal[]) => void;
  // Append a recipe to a week, skipping duplicates. Returns whether it was added.
  addRecipeToWeek: (key: string, recipe: Recipe) => boolean;
};

const MealPlanContext = createContext<MealPlanContextValue | null>(null);

export function MealPlanProvider({ children }: { children: ReactNode }) {
  const [plansByWeek, setPlansByWeek] = useState<PlansByWeek>({});

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
    <MealPlanContext.Provider value={{ plansByWeek, setWeekPlan, updateWeekPlan, addRecipeToWeek }}>
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
