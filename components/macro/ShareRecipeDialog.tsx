"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { upsertRecipe } from "@/lib/db";
import { bumpPending } from "@/lib/sync-status";
import { useState } from "react";
import { Check, Copy, Loader2, Trash2 } from "lucide-react";
import type { Recipe } from "./types";

/** Share dialog for one recipe. Three states:
 *  - **Not shared yet** → "Create shareable link" button mints a slug
 *    via `POST /api/recipes/[id]/share`. On success, the dialog
 *    flips into the "shared" state and updates the local IDB record
 *    so the row's `shareSlug` reflects reality (the next sync pull
 *    would also catch this, but the optimistic write keeps the UI
 *    consistent immediately and prevents a subsequent edit-and-push
 *    from clobbering the server's `share_slug` back to null).
 *  - **Shared** → shows the public URL with a copy-to-clipboard
 *    button, the path to the `/r/<slug>` page, and a "Revoke link"
 *    button that calls `DELETE /api/recipes/[id]/share` and zeroes
 *    the local `shareSlug`.
 *  - **Working** → in-flight spinner during mint / revoke.
 *
 *  The dialog is presentational from the IDB's perspective — the
 *  network call is the source of truth, and the local upsert is just
 *  bringing IDB in line with what the server has already accepted. */
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The recipe to share. `null` keeps the dialog mounted but inert
   *  (matches the parent's pattern of holding a single dialog open
   *  state alongside a "which recipe" variable). */
  recipe: Recipe | null;
  /** Called after a successful mint or revoke so the parent list can
   *  refresh its in-memory snapshot. The IDB has already been
   *  updated; this is just a notification. */
  onChanged?: () => void;
};

export function ShareRecipeDialog({
  open,
  onOpenChange,
  recipe,
  onChanged,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        {open && recipe && (
          <ShareBody
            recipe={recipe}
            onChanged={onChanged}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShareBody({
  recipe,
  onChanged,
  onClose,
}: {
  recipe: Recipe;
  onChanged?: () => void;
  onClose: () => void;
}) {
  // Track the slug locally so the dialog reflects mint/revoke without
  // waiting for a parent re-render. Initial value comes from the
  // recipe prop — if the dialog opens with an already-shared recipe
  // we show the URL straight away.
  const [slug, setSlug] = useState<string | undefined>(recipe.shareSlug);
  const [working, setWorking] = useState<"mint" | "revoke" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url =
    slug && typeof window !== "undefined"
      ? `${window.location.origin}/r/${slug}`
      : "";

  async function mint() {
    if (working) return;
    setWorking("mint");
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/share`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Mint failed (HTTP ${res.status})`);
      }
      const data = (await res.json()) as { slug: string };
      // Mirror the server-side change into IDB so the row's local
      // `shareSlug` is the new slug. Without this, the next local
      // edit + sync push would send `share_slug: null` (from the
      // stale IDB row) and revoke the share. upsertRecipe bumps
      // localUpdatedAt; the resulting sync push is idempotent because
      // the server already has the slug.
      await upsertRecipe({ ...recipe, shareSlug: data.slug });
      bumpPending();
      setSlug(data.slug);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mint failed.");
    } finally {
      setWorking(null);
    }
  }

  async function revoke() {
    if (working || !slug) return;
    if (
      !confirm(
        "Revoke this link? Anyone with the URL will get a 404. You can create a new link later.",
      )
    ) {
      return;
    }
    setWorking("revoke");
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/share`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Revoke failed (HTTP ${res.status})`);
      }
      // Strip shareSlug locally so the row reflects the revoked state.
      // Same dirty-row argument as mint — the local push will idempotently
      // re-confirm `share_slug: null`.
      const { shareSlug: _omit, ...rest } = recipe;
      void _omit;
      await upsertRecipe(rest);
      bumpPending();
      setSlug(undefined);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed.");
    } finally {
      setWorking(null);
    }
  }

  async function copyUrl() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(
        "Couldn't copy automatically — long-press the field and copy manually.",
      );
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Share &ldquo;{recipe.name}&rdquo;</DialogTitle>
        <DialogDescription>
          Anyone with the link can view the recipe. Signed-in viewers see an
          &ldquo;Import to my recipes&rdquo; button on the public page.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {slug ? (
          <>
            <div className="space-y-1.5">
              <label
                htmlFor="share-url"
                className="text-xs font-medium text-muted-foreground"
              >
                Public link
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="share-url"
                  value={url}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyUrl}
                  className="h-10 shrink-0 gap-1.5 sm:h-9"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: the public page has a Print button that browsers turn into{" "}
              <strong>Save as PDF</strong> — handy for sending recipes to people
              who don&apos;t use Maqro.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={revoke}
              disabled={working !== null}
              className="h-10 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9"
            >
              {working === "revoke" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {working === "revoke" ? "Revoking…" : "Revoke link"}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This recipe isn&apos;t shared yet. Generate a public link to send
              it to someone — they can view it in their browser, print it as a
              PDF, or import a copy into their own recipes.
            </p>
            <Button
              type="button"
              onClick={mint}
              disabled={working !== null}
              className="h-10 w-full gap-1.5 sm:h-9 sm:w-auto"
            >
              {working === "mint" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {working === "mint" ? "Creating link…" : "Create shareable link"}
            </Button>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="text-xs text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
        >
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
