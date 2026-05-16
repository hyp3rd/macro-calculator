"use client";

import { useEffect, useState } from "react";

/** Tiny pub/sub for "a synced table just received fresh data from
 *  another device (or our own pull)". Components / hooks that read
 *  IDB-backed data subscribe here so they re-fetch the moment a
 *  Realtime event arrives, rather than waiting for the next manual
 *  refresh or sign-out / sign-in cycle.
 *
 *  Mirrors [lib/profile-bus.ts](../profile-bus.ts) in shape — a small,
 *  process-local Set<callback> per table. Kept separate from
 *  sync-status so a notification fires regardless of sync state and
 *  doesn't reset the status pill. */

export type SyncedTable =
  | "profile"
  | "dailyLogs"
  | "weightHistory"
  | "customFoods"
  | "mealTemplates"
  | "recipes";

const subscribers: Record<SyncedTable, Set<() => void>> = {
  profile: new Set(),
  dailyLogs: new Set(),
  weightHistory: new Set(),
  customFoods: new Set(),
  mealTemplates: new Set(),
  recipes: new Set(),
};

/** Fire all subscribers registered for `table`. Errors in one
 *  subscriber don't block the rest — a buggy listener can't take
 *  down the bus. */
export function notifyDataChanged(table: SyncedTable): void {
  for (const cb of subscribers[table]) {
    try {
      cb();
    } catch {
      // Swallow — bus is best-effort. A listener throwing means a
      // bug in that listener, not in the bus.
    }
  }
}

/** Subscribe a callback to changes on `table`. Returns an unsubscribe
 *  function the caller invokes on cleanup (typically in a React
 *  `useEffect` return). */
export function subscribeDataChanged(
  table: SyncedTable,
  cb: () => void,
): () => void {
  subscribers[table].add(cb);
  return () => {
    subscribers[table].delete(cb);
  };
}

/** React hook: returns a number that increments every time
 *  `notifyDataChanged(table)` fires. Including this in an effect's
 *  dep array makes the effect re-run on every realtime arrival,
 *  triggering the IDB re-read your component already does on mount.
 *
 *  Same pattern as the manual `customFoodsRev` / `templateRev`
 *  counters in [macro-calculator.tsx] — this just hooks it to the
 *  realtime bus so components don't have to thread the counter
 *  through props. */
export function useDataRev(table: SyncedTable): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    return subscribeDataChanged(table, () => {
      setRev((r) => r + 1);
    });
  }, [table]);
  return rev;
}
