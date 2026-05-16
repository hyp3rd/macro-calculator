"use client";

import { useUser } from "@/hooks/use-user";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { triggerSync } from "@/lib/sync";
import {
  startRealtimeSubscription,
  type RealtimeHandle,
} from "@/lib/sync/realtime";
import { useEffect, useRef } from "react";

/** Headless component that owns two cross-device sync lifecycles:
 *
 *  1. **Initial sync on sign-in** — fires `triggerSync` exactly once
 *     per `(user_id)` transition. Subsequent renders for the same user
 *     are no-ops so navigation doesn't re-trigger.
 *
 *  2. **Realtime subscription** — after the initial sync succeeds,
 *     subscribes to Supabase Realtime on every synced table so
 *     server-side changes (typically from a peer device) flow into
 *     IDB and bump the data bus, which the hooks listen on. On
 *     reconnect after a network blip, we run a one-shot `triggerSync`
 *     to catch up on events missed during the gap.
 *
 *  Sign-out tears both down so the next sign-in starts fresh. */
export function SyncManager() {
  const { user, isLoaded } = useUser();
  const lastSyncedFor = useRef<string | null>(null);
  const realtimeRef = useRef<RealtimeHandle | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      lastSyncedFor.current = null;
      // Tear down the previous subscription on sign-out / account swap.
      realtimeRef.current?.unsubscribe();
      realtimeRef.current = null;
      return;
    }
    if (lastSyncedFor.current === user.id) return;

    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    lastSyncedFor.current = user.id;
    triggerSync(supabase, user.id)
      .then(() => {
        // Tear down any stale handle (e.g. lingering from a previous
        // user before the lastSyncedFor reset) then start fresh.
        realtimeRef.current?.unsubscribe();
        realtimeRef.current = startRealtimeSubscription(supabase, user.id, {
          onReconnect: () => {
            // Network came back — pull anything we missed. Errors are
            // surfaced via sync-status; we don't need to handle here.
            void triggerSync(supabase, user.id).catch(() => {});
          },
        });
      })
      .catch(() => {
        // Clear the cache so a later retry actually runs. The error
        // has already been surfaced via sync-status by triggerSync().
        lastSyncedFor.current = null;
      });
  }, [user, isLoaded]);

  return null;
}
