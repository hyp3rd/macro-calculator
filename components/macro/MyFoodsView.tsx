"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteCustomFood, listCustomFoods, type CustomFood } from "@/lib/db";
import { reportStorageError } from "@/lib/storage-status";
import { bumpPending } from "@/lib/sync-status";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { CustomFoodForm } from "./CustomFoodForm";

/** Browse + manage everything saved under "My foods" — the same store
 * that powers the meal-plan search. Classify, edit, and prune custom
 * foods from one place. Bumps the search revision via onChange so the
 * meal-plan view re-queries after edits. */
export function MyFoodsView({ onChange }: { onChange?: () => void }) {
  const [foods, setFoods] = useState<CustomFood[] | null>(null);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFood | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<CustomFood | null>(null);

  async function refresh() {
    try {
      const rows = await listCustomFoods();
      setFoods(rows);
    } catch (err) {
      reportStorageError(err);
      setFoods([]);
    }
  }

  // Initial load. The state update happens in the .then callback (after a
  // microtask), so the react-hooks/set-state-in-effect rule is satisfied —
  // we're not invoking setState synchronously inside the effect body.
  useEffect(() => {
    listCustomFoods()
      .then((rows) => setFoods(rows))
      .catch((err) => {
        reportStorageError(err);
        setFoods([]);
      });
  }, []);

  const filtered = useMemo(() => {
    if (!foods) return null;
    const q = query.trim().toLowerCase();
    if (!q) return foods;
    return foods.filter(
      (f) =>
        f.name.toLowerCase().includes(q) || f.brand?.toLowerCase().includes(q),
    );
  }, [foods, query]);

  const untaggedCount = useMemo(
    () => (foods ? foods.filter((f) => !f.dietKind).length : 0),
    [foods],
  );

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await deleteCustomFood(id);
      bumpPending();
      onChange?.();
      await refresh();
    } catch (err) {
      reportStorageError(err);
    }
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <header className="flex flex-col gap-3 border-b border-border/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">My Foods</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Custom foods you&apos;ve saved, plus anything imported from Open
              Food Facts. Classify them so the meal-plan diet filter respects
              your preferences.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
            className="h-8 gap-1.5 self-end sm:self-auto"
          >
            <Plus className="h-3.5 w-3.5" />
            Add food
          </Button>
        </header>

        <div className="border-b border-border/60 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name or brand"
              className="h-9 pl-9"
            />
          </div>
        </div>

        {untaggedCount > 0 && (
          <div className="flex items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              <span className="font-medium">
                {untaggedCount} food{untaggedCount === 1 ? "" : "s"}{" "}
                unclassified.
              </span>{" "}
              Untagged foods only show up under the Omnivore diet preference —
              tap Edit and pick a kind to make them available to other diets.
            </p>
          </div>
        )}

        {!filtered ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {foods && foods.length === 0
              ? "No custom foods yet. Add one above or save Open Food Facts results from the Meal Plan search."
              : "No matches for that filter."}
          </div>
        ) : (
          <>
            {/* Mobile: card list. The 7-column table is unreadable
                below ~640px even with horizontal scroll — too much
                squinting + sideways panning. Cards put the food name
                front and centre with macros in a compact inline row. */}
            <ul className="divide-y divide-border/60 sm:hidden">
              {filtered.map((food) => (
                <li
                  key={food.id}
                  className="flex items-start gap-3 px-4 py-3 active:bg-muted/30"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {food.name}
                      </span>
                      {food.dietKind ? (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {food.dietKind}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] italic text-amber-700 dark:text-amber-400">
                          unclassified
                        </span>
                      )}
                    </div>
                    {food.brand && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {food.brand}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums">
                      <span className="font-medium text-foreground">
                        {food.calories} kcal
                      </span>
                      <span style={{ color: "hsl(var(--macro-protein))" }}>
                        P{food.protein}
                      </span>
                      <span style={{ color: "hsl(var(--macro-carbs))" }}>
                        C{food.carbs}
                      </span>
                      <span style={{ color: "hsl(var(--macro-fat))" }}>
                        F{food.fat}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground"
                      onClick={() => {
                        setEditing(food);
                        setFormOpen(true);
                      }}
                      aria-label={`Edit ${food.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDelete(food)}
                      aria-label={`Delete ${food.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: keep the dense table for at-a-glance comparison. */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Kind</th>
                    <th className="px-3 py-2 text-center">P</th>
                    <th className="px-3 py-2 text-center">C</th>
                    <th className="px-3 py-2 text-center">F</th>
                    <th className="px-3 py-2 text-center">kcal</th>
                    <th
                      className="w-24 px-3 py-2 text-right"
                      aria-hidden
                    />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filtered.map((food) => (
                    <tr
                      key={food.id}
                      className="transition-colors hover:bg-muted/40"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col">
                          <span className="text-foreground">{food.name}</span>
                          {food.brand && (
                            <span className="text-[11px] text-muted-foreground">
                              {food.brand}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {food.dietKind ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {food.dietKind}
                          </span>
                        ) : (
                          <span className="text-[11px] italic text-amber-700 dark:text-amber-400">
                            unclassified
                          </span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2.5 text-center font-mono text-xs tabular-nums"
                        style={{ color: "hsl(var(--macro-protein))" }}
                      >
                        {food.protein}g
                      </td>
                      <td
                        className="px-3 py-2.5 text-center font-mono text-xs tabular-nums"
                        style={{ color: "hsl(var(--macro-carbs))" }}
                      >
                        {food.carbs}g
                      </td>
                      <td
                        className="px-3 py-2.5 text-center font-mono text-xs tabular-nums"
                        style={{ color: "hsl(var(--macro-fat))" }}
                      >
                        {food.fat}g
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-xs font-medium tabular-nums text-foreground">
                        {food.calories}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => {
                              setEditing(food);
                              setFormOpen(true);
                            }}
                            aria-label={`Edit ${food.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setPendingDelete(food)}
                            aria-label={`Delete ${food.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <CustomFoodForm
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(undefined);
        }}
        editing={editing}
        onSaved={() => {
          onChange?.();
          refresh();
        }}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{pendingDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the food from My Foods. Past meal logs that already
              contain it keep their entries — only future searches will stop
              suggesting it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
