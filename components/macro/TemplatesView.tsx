"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  computeSortBetween,
  deleteMealTemplate,
  listMealTemplates,
  setSortOrder,
  upsertMealTemplate,
  type MealTemplate,
} from "@/lib/db";
import { reportStorageError } from "@/lib/storage-status";
import { bumpPending } from "@/lib/sync-status";
import { useDataRev } from "@/lib/sync/data-bus";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  LayoutGrid,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortControl, sortByMode, useSortMode } from "./SortControl";
import { TemplateEditDialog } from "./TemplateEditDialog";
import { useSortableRow } from "./useSortableRow";

/** Top-level page that lists meal templates the user has saved (today
 *  the only way to interact with them is the "Apply template" dialog
 *  inside the meal planner — this view lets the user manage them
 *  outside that flow).
 *
 *  V1 capabilities: list, rename, delete, expand to see ingredients.
 *  Creation still happens from the meal planner (the "Save as template"
 *  button on a meal slot, which is the path users are already used to).
 *  A "create blank template + add foods directly here" flow needs a
 *  food-picker UI that's bigger than this Pass; tracked as a follow-up. */
export function TemplatesView() {
  const [templates, setTemplates] = useState<MealTemplate[] | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<MealTemplate | null>(null);
  // Templates don't have a meaningful "type" axis (no cuisine field),
  // so only expose three of the four modes.
  const [sortMode, setSortMode] = useSortMode("sort:templates", "recent");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Re-load on mount + every realtime arrival for meal_templates. Same
  // pattern as RecipesView so the page stays consistent across devices.
  const templatesRev = useDataRev("mealTemplates");
  useEffect(() => {
    let cancelled = false;
    listMealTemplates()
      .then((rows) => {
        if (!cancelled) setTemplates(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        reportStorageError(err);
        setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [templatesRev]);

  const filtered = useMemo(() => {
    if (!templates) return [];
    const q = search.trim().toLowerCase();
    const matched = q
      ? templates.filter((t) => t.name.toLowerCase().includes(q))
      : templates;
    return sortByMode(matched, sortMode, {
      sortOrder: (t) => t.sortOrder,
      recentField: (t) => t.updatedAt,
    });
  }, [templates, search, sortMode]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const items = filtered;
    const draggedRow = items.find((t) => t.id === active.id);
    if (!draggedRow) return;
    const without = items.filter((t) => t.id !== active.id);
    const insertAt = items.findIndex((t) => t.id === over.id);
    const before = without[insertAt - 1];
    const after = without[insertAt];
    const newOrder = computeSortBetween(
      before?.sortOrder ?? null,
      after?.sortOrder ?? null,
    );
    setTemplates((prev) =>
      prev
        ? prev.map((t) =>
            t.id === active.id ? { ...t, sortOrder: newOrder } : t,
          )
        : prev,
    );
    try {
      await setSortOrder("mealTemplates", String(active.id), newOrder);
      bumpPending();
    } catch (err) {
      reportStorageError(err);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(t: MealTemplate) {
    if (!confirm(`Delete "${t.name}"?`)) return;
    const prev = templates;
    setTemplates((rs) => (rs ? rs.filter((r) => r.id !== t.id) : rs));
    try {
      await deleteMealTemplate(t.id);
      bumpPending();
    } catch (err) {
      reportStorageError(err);
      setTemplates(prev);
    }
  }

  /** Save the full edit (name + foods). The full editor replaces the
   *  old rename-only dialog — renames are a degenerate case (foods
   *  array unchanged). Optimistic update with revert on IDB failure. */
  async function handleSaveEdit(
    t: MealTemplate,
    next: { name: string; foods: MealTemplate["foods"] },
  ) {
    const trimmedName = next.name.trim();
    if (!trimmedName) {
      setRenaming(null);
      return;
    }
    const updated: MealTemplate = {
      ...t,
      name: trimmedName,
      foods: next.foods,
      updatedAt: Date.now(),
    };
    // Optimistic update — the local saver bumps localUpdatedAt under
    // the hood so the next sync picks the row up as dirty.
    setTemplates((prev) =>
      prev ? prev.map((row) => (row.id === t.id ? updated : row)) : prev,
    );
    try {
      await upsertMealTemplate(updated);
      bumpPending();
    } catch (err) {
      reportStorageError(err);
      // Revert on failure.
      setTemplates((prev) =>
        prev ? prev.map((row) => (row.id === t.id ? t : row)) : prev,
      );
    } finally {
      setRenaming(null);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">
            Meal Templates
          </h2>
          <p className="text-xs text-muted-foreground">
            Saved bundles of foods you can apply to any meal slot from the
            planner. Create new ones with &ldquo;Save as template&rdquo; on a
            meal slot.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="pl-9"
          />
        </div>
        <SortControl
          modes={["recent", "name", "custom"]}
          active={sortMode}
          onChange={setSortMode}
        />
      </div>

      {templates === null ? (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 px-4 py-10 text-center">
          <LayoutGrid className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-sm text-muted-foreground">
            {templates.length === 0
              ? "No templates yet. Build a meal in the planner and tap “Save as template” to capture it."
              : "No templates match your search."}
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => void handleDragEnd(e)}
        >
          <SortableContext
            items={filtered.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="divide-y divide-border/60 rounded-md border border-border/60 bg-card">
              {filtered.map((t) => {
                const totals = totalsOf(t);
                const isExpanded = expanded.has(t.id);
                return (
                  <SortableTemplateRow
                    key={t.id}
                    template={t}
                    totals={totals}
                    isExpanded={isExpanded}
                    draggable={sortMode === "custom"}
                    onToggleExpand={() => toggleExpand(t.id)}
                    onRename={() => setRenaming(t)}
                    onDelete={() => handleDelete(t)}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {renaming && (
        <TemplateEditDialog
          open
          onOpenChange={(o) => {
            if (!o) setRenaming(null);
          }}
          initialName={renaming.name}
          initialFoods={renaming.foods}
          onSave={(next) => handleSaveEdit(renaming, next)}
        />
      )}
    </div>
  );
}

function totalsOf(t: MealTemplate) {
  return t.foods.reduce(
    (acc, f) => ({
      protein: acc.protein + f.protein,
      carbs: acc.carbs + f.carbs,
      fat: acc.fat + f.fat,
      calories: acc.calories + f.calories,
    }),
    { protein: 0, carbs: 0, fat: 0, calories: 0 },
  );
}

function SortableTemplateRow({
  template,
  totals,
  isExpanded,
  draggable,
  onToggleExpand,
  onRename,
  onDelete,
}: {
  template: MealTemplate;
  totals: { protein: number; carbs: number; fat: number; calories: number };
  isExpanded: boolean;
  draggable: boolean;
  onToggleExpand: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { setNodeRef, style, handleProps } = useSortableRow(
    template.id,
    !draggable,
  );
  return (
    <li
      ref={setNodeRef as React.Ref<HTMLLIElement>}
      style={style}
      className="px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        {draggable && (
          <button
            type="button"
            {...handleProps}
            className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label={`Drag to reorder ${template.name}`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
          aria-label={
            isExpanded ? "Collapse ingredients" : "Expand ingredients"
          }
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{template.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
            <span>
              {template.foods.length} food
              {template.foods.length === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>{Math.round(totals.calories)} kcal</span>
            <span>·</span>
            <span>P{Math.round(totals.protein)}</span>
            <span>·</span>
            <span>C{Math.round(totals.carbs)}</span>
            <span>·</span>
            <span>F{Math.round(totals.fat)}</span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onRename}
          title="Rename"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {isExpanded && (
        <ul className="ml-9 mt-2 space-y-1 border-l border-border/60 pl-3 text-xs">
          {template.foods.length === 0 ? (
            <li className="text-muted-foreground">
              (empty template — no foods)
            </li>
          ) : (
            template.foods.map((f) => (
              <li
                key={f.id}
                className="flex items-baseline gap-2"
              >
                <span className="flex-1 truncate">{f.name}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {f.portionSize ?? 100} g · {Math.round(f.calories)} kcal
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </li>
  );
}
