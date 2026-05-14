"use client";

import type { Food, FoodKind } from "@/components/macro/types";
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
import {
  addCustomFood,
  customToFood,
  upsertCustomFood,
  type CustomFood,
} from "@/lib/db";
import { FOOD_KIND_LABEL } from "@/lib/diet";
import { bumpPending } from "@/lib/sync-status";
import { useState } from "react";

type DraftFood = {
  name: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  brand: string;
  /** Empty string = not classified yet. We don't pre-default a kind because
   * "plant" vs "land-meat" is a meaningful pick the user should make
   * deliberately, and unclassified custom foods become omnivore-only
   * (handled by the diet filter), so a missing value still does something
   * sensible. */
  dietKind: FoodKind | "";
};

const EMPTY_DRAFT: DraftFood = {
  name: "",
  protein: 0,
  carbs: 0,
  fat: 0,
  calories: 0,
  brand: "",
  dietKind: "",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional initial values — used when "saving" an OFF result. */
  initial?: Partial<DraftFood>;
  /** When present, the dialog is in edit mode — pre-fills from this row
   * and saves via upsert (preserving id + createdAt). */
  editing?: CustomFood;
  onSaved: (food: Food) => void;
};

function toDraft(
  editing?: CustomFood,
  initial?: Partial<DraftFood>,
): DraftFood {
  if (editing) {
    return {
      name: editing.name,
      protein: editing.protein,
      carbs: editing.carbs,
      fat: editing.fat,
      calories: editing.calories,
      brand: editing.brand ?? "",
      dietKind: editing.dietKind ?? "",
    };
  }
  return { ...EMPTY_DRAFT, ...initial };
}

/** Modal form for adding or editing a custom food. All macros are per 100g.
 * Calories auto-derive from macros (4/4/9) unless the user types an explicit
 * value. The "Kind" field classifies the food for the diet filter — leave
 * blank and the food becomes omnivore-only.
 *
 * The Dialog wrapper stays mounted while the dialog is closed; the inner
 * `<Form>` re-mounts via `key` whenever the editing target changes, which
 * lets `useState` initializers seed the draft from props without an effect. */
export function CustomFoodForm({
  open,
  onOpenChange,
  initial,
  editing,
  onSaved,
}: Props) {
  // `key` swaps on (open transition × target) so the form starts fresh
  // each time the dialog opens for a new food.
  const formKey = `${open}-${editing?.id ?? "new"}`;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <Form
          key={formKey}
          initial={initial}
          editing={editing}
          onSaved={onSaved}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function Form({
  initial,
  editing,
  onSaved,
  onClose,
}: {
  initial?: Partial<DraftFood>;
  editing?: CustomFood;
  onSaved: (food: Food) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DraftFood>(() =>
    toDraft(editing, initial),
  );
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
      const payload = {
        name: draft.name.trim(),
        protein: draft.protein,
        carbs: draft.carbs,
        fat: draft.fat,
        calories: draft.calories,
        brand: draft.brand.trim() || undefined,
        dietKind: draft.dietKind === "" ? undefined : draft.dietKind,
      };
      let savedFood: CustomFood;
      if (editing) {
        savedFood = { ...editing, ...payload };
        await upsertCustomFood(savedFood);
      } else {
        const id = await addCustomFood(payload);
        savedFood = { id, createdAt: Date.now(), ...payload };
      }
      bumpPending();
      onSaved(customToFood(savedFood));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {editing ? "Edit custom food" : "Add custom food"}
        </DialogTitle>
        <DialogDescription>
          Macros are stored per 100g. Calories auto-calculate from macros unless
          you override.
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
        <div className="col-span-2 space-y-2">
          <Label htmlFor="cf-kind">Kind</Label>
          <Select
            value={draft.dietKind}
            onValueChange={(v) =>
              setDraft({ ...draft, dietKind: v as FoodKind })
            }
          >
            <SelectTrigger id="cf-kind">
              <SelectValue placeholder="Pick a kind (omnivore-only if blank)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plant">{FOOD_KIND_LABEL.plant}</SelectItem>
              <SelectItem value="seafood">{FOOD_KIND_LABEL.seafood}</SelectItem>
              <SelectItem value="land-meat">
                {FOOD_KIND_LABEL["land-meat"]}
              </SelectItem>
              <SelectItem value="egg">{FOOD_KIND_LABEL.egg}</SelectItem>
              <SelectItem value="dairy">{FOOD_KIND_LABEL.dairy}</SelectItem>
              <SelectItem value="honey">{FOOD_KIND_LABEL.honey}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Drives the diet filter when Auto-fill builds a plan. Leave blank and
            the food only shows up under the Omnivore preference.
          </p>
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
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving..." : editing ? "Save changes" : "Save food"}
        </Button>
      </DialogFooter>
    </>
  );
}
