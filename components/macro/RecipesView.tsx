"use client";

import type {
  DietPreference,
  PersonalInfo,
  Recipe,
} from "@/components/macro/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addRecipe, deleteRecipe, listRecipes, upsertRecipe } from "@/lib/db";
import { recipeDietCompatibility } from "@/lib/diet";
import { reportStorageError } from "@/lib/storage-status";
import { bumpPending } from "@/lib/sync-status";
import { useEffect, useMemo, useState } from "react";
import { ChefHat, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { GenerateRecipeDialog } from "./GenerateRecipeDialog";
import { RecipeForm, type RecipeDraft } from "./RecipeForm";

type Props = { profile: PersonalInfo };

const DIET_LABEL: Record<DietPreference, string> = {
  omnivore: "Omnivore",
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
  carnivore: "Carnivore",
};

function totalKcal(r: Recipe): number {
  return r.ingredients.reduce(
    (acc, ing) => acc + (ing.macrosPer100g.calories * ing.portionGrams) / 100,
    0,
  );
}

export function RecipesView({ profile }: Props) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editing, setEditing] = useState<RecipeDraft | undefined>(undefined);

  // Load on mount; reload after save/delete via setRecipes.
  useEffect(() => {
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
    };
  }, []);

  const filtered = useMemo(() => {
    if (!recipes) return [];
    const q = search.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, search]);

  async function handleSave(draft: {
    name: string;
    ingredients: Recipe["ingredients"];
    cuisine?: string;
    notes?: string;
  }) {
    if (editing?.id) {
      // Edit path — keep id, bump updatedAt.
      const next: Recipe = {
        id: editing.id,
        name: draft.name,
        ingredients: draft.ingredients,
        cuisine: draft.cuisine,
        notes: draft.notes,
        createdAt: editing.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      await upsertRecipe(next);
      setRecipes((prev) =>
        prev ? prev.map((r) => (r.id === next.id ? next : r)) : [next],
      );
    } else {
      // Create path — mint id via addRecipe.
      const id = await addRecipe({
        name: draft.name,
        ingredients: draft.ingredients,
        cuisine: draft.cuisine,
        notes: draft.notes,
      });
      const now = Date.now();
      const created: Recipe = {
        id,
        name: draft.name,
        ingredients: draft.ingredients,
        cuisine: draft.cuisine,
        notes: draft.notes,
        createdAt: now,
        updatedAt: now,
      };
      setRecipes((prev) => (prev ? [created, ...prev] : [created]));
    }
    bumpPending();
    setEditing(undefined);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this recipe?")) return;
    const prev = recipes;
    setRecipes((rs) => (rs ? rs.filter((r) => r.id !== id) : rs));
    try {
      await deleteRecipe(id);
      bumpPending();
    } catch (err) {
      reportStorageError(err);
      setRecipes(prev);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Recipes</h2>
          <p className="text-xs text-muted-foreground">
            Named bundles of ingredients you can apply to any meal slot.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setGenerateOpen(true)}
            className="flex-1 sm:flex-none"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Generate
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
            className="flex-1 sm:flex-none"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New recipe
          </Button>
        </div>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes…"
          className="pl-9"
        />
      </div>

      {recipes === null ? (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-4 py-10 text-center">
          <ChefHat className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-sm text-muted-foreground">
            {recipes.length === 0
              ? "No recipes yet. Build one manually, or have the AI suggest one based on your diet."
              : "No recipes match your search."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-card">
          {filtered.map((r) => {
            const compat = recipeDietCompatibility(r);
            const kcal = totalKcal(r);
            return (
              <li
                key={r.id}
                className="flex items-center gap-2 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
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
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
                    <span>
                      {r.ingredients.length} ingredient
                      {r.ingredients.length === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span>{Math.round(kcal)} kcal</span>
                    {compat.size > 0 && compat.size < 5 && (
                      <>
                        <span>·</span>
                        <span className="text-[10px]">
                          {[...compat].map((d) => DIET_LABEL[d]).join(", ")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditing(r);
                    setFormOpen(true);
                  }}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(r.id)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <RecipeForm
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditing(undefined);
        }}
        initial={editing}
        onSave={handleSave}
      />
      <GenerateRecipeDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        profile={profile}
        onDraft={(draft) => {
          setEditing(draft);
          setFormOpen(true);
        }}
      />
    </div>
  );
}
