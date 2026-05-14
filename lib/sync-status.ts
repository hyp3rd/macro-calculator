"use client";

import { useSyncExternalStore } from "react";

export type SyncStatus =
  | { state: "idle" }
  | { state: "syncing" }
  | { state: "synced"; at: number }
  | { state: "error"; message: string };

const INITIAL: SyncStatus = { state: "idle" };
const SERVER_SNAPSHOT: SyncStatus = INITIAL;

let state: SyncStatus = INITIAL;
const subscribers = new Set<() => void>();

function setState(next: SyncStatus) {
  state = next;
  for (const s of subscribers) s();
}

export function setSyncing(): void {
  setState({ state: "syncing" });
}

export function setSynced(): void {
  setState({ state: "synced", at: Date.now() });
}

export function setSyncError(err: unknown): void {
  const message = err instanceof Error ? err.message : "Sync failed";
  setState({ state: "error", message });
}

export function getSyncStatus(): SyncStatus {
  return state;
}

export function __resetSyncStatusForTests(): void {
  state = INITIAL;
  for (const s of subscribers) s();
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => {
        subscribers.delete(notify);
      };
    },
    () => state,
    () => SERVER_SNAPSHOT,
  );
}
