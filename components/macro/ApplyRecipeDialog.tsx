"use client";

import type { DietPreference, Recipe } from "@/components/macro/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteRecipe, listRecipes } from "@/lib/db";
import { recipeDietCompatibility } from "@/lib/diet";
import { reportStorageError } from "@/lib/storage-status";
import { bumpPending } from "@/lib/sync-status";
import { useEffect, useState } from "react";
import { ChefHat, Trash2 } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Display name for the target meal slot (e.g. "Breakfast"). */
  targetMealName: string;
  /** Filter the recipe list down to ones compatible with this diet, so a
   *  vegan user doesn't see chicken-stir-fry suggestions. */
  dietPreference?: DietPreference;
  onApply: (recipe: Recipe) => void;
};

function totalKcal(r: Recipe): number {
  return r.ingredients.reduce(
    (acc, ing) => acc + (ing.macrosPer100g.calories * ing.portionGrams) / 100,
    0,
  );
}

export function ApplyRecipeDialog({
  open,
  onOpenChange,
  targetMealName,
  dietPreference,
  onApply,
}: Props) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const loading = open && recipes === null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listRecipes()
      .then((rows) => {
        if (!cancelled) setRecipes(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        reportStorageError(err);
        setRecipes([]);
      });
    return () => {
      cancelled = true;
      setRecipes(null);
    };
  }, [open]);

  const filtered = recipes
    ? recipes.filter(
        (r) =>
          !dietPreference || recipeDietCompatibility(r).has(dietPreference),
      )
    : [];

  async function handleDelete(id: string) {
    setRecipes((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    try {
      await deleteRecipe(id);
      bumpPending();
    } catch (err) {
      reportStorageError(err);
      const fresh = await listRecipes().catch(() => null);
      if (fresh) setRecipes(fresh);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply recipe</DialogTitle>
          <DialogDescription>
            Apply a saved recipe to <strong>{targetMealName}</strong>. Its
            ingredients will be appended as individual foods you can still
            adjust.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-auto py-2">
          {loading ? (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground">
              Loading…
            </p>
          ) : filtered.length === 0 ? (
            <div className="px-1 py-6 text-center">
              <ChefHat className="mx-auto h-5 w-5 text-muted-foreground/60" />
              <p className="mt-2 text-xs text-muted-foreground">
                {recipes && recipes.length === 0
                  ? "No recipes saved yet. Open the Recipes view to create one."
                  : `No recipes match the ${dietPreference} diet preference.`}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {filtered.map((r) => {
                const kcal = totalKcal(r);
                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 px-1 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onApply(r);
                        onOpenChange(false);
                      }}
                      className="flex-1 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {r.name}
                        </span>
                        {r.cuisine && (
                          <Badge
                            variant="secondary"
                            className="shrink-0 text-[10px] font-normal"
                          >
                            {r.cuisine}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {r.ingredients.length} ingredient
                        {r.ingredients.length === 1 ? "" : "s"} ·{" "}
                        {Math.round(kcal)} kcal
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8"
                      onClick={() => handleDelete(r.id)}
                      aria-label={`Delete recipe ${r.name}`}
                    >
                      <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
