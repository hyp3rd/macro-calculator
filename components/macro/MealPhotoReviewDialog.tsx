"use client";

import type { ResolvedMealPhoto } from "@/app/api/identify-meal/route";
import type { FoodItem, FoodKind, Meal } from "@/components/macro/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { Sparkles, Trash2 } from "lucide-react";

const PORTION_MIN = 5;
const PORTION_MAX = 500;

/** Newly-discovered foods the dialog will save as custom foods on
 *  confirm (when the user opts in). The parent owns the actual save
 *  via the `onSaveCustomFoods` callback so this dialog stays
 *  presentational and the IDB write goes through one code path. */
export type EstimatedCustomFood = {
  name: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  dietKind?: FoodKind;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** AI-resolved meal photo. `null` while the parent is fetching it. */
  result: ResolvedMealPhoto | null;
  /** The user's current meal slots — picker source. */
  meals: Meal[];
  /** Fires with the chosen meal id + the FoodItems to append AND
   *  (when the user opted in) the AI-estimated foods to persist as
   *  custom foods. The parent owns the actual writes. */
  onConfirm: (
    mealId: number,
    foods: FoodItem[],
    newCustomFoods: EstimatedCustomFood[],
  ) => void;
};

/** Multi-food review screen for the meal-photo flow. The AI returned a
 *  list of identified foods with estimated grams; the user can edit
 *  grams, remove obvious mistakes, pick a meal slot, and confirm.
 *  Macros recompute locally per-row when grams change — the route's
 *  `per100g` snapshot makes that deterministic. */
