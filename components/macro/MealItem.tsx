"use client";

import React from "react";
import {
  Food,
  FoodItem as FoodItemType,
  Meal as MealType,
} from "../../components/macro/types";
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
  replacementSuggestionsRef: React.RefObject<HTMLDivElement>;
  startEditingFood: (mealId: number, food: FoodItemType) => void;
  cancelEditing: () => void;
  handleEditPortionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  saveEditedPortion: () => void;
  startReplacingFood: (mealId: number, food: FoodItemType) => void;
  cancelReplacing: () => void;
  handleReplacementSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  replaceFood: (newFood: Food) => void;
  removeFood: (mealId: number, foodId: number) => void;
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
}) => {
  const totalProtein = Math.round(
    meal.foods.reduce((s, f) => s + f.protein, 0),
  );
  const totalCarbs = Math.round(meal.foods.reduce((s, f) => s + f.carbs, 0));
  const totalFat = Math.round(meal.foods.reduce((s, f) => s + f.fat, 0));
  const totalCalories = Math.round(
    meal.foods.reduce((s, f) => s + f.calories, 0),
  );

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h4 className="text-sm font-semibold tracking-tight text-foreground">
          {meal.name}
        </h4>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {totalCalories} kcal · P{totalProtein} · C{totalCarbs} · F{totalFat}
        </span>
      </div>

      {meal.foods.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 px-4 py-3 text-center text-xs text-muted-foreground">
          No foods added yet
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left">Food</th>
                <th className="px-3 py-2 text-center">Portion</th>
                <th className="px-3 py-2 text-center">P</th>
                <th className="px-3 py-2 text-center">C</th>
                <th className="px-3 py-2 text-center">F</th>
                <th className="px-3 py-2 text-center">kcal</th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
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
          </table>
        </div>
      )}
    </div>
  );
};

export default MealItem;
