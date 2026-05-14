"use client";

import { useUser } from "@/hooks/use-user";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { triggerSync } from "@/lib/sync";
import { useSyncStatus } from "@/lib/sync-status";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, Cloud, Loader2 } from "lucide-react";

/** Sync indicator + manual trigger shown in the topbar. Only renders when
 * a user is signed in — when signed out the sync engine isn't running so
 * there's nothing useful to report. Clicking re-runs the sync; while a
 * sync is in flight the button is disabled and `triggerSync` no-ops. */
export function SyncStatusPill() {
  const { user } = useUser();
  const status = useSyncStatus();

  if (!user) return null;

  function onClick() {
    if (!user) return;
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    // Errors are surfaced via sync-status; nothing to do with the promise.
    void triggerSync(supabase, user.id);
  }

  const styles =
    "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] tabular-nums transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:hover:bg-transparent";
  const syncing = status.state === "syncing";

  switch (status.state) {
    case "idle":
      return (
        <button
          type="button"
          onClick={onClick}
          className={cn(styles, "text-muted-foreground")}
          title="Sync now"
        >
          <Cloud className="h-3 w-3" />
          Ready
        </button>
      );
    case "syncing":
      return (
        <button
          type="button"
          disabled
          className={cn(styles, "text-muted-foreground")}
          title="Sync in progress"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Syncing…
        </button>
      );
    case "synced":
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={syncing}
          className={cn(styles, "text-muted-foreground")}
          title={`Last synced ${new Date(status.at).toLocaleString()} — click to sync again`}
        >
          <Check className="h-3 w-3" />
          Synced
        </button>
      );
    case "error":
      return (
        <button
          type="button"
          onClick={onClick}
          className={cn(styles, "text-amber-700 dark:text-amber-400")}
          title={`${status.message} — click to retry`}
        >
          <AlertTriangle className="h-3 w-3" />
          Sync error
        </button>
      );
  }
}
