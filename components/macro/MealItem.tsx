"use client";

import React from "react";
import { BookmarkPlus, ChefHat, MoreHorizontal, Plus } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  Food,
  FoodItem as FoodItemType,
  Meal as MealType,
} from "../../components/macro/types";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import FoodItem from "./FoodItem";

interface MealItemProps {
  meal: MealType;
  editingFood: {
    mealId: number | null;
    foodId: number | null;
    portionSize: number;
    originalFood: FoodItemType | null;
  };
  replacingFood: {
    mealId: number | null;
    foodId: number | null;
    portionSize: number;
    searchTerm: string;
    suggestions: Food[];
    showSuggestions: boolean;
  };
  replacementSuggestionsRef: React.RefObject<HTMLDivElement | null>;
  startEditingFood: (mealId: number, food: FoodItemType) => void;
  cancelEditing: () => void;
  handleEditPortionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  saveEditedPortion: () => void;
  startReplacingFood: (mealId: number, food: FoodItemType) => void;
  cancelReplacing: () => void;
  handleReplacementSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  replaceFood: (newFood: Food) => void;
  removeFood: (mealId: number, foodId: number) => void;
  onSaveAsTemplate: (mealId: number) => void;
  onAddFromTemplate: (mealId: number) => void;
  onApplyRecipe: (mealId: number) => void;
}

const MealItem: React.FC<MealItemProps> = ({
  meal,
  editingFood,
  replacingFood,
  replacementSuggestionsRef,
  startEditingFood,
  cancelEditing,
  handleEditPortionChange,
  saveEditedPortion,
  startReplacingFood,
  cancelReplacing,
  handleReplacementSearch,
  replaceFood,
  removeFood,
  onSaveAsTemplate,
  onAddFromTemplate,
  onApplyRecipe,
}) => {
  const totalProtein = Math.round(
    meal.foods.reduce((s, f) => s + f.protein, 0),
  );
  const totalCarbs = Math.round(meal.foods.reduce((s, f) => s + f.carbs, 0));
  const totalFat = Math.round(meal.foods.reduce((s, f) => s + f.fat, 0));
  const totalCalories = Math.round(
    meal.foods.reduce((s, f) => s + f.calories, 0),
  );

  // Stable per-row ids matching FoodItem's `${mealId}:${food.id}`. dnd-kit
  // needs to see each meal as its own sortable container so cross-meal
  // drops work via the meal-level `data.mealId`.
  const sortableIds = meal.foods.map((f) => `${meal.id}:${f.id}`);
  // Droppable so an empty meal (no sortable items) can still receive a
  // drop. The id is the meal block; the data tells onDragEnd where it
  // landed.
  const { setNodeRef, isOver } = useDroppable({
    id: `meal-${meal.id}`,
    data: { mealId: meal.id, type: "meal" },
  });

  return (
    <div
      ref={setNodeRef}
      className={`px-5 py-4 transition-colors ${isOver ? "bg-accent/40" : ""}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold tracking-tight text-foreground">
          {meal.name}
        </h4>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {totalCalories} kcal · P{totalProtein} · C{totalCarbs} · F{totalFat}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                aria-label={`${meal.name} actions`}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44"
            >
              <DropdownMenuItem
                onClick={() => onAddFromTemplate(meal.id)}
                className="gap-2"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                Add from template
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onApplyRecipe(meal.id)}
                className="gap-2"
              >
                <ChefHat className="h-3.5 w-3.5 text-muted-foreground" />
                Apply recipe
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onSaveAsTemplate(meal.id)}
                disabled={meal.foods.length === 0}
                className="gap-2"
              >
                <BookmarkPlus className="h-3.5 w-3.5 text-muted-foreground" />
                Save as template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {meal.foods.length === 0 ? (
        <p
          className={`rounded-md border border-dashed px-4 py-3 text-center text-xs text-muted-foreground ${
            isOver ? "border-foreground/40" : "border-border/60"
          }`}
        >
          {isOver ? "Drop here" : "No foods added yet"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <th
                  className="w-8 px-1 py-2"
                  aria-hidden
                />
                <th className="px-3 py-2 text-left">Food</th>
                <th className="px-3 py-2 text-center">Portion</th>
                <th className="px-3 py-2 text-center">P</th>
                <th className="px-3 py-2 text-center">C</th>
                <th className="px-3 py-2 text-center">F</th>
                <th className="px-3 py-2 text-center">kcal</th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              <tbody className="divide-y divide-border/60">
                {meal.foods.map((food) => (
                  <FoodItem
                    key={food.id}
                    food={food}
                    mealId={meal.id}
                    editingFood={editingFood}
                    replacingFood={replacingFood}
                    replacementSuggestionsRef={replacementSuggestionsRef}
                    startEditingFood={startEditingFood}
                    cancelEditing={cancelEditing}
                    handleEditPortionChange={handleEditPortionChange}
                    saveEditedPortion={saveEditedPortion}
                    startReplacingFood={startReplacingFood}
                    cancelReplacing={cancelReplacing}
                    handleReplacementSearch={handleReplacementSearch}
                    replaceFood={replaceFood}
                    removeFood={removeFood}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </div>
      )}
    </div>
  );
};

export default MealItem;
