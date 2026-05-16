"use client";

import type { ResolvedMealPhoto } from "@/app/api/identify-meal/route";
import type { FoodItem, Meal } from "@/components/macro/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { AlertCircle, Trash2 } from "lucide-react";

const PORTION_MIN = 5;
const PORTION_MAX = 500;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** AI-resolved meal photo. `null` while the parent is fetching it. */
  result: ResolvedMealPhoto | null;
  /** The user's current meal slots — picker source. */
  meals: Meal[];
  /** Fires with the chosen meal id + the FoodItems to append. The
   *  parent owns the actual setMeals update so this dialog stays
   *  presentational. */
  onConfirm: (mealId: number, foods: FoodItem[]) => void;
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
            onConfirm={(mealId, foods) => {
              onConfirm(mealId, foods);
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
  onConfirm: (mealId: number, foods: FoodItem[]) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(result.foods);
  const [mealId, setMealId] = useState<number | null>(meals[0]?.id ?? null);

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
    onConfirm(mealId, items);
  }

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

        {result.unmatched.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <p className="font-medium">
                Skipped {result.unmatched.length} item
                {result.unmatched.length === 1 ? "" : "s"} not in your catalog:
              </p>
              <p className="mt-0.5 text-[11px] opacity-80">
                {result.unmatched.join(", ")}
              </p>
              <p className="mt-1 text-[11px] opacity-70">
                Add them as custom foods if you want them recognized next time.
              </p>
            </div>
          </div>
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
