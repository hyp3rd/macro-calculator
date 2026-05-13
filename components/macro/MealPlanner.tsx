"use client";

import React from "react";
import { Loader2, RefreshCw, Utensils } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  CalculatedValues,
  Food,
  FoodItem,
  Meal,
} from "../../components/macro/types";
import { Button } from "../ui/button";
import AddFoodForm from "./AddFoodForm";
import DailyTotals from "./DailyTotals";
import MealItem from "./MealItem";

interface MealPlannerProps {
  calculatedValues: CalculatedValues;
  totalMacros: {
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
  };
  meals: Meal[];
  newFood: FoodItem;
  foodSearch: string;
  foodSuggestions: Food[];
  showSuggestions: boolean;
  isSearchingRemote: boolean;
  portionSize: number;
  isGeneratingMealPlan: boolean;
  mealPlanMessage: string;
  editingFood: {
    mealId: number | null;
    foodId: number | null;
    portionSize: number;
    originalFood: FoodItem | null;
  };
  replacingFood: {
    mealId: number | null;
    foodId: number | null;
    portionSize: number;
    searchTerm: string;
    suggestions: Food[];
    showSuggestions: boolean;
  };
  suggestionsRef: React.RefObject<HTMLDivElement>;
  replacementSuggestionsRef: React.RefObject<HTMLDivElement>;
  setNewFood: (food: FoodItem) => void;
  setFoodSearch: (value: string) => void;
  handleFoodSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFoodSelect: (food: Food) => void;
  handlePortionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFoodChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  addFood: () => void;
  removeFood: (mealId: number, foodId: number) => void;
  startEditingFood: (mealId: number, food: FoodItem) => void;
  cancelEditing: () => void;
  handleEditPortionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  saveEditedPortion: () => void;
  startReplacingFood: (mealId: number, food: FoodItem) => void;
  cancelReplacing: () => void;
  handleReplacementSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  replaceFood: (newFood: Food) => void;
  generateMealPlan: () => Promise<void>;
  setPortionSize: (size: number) => void;
  onSaveOffToCustom: (food: Food) => void;
  onOpenCustomFoodForm: () => void;
}

const MealPlanner: React.FC<MealPlannerProps> = ({
  calculatedValues,
  totalMacros,
  meals,
  newFood,
  foodSearch,
  foodSuggestions,
  showSuggestions,
  isSearchingRemote,
  portionSize,
  isGeneratingMealPlan,
  mealPlanMessage,
  editingFood,
  replacingFood,
  suggestionsRef,
  replacementSuggestionsRef,
  setNewFood,
  setFoodSearch,
  setPortionSize,
  handleFoodSearch,
  handleFoodSelect,
  handlePortionChange,
  handleFoodChange,
  addFood,
  removeFood,
  startEditingFood,
  cancelEditing,
  handleEditPortionChange,
  saveEditedPortion,
  startReplacingFood,
  cancelReplacing,
  handleReplacementSearch,
  replaceFood,
  generateMealPlan,
  onSaveOffToCustom,
  onOpenCustomFoodForm,
}) => {
  const hasAnyFoods = meals.some((m) => m.foods.length > 0);
  const isError = mealPlanMessage.toLowerCase().includes("error");

  return (
    <div className="space-y-6">
      <AddFoodForm
        meals={meals}
        newFood={newFood}
        foodSearch={foodSearch}
        foodSuggestions={foodSuggestions}
        showSuggestions={showSuggestions}
        isSearchingRemote={isSearchingRemote}
        portionSize={portionSize}
        suggestionsRef={suggestionsRef}
        setNewFood={setNewFood}
        handleFoodSearch={handleFoodSearch}
        handleFoodSelect={handleFoodSelect}
        handlePortionChange={handlePortionChange}
        handleFoodChange={handleFoodChange}
        addFood={addFood}
        setFoodSearch={setFoodSearch}
        setShowSuggestions={() => {}}
        setPortionSize={setPortionSize}
        onSaveOffToCustom={onSaveOffToCustom}
        onOpenCustomFoodForm={onOpenCustomFoodForm}
      />

      <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Today's Plan
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Build it manually, or auto-fill from your macros.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generateMealPlan}
            disabled={isGeneratingMealPlan}
            className="h-8 gap-2"
          >
            {isGeneratingMealPlan ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {isGeneratingMealPlan ? "Generating…" : "Auto-fill"}
          </Button>
        </header>

        <AnimatePresence>
          {mealPlanMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className={`overflow-hidden border-b border-border/60 px-5 py-2.5 text-xs ${
                isError
                  ? "text-rose-700 dark:text-rose-400"
                  : "text-muted-foreground"
              }`}
            >
              {mealPlanMessage}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="divide-y divide-border/60">
          {hasAnyFoods ? (
            meals.map((meal) => (
              <MealItem
                key={meal.id}
                meal={meal}
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
            ))
          ) : (
            <EmptyMealsState onGenerate={generateMealPlan} />
          )}
        </div>

        <div className="border-t border-border/60 bg-muted/30 px-5 py-4">
          <DailyTotals
            calculatedValues={calculatedValues}
            totalMacros={totalMacros}
          />
        </div>
      </section>
    </div>
  );
};

function EmptyMealsState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Utensils
          className="h-5 w-5 text-muted-foreground"
          aria-hidden
        />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No meals yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Search and add foods above, or let us auto-fill a day for you.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onGenerate}
      >
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        Auto-fill
      </Button>
    </div>
  );
}

export default MealPlanner;
