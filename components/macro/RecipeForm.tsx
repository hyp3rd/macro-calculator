"use client";

import {
  CUISINES,
  type Food,
  type FoodKind,
  type Recipe,
  type RecipeIngredient,
} from "@/components/macro/types";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFoodSearch } from "@/hooks/use-food-search";
import { classifyFood } from "@/lib/diet";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

const NAME_MAX = 80;
const NOTES_MAX = 500;
const PORTION_MIN = 5;
const PORTION_MAX = 500;
const DEFAULT_PORTION = 100;

/** Recipe draft passed in from create / edit / AI-generate flows. The
 *  AI generate route returns this shape (no id/timestamps yet). */
export type RecipeDraft = Omit<Recipe, "id" | "createdAt" | "updatedAt"> &
  Partial<Pick<Recipe, "id" | "createdAt" | "updatedAt">>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the form is in edit mode (id present) or pre-fill mode
   *  (AI draft, id absent). When undefined, the form is creating fresh. */
  initial?: RecipeDraft;
  /** Persist callback. Receives the recipe shape without id/timestamps —
   *  the caller decides whether to addRecipe (mint id) or upsertRecipe
   *  (keep id). */
  onSave: (draft: {
    name: string;
    ingredients: RecipeIngredient[];
    cuisine?: string;
    notes?: string;
  }) => Promise<void>;
};

function deriveKind(food: Food): FoodKind | undefined {
  if (food.dietKind) return food.dietKind;
  const k = classifyFood(food);
  return k === "unknown" ? undefined : k;
}

function foodToIngredient(food: Food, grams: number): RecipeIngredient {
  return {
    foodName: food.name,
    macrosPer100g: {
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      calories: food.calories,
    },
    portionGrams: grams,
    dietKind: deriveKind(food),
  };
}

function ingredientMacros(ing: RecipeIngredient) {
  const r = ing.portionGrams / 100;
  return {
    protein: ing.macrosPer100g.protein * r,
    carbs: ing.macrosPer100g.carbs * r,
    fat: ing.macrosPer100g.fat * r,
    calories: ing.macrosPer100g.calories * r,
  };
}

function totalMacros(ingredients: RecipeIngredient[]) {
  return ingredients.reduce(
    (acc, ing) => {
      const m = ingredientMacros(ing);
      return {
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
        calories: acc.calories + m.calories,
      };
    },
    { protein: 0, carbs: 0, fat: 0, calories: 0 },
  );
}

function clampPortion(g: number): number {
  if (!Number.isFinite(g)) return PORTION_MIN;
  return Math.max(PORTION_MIN, Math.min(PORTION_MAX, Math.round(g)));
}

