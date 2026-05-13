"use client";

import type { Meal } from "@/components/macro/types";
import { getDailyLog, saveDailyLog } from "@/lib/db";
import { reportStorageError, reportStorageOk } from "@/lib/storage-status";
import { useEffect, useState } from "react";

const WRITE_DEBOUNCE_MS = 500;

export type DailyLogState = {
  date: string;
  meals: Meal[];
  setMeals: (next: Meal[]) => void;
  isHydrated: boolean;
};

/** Persists the meal log for a specific date in IndexedDB. The caller
 * chooses the date — typically today via `useToday`, but the date
 * navigator pins a historical day when the user navigates. When the
 * date changes, the hook reloads the new day's log (or seeds empty
 * meals) and skips writes until the load resolves, so we never write
 * yesterday's meals to today's key during the transition. */
export function useDailyLog(date: string, defaultMeals: Meal[]): DailyLogState {
  const [meals, setMealsState] = useState<Meal[]>(defaultMeals);
  // `loadedFor` is the date the current `meals` state corresponds to.
  // Hydration is derived from it being equal to `date` — this lets us
  // avoid the `react-hooks/set-state-in-effect` rule, which would fire if
  // we synchronously reset isHydrated to false at the top of the effect.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const isHydrated = loadedFor === date && date !== "";

  useEffect(() => {
    if (date === "") return; // SSR snapshot; skip until hydrate.
    let cancelled = false;
    getDailyLog(date)
      .then((log) => {
        if (cancelled) return;
        setMealsState(log?.meals ?? defaultMeals);
        setLoadedFor(date);
      })
      .catch((err) => {
        if (cancelled) return;
        reportStorageError(err);
        setMealsState(defaultMeals);
        setLoadedFor(date);
      });
    return () => {
      cancelled = true;
    };
  }, [date, defaultMeals]);

  useEffect(() => {
    if (!isHydrated) return;
    const t = window.setTimeout(() => {
      saveDailyLog(date, meals).then(reportStorageOk).catch(reportStorageError);
    }, WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [meals, date, isHydrated]);

  return { date, meals, setMeals: setMealsState, isHydrated };
}
