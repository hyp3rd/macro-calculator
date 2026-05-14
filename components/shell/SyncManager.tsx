"use client";

import { useUser } from "@/hooks/use-user";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { triggerSync } from "@/lib/sync";
import { useEffect, useRef } from "react";

/** Headless component that fires the initial-sync routine once whenever
 * a user signs in. Subsequent renders that report the same user id are a
 * no-op so navigating around the app doesn't kick off repeated syncs.
 * Sign-out resets the trigger so signing back in syncs again. */
export function SyncManager() {
  const { user, isLoaded } = useUser();
  const lastSyncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      lastSyncedFor.current = null;
      return;
    }
    if (lastSyncedFor.current === user.id) return;

    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    lastSyncedFor.current = user.id;
    triggerSync(supabase, user.id).catch(() => {
      // Clear the cache so a later retry actually runs. The error has
      // already been surfaced via sync-status by triggerSync().
      lastSyncedFor.current = null;
    });
  }, [user, isLoaded]);

  return null;
}