export function RecipeForm({ open, onOpenChange, initial, onSave }: Props) {
  // Outer wrapper just owns the Dialog. The actual form is mounted only
  // while `open` is true, so its `useState(initial?.x ?? "")` reads serve
  // as the per-open initial values — no `setState-in-effect` resync needed.
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-2xl">
        {open && (
          <RecipeFormBody
            initial={initial}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecipeFormBody({
  initial,
  onSave,
  onClose,
}: {
  initial?: RecipeDraft;
  onSave: Props["onSave"];
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [cuisine, setCuisine] = useState(initial?.cuisine ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    initial?.ingredients ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Ingredient picker ──────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const { results, isSearchingRemote } = useFoodSearch(query);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    if (!showResults) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [showResults]);

  function handlePick(food: Food) {
    setIngredients((prev) => [
      ...prev,
      foodToIngredient(food, DEFAULT_PORTION),
    ]);
    setQuery("");
    setShowResults(false);
  }

  function handlePortionChange(idx: number, raw: string) {
    const g = clampPortion(parseFloat(raw));
    setIngredients((prev) =>
      prev.map((ing, i) => (i === idx ? { ...ing, portionGrams: g } : ing)),
    );
  }

  function handleRemove(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  }

  const totals = useMemo(() => totalMacros(ingredients), [ingredients]);
  const isEdit = !!initial?.id;
  const canSave = name.trim().length > 0 && ingredients.length > 0 && !busy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        name: name.trim().slice(0, NAME_MAX),
        ingredients,
        cuisine: cuisine.trim() || undefined,
        notes: notes.trim() ? notes.trim().slice(0, NOTES_MAX) : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recipe.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit recipe" : "New recipe"}</DialogTitle>
        <DialogDescription>
          Build a recipe from your foods. Macros are computed per 100g × portion
          — no estimates.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label
            htmlFor="recipe-name"
            className="text-xs font-medium"
          >
            Name
          </Label>
          <Input
            id="recipe-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX}
            placeholder="e.g. Chicken & oats bowl"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="recipe-cuisine"
            className="text-xs font-medium"
          >
            Cuisine (optional)
          </Label>
          <Input
            id="recipe-cuisine"
            list="cuisine-suggestions"
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            placeholder="e.g. Italian"
          />
          <datalist id="cuisine-suggestions">
            {CUISINES.map((c) => (
              <option
                key={c}
                value={c}
              />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="recipe-notes"
            className="text-xs font-medium"
          >
            Prep notes (optional)
            <span className="ml-2 text-[10px] text-muted-foreground">
              {notes.length}/{NOTES_MAX}
            </span>
          </Label>
          <Textarea
            id="recipe-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
            placeholder="1–3 sentences on how to prep this."
            rows={3}
          />
        </div>

        {/* ─── Ingredient picker ───────────────────────────────── */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Ingredients</Label>
          <div
            ref={pickerRef}
            className="relative"
          >
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              placeholder="Search built-in, your foods, and Open Food Facts…"
            />
            {isSearchingRemote && query && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {showResults && query && results.length > 0 && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-md border border-border/60 bg-popover shadow-lg">
                <ul className="py-1">
                  {results.map((food) => (
                    <li key={food.id ?? food.name}>
                      <button
                        type="button"
                        onClick={() => handlePick(food)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm">
                              {food.name}
                            </span>
                            {food.source && (
                              <Badge
                                variant="secondary"
                                className="shrink-0 text-[9px] font-medium uppercase tracking-wide"
                              >
                                {food.source}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                            {Math.round(food.calories)} kcal · P
                            {food.protein.toFixed(1)} · C{food.carbs.toFixed(1)}{" "}
                            · F{food.fat.toFixed(1)}
                            <span className="ml-1 text-muted-foreground/60">
                              / 100g
                            </span>
                          </div>
                        </div>
                        <Plus className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {ingredients.length === 0 ? (
            <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
              Search above to add ingredients.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {ingredients.map((ing, idx) => {
                const m = ingredientMacros(ing);
                return (
                  <li
                    key={`${ing.foodName}-${idx}`}
                    className="flex items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {ing.foodName}
                      </div>
                      <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {Math.round(m.calories)} kcal · P{m.protein.toFixed(1)}{" "}
                        · C{m.carbs.toFixed(1)} · F{m.fat.toFixed(1)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={ing.portionGrams}
                        min={PORTION_MIN}
                        max={PORTION_MAX}
                        onChange={(e) =>
                          handlePortionChange(idx, e.target.value)
                        }
                        className="h-8 w-16 text-right font-mono tabular-nums"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        g
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {ingredients.length > 0 && (
            <div
              className={cn(
                "rounded-md bg-muted/50 px-3 py-2 font-mono text-[11px]",
                "tabular-nums text-muted-foreground",
              )}
            >
              Total: {Math.round(totals.calories)} kcal · P
              {totals.protein.toFixed(1)} · C{totals.carbs.toFixed(1)} · F
              {totals.fat.toFixed(1)}
            </div>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="text-xs text-destructive"
          >
            {error}
          </p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!canSave}
        >
          {busy ? "Saving…" : isEdit ? "Save changes" : "Save recipe"}
        </Button>
      </DialogFooter>
    </form>
  );
}
