"use client";

import type { Food } from "@/components/macro/types";
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
import { addCustomFood, customToFood } from "@/lib/db";
import { bumpPending } from "@/lib/sync-status";
import { useState } from "react";

type DraftFood = {
  name: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  brand: string;
};

const EMPTY_DRAFT: DraftFood = {
  name: "",
  protein: 0,
  carbs: 0,
  fat: 0,
  calories: 0,
  brand: "",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional initial values — used when "saving" an OFF result. */
  initial?: Partial<DraftFood>;
  onSaved: (food: Food) => void;
};

/** Modal form for adding a custom food. All macros are per 100g.
 * Calories are auto-derived from macros (4/4/9) unless the user types
 * an explicit value. */
export function CustomFoodForm({
  open,
  onOpenChange,
  initial,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<DraftFood>({ ...EMPTY_DRAFT, ...initial });
  const [caloriesEdited, setCaloriesEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setNumeric(field: keyof DraftFood, raw: string) {
    const v = Number.parseFloat(raw);
    const next = { ...draft, [field]: Number.isNaN(v) ? 0 : v };
    if (
      !caloriesEdited &&
      (field === "protein" || field === "carbs" || field === "fat")
    ) {
      next.calories = Math.round(
        next.protein * 4 + next.carbs * 4 + next.fat * 9,
      );
    }
    setDraft(next);
  }

  async function save() {
    setError(null);
    if (!draft.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    try {
      const id = await addCustomFood({
        name: draft.name.trim(),
        protein: draft.protein,
        carbs: draft.carbs,
        fat: draft.fat,
        calories: draft.calories,
        brand: draft.brand.trim() || undefined,
      });
      bumpPending();
      onSaved(
        customToFood({
          id,
          createdAt: Date.now(),
          name: draft.name.trim(),
          protein: draft.protein,
          carbs: draft.carbs,
          fat: draft.fat,
          calories: draft.calories,
          brand: draft.brand.trim() || undefined,
        }),
      );
      setDraft(EMPTY_DRAFT);
      setCaloriesEdited(false);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setDraft({ ...EMPTY_DRAFT, ...initial });
          setCaloriesEdited(false);
          setError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add custom food</DialogTitle>
          <DialogDescription>
            Macros are stored per 100g. Calories auto-calculate from macros
            unless you override.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="cf-name">Name</Label>
            <Input
              id="cf-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="cf-brand">Brand (optional)</Label>
            <Input
              id="cf-brand"
              value={draft.brand}
              onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-protein">Protein / 100g</Label>
            <Input
              id="cf-protein"
              type="number"
              min="0"
              step="0.1"
              value={draft.protein}
              onChange={(e) => setNumeric("protein", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-carbs">Carbs / 100g</Label>
            <Input
              id="cf-carbs"
              type="number"
              min="0"
              step="0.1"
              value={draft.carbs}
              onChange={(e) => setNumeric("carbs", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-fat">Fat / 100g</Label>
            <Input
              id="cf-fat"
              type="number"
              min="0"
              step="0.1"
              value={draft.fat}
              onChange={(e) => setNumeric("fat", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-calories">Calories / 100g</Label>
            <Input
              id="cf-calories"
              type="number"
              min="0"
              step="1"
              value={draft.calories}
              onChange={(e) => {
                setCaloriesEdited(true);
                setNumeric("calories", e.target.value);
              }}
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-600"
          >
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save food"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
