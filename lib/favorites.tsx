import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Recipe } from '../data/recipes';
import { useAuth } from './auth';
import { supabase } from './supabase';

type FavoritesContextValue = {
  favorites: Recipe[];
  // False until the user's favorites have loaded (or resolved empty for guests).
  loaded: boolean;
  isFavorite: (id: string) => boolean;
  // Add a recipe; returns false if it was already a favorite.
  addFavorite: (recipe: Recipe) => boolean;
  removeFavorite: (id: string) => void;
  toggleFavorite: (recipe: Recipe) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Recipe[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load the signed-in user's favorites; clear them on sign-out (guests are
  // session-only, in memory).
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) {
        setFavorites([]);
        setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from('favorite_recipes')
        .select('recipe')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (data) setFavorites(data.map(r => r.recipe as Recipe));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const isFavorite = useCallback(
    (id: string) => favorites.some(r => r.id === id),
    [favorites]
  );

  const addFavorite = useCallback(
    (recipe: Recipe) => {
      if (favorites.some(r => r.id === recipe.id)) return false;
      setFavorites(prev => (prev.some(r => r.id === recipe.id) ? prev : [recipe, ...prev]));
      if (user) {
        supabase
          .from('favorite_recipes')
          .upsert(
            { user_id: user.id, recipe_id: recipe.id, recipe },
            { onConflict: 'user_id,recipe_id', ignoreDuplicates: true }
          )
          .then(() => {});
      }
      return true;
    },
    [favorites, user]
  );

  const removeFavorite = useCallback(
    (id: string) => {
      setFavorites(prev => prev.filter(r => r.id !== id));
      if (user) {
        supabase
          .from('favorite_recipes')
          .delete()
          .eq('user_id', user.id)
          .eq('recipe_id', id)
          .then(() => {});
      }
    },
    [user]
  );

  const toggleFavorite = useCallback(
    (recipe: Recipe) => {
      if (favorites.some(r => r.id === recipe.id)) removeFavorite(recipe.id);
      else addFavorite(recipe);
    },
    [favorites, addFavorite, removeFavorite]
  );

  return (
    <FavoritesContext.Provider
      value={{ favorites, loaded, isFavorite, addFavorite, removeFavorite, toggleFavorite }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within a FavoritesProvider');
  return ctx;
}