export function MealPhotoReviewDialog({
  open,
  onOpenChange,
  result,
  meals,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-2xl">
        {open && result && (
          <ReviewBody
            result={result}
            meals={meals}
            onConfirm={(mealId, foods, newCustomFoods) => {
              onConfirm(mealId, foods, newCustomFoods);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Row = ResolvedMealPhoto["foods"][number];

function buildFoodItem(row: Row, idBase: number, index: number): FoodItem {
  const ratio = row.portionGrams / 100;
  return {
    id: idBase + index,
    name: row.name,
    protein: Number.parseFloat((row.per100g.protein * ratio).toFixed(1)),
    carbs: Number.parseFloat((row.per100g.carbs * ratio).toFixed(1)),
    fat: Number.parseFloat((row.per100g.fat * ratio).toFixed(1)),
    calories: Math.round(row.per100g.calories * ratio),
    portionSize: row.portionGrams,
    originalValues: {
      proteinPer100g: row.per100g.protein,
      carbsPer100g: row.per100g.carbs,
      fatPer100g: row.per100g.fat,
      caloriesPer100g: row.per100g.calories,
    },
  };
}

function ReviewBody({
  result,
  meals,
  onConfirm,
  onCancel,
}: {
  result: ResolvedMealPhoto;
  meals: Meal[];
  onConfirm: (
    mealId: number,
    foods: FoodItem[],
    newCustomFoods: EstimatedCustomFood[],
  ) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(result.foods);
  const [mealId, setMealId] = useState<number | null>(meals[0]?.id ?? null);
  // Whether to persist AI-estimated rows as custom foods on confirm. The
  // default is on: the user just spent the effort to identify a tomato,
  // saving it means the next photo of the same item resolves to the
  // catalog (no AI guess), which is the whole point of the loop.
  const [saveEstimated, setSaveEstimated] = useState(true);

  function updateGrams(idx: number, raw: string) {
    const n = Number.parseInt(raw, 10);
    const clamped = Number.isNaN(n)
      ? PORTION_MIN
      : Math.max(PORTION_MIN, Math.min(PORTION_MAX, n));
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, portionGrams: clamped } : r)),
    );
  }

  function remove(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  const canConfirm = mealId !== null && rows.length > 0;
  const totals = rows.reduce(
    (acc, r) => {
      const ratio = r.portionGrams / 100;
      return {
        protein: acc.protein + r.per100g.protein * ratio,
        carbs: acc.carbs + r.per100g.carbs * ratio,
        fat: acc.fat + r.per100g.fat * ratio,
        calories: acc.calories + r.per100g.calories * ratio,
      };
    },
    { protein: 0, carbs: 0, fat: 0, calories: 0 },
  );

  function handleConfirm() {
    if (!canConfirm) return;
    const idBase = Date.now();
    const items = rows.map((r, i) => buildFoodItem(r, idBase, i));
    const newCustomFoods: EstimatedCustomFood[] = saveEstimated
      ? rows
          .filter((r) => r.estimated)
          .map((r) => ({
            name: r.name,
            protein: r.per100g.protein,
            carbs: r.per100g.carbs,
            fat: r.per100g.fat,
            calories: r.per100g.calories,
          }))
      : [];
    onConfirm(mealId, items, newCustomFoods);
  }

  const estimatedCount = rows.filter((r) => r.estimated).length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Review identified foods</DialogTitle>
        <DialogDescription>
          The AI estimated each portion from the photo. Tweak grams, remove
          anything off, then pick a meal slot.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3 py-2">
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
            No foods to add. Cancel and try a different photo.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((row, idx) => {
              const ratio = row.portionGrams / 100;
              return (
                <li
                  key={`${row.name}-${idx}`}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {row.name}
                      </span>
                      <ConfidenceBadge level={row.confidence} />
                      {row.estimated && <EstimatedBadge />}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {Math.round(row.per100g.calories * ratio)} kcal · P
                      {(row.per100g.protein * ratio).toFixed(1)} · C
                      {(row.per100g.carbs * ratio).toFixed(1)} · F
                      {(row.per100g.fat * ratio).toFixed(1)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={row.portionGrams}
                      min={PORTION_MIN}
                      max={PORTION_MAX}
                      onChange={(e) => updateGrams(idx, e.target.value)}
                      className="h-8 w-16 text-right font-mono tabular-nums"
                    />
                    <span className="text-[10px] text-muted-foreground">g</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(idx)}
                    title={`Remove ${row.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {rows.length > 0 && (
          <div className="rounded-md bg-muted/50 px-3 py-2 font-mono text-[11px] tabular-nums text-muted-foreground">
            Total: {Math.round(totals.calories)} kcal · P
            {totals.protein.toFixed(1)} · C{totals.carbs.toFixed(1)} · F
            {totals.fat.toFixed(1)}
          </div>
        )}

        {estimatedCount > 0 && (
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
            <Checkbox
              id="save-estimated"
              checked={saveEstimated}
              onCheckedChange={(v) => setSaveEstimated(v === true)}
              className="mt-0.5"
            />
            <span className="flex-1 leading-snug">
              <span className="font-medium">
                Save {estimatedCount} AI-estimated food
                {estimatedCount === 1 ? "" : "s"} to My Foods
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                Next photo of the same item will use these macros instead of
                another AI guess. You can edit them later in My Foods.
              </span>
            </span>
          </label>
        )}

        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <Label
            htmlFor="meal-slot"
            className="text-xs font-medium text-muted-foreground"
          >
            Add to meal
          </Label>
          <Select
            value={mealId?.toString() ?? ""}
            onValueChange={(v) => setMealId(Number.parseInt(v, 10))}
          >
            <SelectTrigger id="meal-slot">
              <SelectValue placeholder="Pick a meal slot" />
            </SelectTrigger>
            <SelectContent>
              {meals.map((m) => (
                <SelectItem
                  key={m.id}
                  value={m.id.toString()}
                >
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
        >
          {rows.length === 0
            ? "Nothing to add"
            : `Add ${rows.length} food${rows.length === 1 ? "" : "s"}`}
        </Button>
      </DialogFooter>
    </>
  );
}

function EstimatedBadge() {
  return (
    <Badge
      variant="secondary"
      className="shrink-0 gap-1 bg-indigo-500/15 text-[10px] font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300"
      title="Macros estimated by AI — not in your catalog. Edit grams if needed."
    >
      <Sparkles className="h-2.5 w-2.5" />
      AI est.
    </Badge>
  );
}

function ConfidenceBadge({ level }: { level: Row["confidence"] }) {
  const className =
    level === "high"
      ? "bg-foreground/10 text-foreground"
      : level === "medium"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  return (
    <Badge
      variant="secondary"
      className={`shrink-0 text-[10px] font-medium uppercase tracking-wide ${className}`}
    >
      {level}
    </Badge>
  );
}
