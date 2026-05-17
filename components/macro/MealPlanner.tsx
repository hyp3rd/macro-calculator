"use client";

import { REFINERS } from "@/lib/ai/refiners";
import React from "react";
import { GripVertical, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  CalculatedValues,
  Food,
  FoodItem,
  MacroBreakdown,
  Meal,
} from "../../components/macro/types";
import { DateNavigator } from "../shell/DateNavigator";
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
  /** Optional sub-macro totals (sugars / fiber / fat subtypes). Only
   *  keys actually contributed by today's foods are populated; the
   *  display layer hides rows for unknown values. */
  macroBreakdown: MacroBreakdown;
  meals: Meal[];
  selectedDate: string;
  today: string;
  onSelectDate: (date: string) => void;
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
  suggestionsRef: React.RefObject<HTMLDivElement | null>;
  replacementSuggestionsRef: React.RefObject<HTMLDivElement | null>;
  setNewFood: (food: FoodItem) => void;
  setFoodSearch: (value: string) => void;
  handleFoodSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFoodSelect: (food: Food) => void;
  handlePortionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFoodChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  addFood: () => void;
  removeFood: (mealId: number, foodId: number) => void;
  moveFood: (
    srcMealId: number,
    destMealId: number,
    foodId: number,
    destIndex?: number,
  ) => void;
  startEditingFood: (mealId: number, food: FoodItem) => void;
  cancelEditing: () => void;
  handleEditPortionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  saveEditedPortion: () => void;
  startReplacingFood: (mealId: number, food: FoodItem) => void;
  cancelReplacing: () => void;
  handleReplacementSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  replaceFood: (newFood: Food) => void;
  generateMealPlan: () => Promise<void>;
  /** Apply a one-shot refinement to the current meal plan (sourced
   *  from a refiner pill like "lower sugars"). The parent calls
   *  /api/meal-plan with `refinement` + `previousMeals` and replaces
   *  `meals` on success. Reuses the same `isGeneratingMealPlan` busy
   *  state — only one AI request runs at a time. */
  onRefineMealPlan: (refinement: string) => Promise<void>;
  /** Regenerate ONLY one meal slot — fires the AI route with
   *  `targetMealName` set. The parent finds the returned meal by name
   *  and swaps it into the matching slot, leaving the others alone.
   *  Shares the `isGeneratingMealPlan` busy state. */
  onRegenerateMeal: (mealId: number) => Promise<void>;
  setPortionSize: (size: number) => void;
  onSaveOffToCustom: (food: Food) => void;
  onOpenCustomFoodForm: () => void;
  onOpenCamera: () => void;
  onSaveAsTemplate: (mealId: number) => void;
  onAddFromTemplate: (mealId: number) => void;
  onApplyRecipe: (mealId: number) => void;
}

const MealPlanner: React.FC<MealPlannerProps> = ({
  calculatedValues,
  totalMacros,
  macroBreakdown,
  meals,
  selectedDate,
  today,
  onSelectDate,
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
  moveFood,
  startEditingFood,
  cancelEditing,
  handleEditPortionChange,
  saveEditedPortion,
  startReplacingFood,
  cancelReplacing,
  handleReplacementSearch,
  replaceFood,
  generateMealPlan,
  onRefineMealPlan,
  onRegenerateMeal,
  onSaveOffToCustom,
  onOpenCustomFoodForm,
  onOpenCamera,
  onSaveAsTemplate,
  onAddFromTemplate,
  onApplyRecipe,
}) => {
  const isError = mealPlanMessage.toLowerCase().includes("error");
  const dayIsEmpty = meals.every((m) => m.foods.length === 0);

  // PointerSensor with an 8px activation distance so single clicks on
  // the grip don't get interpreted as drags. KeyboardSensor wires Space
  // + arrow keys for accessibility (the same affordance for non-mouse
  // users).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Track the currently-dragged food so `DragOverlay` can render a clone
  // in a portal — without it the dragged row vanishes the moment the
  // cursor leaves its meal's overflow-clipped table container.
  const [activeFood, setActiveFood] = React.useState<{
    mealId: number;
    foodId: number;
  } | null>(null);
  const activeFoodItem =
    activeFood &&
    meals
      .find((m) => m.id === activeFood.mealId)
      ?.foods.find((f) => f.id === activeFood.foodId);

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { mealId: number; foodId: number }
      | undefined;
    if (data) setActiveFood(data);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveFood(null);
    const { active, over } = event;
    if (!over) return;
    const src = active.data.current as
      | { mealId: number; foodId: number }
      | undefined;
    if (!src) return;

    // The drop target is either another food row (id `mealId:foodId`)
    // or a meal-level droppable (id `meal-${mealId}`, fires when the
    // meal has zero items or you drop in the empty space around them).
    const over_ = over.data.current as
      | { mealId: number; foodId?: number; type?: string }
      | undefined;
    const destMealId = over_?.mealId ?? src.mealId;

    let destIndex: number | undefined;
    if (over_?.foodId !== undefined) {
      const destMeal = meals.find((m) => m.id === destMealId);
      destIndex = destMeal?.foods.findIndex((f) => f.id === over_.foodId);
      if (destIndex === -1) destIndex = undefined;
    }
    moveFood(src.mealId, destMealId, src.foodId, destIndex);
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <div className="px-5 py-4">
          <DailyTotals
            calculatedValues={calculatedValues}
            totalMacros={totalMacros}
            breakdown={macroBreakdown}
          />
        </div>
      </section>

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
        onOpenCamera={onOpenCamera}
      />

      <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <header className="flex flex-col gap-3 border-b border-border/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <DateNavigator
            date={selectedDate}
            today={today}
            onSelect={onSelectDate}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generateMealPlan}
            disabled={isGeneratingMealPlan}
            className="h-8 gap-2 self-end sm:self-auto"
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
              className={`overflow-hidden whitespace-pre-line border-b border-border/60 px-5 py-2.5 text-xs ${
                isError
                  ? "text-rose-700 dark:text-rose-400"
                  : "text-muted-foreground"
              }`}
            >
              {mealPlanMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Refiner pills — only rendered when there's at least one food
            anywhere in the day's meals (no point asking the AI to
            "lower the sugars" of an empty plan). Each pill is a single
            tap; the busy state is shared with the Auto-fill button via
            `isGeneratingMealPlan`. */}
        {!dayIsEmpty && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 bg-muted/20 px-5 py-2.5">
            <span className="mr-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Refine
            </span>
            {REFINERS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  void onRefineMealPlan(r.text);
                }}
                disabled={isGeneratingMealPlan}
                className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                title={r.text}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {dayIsEmpty && (
          <div className="border-b border-border/60 bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              No meals logged for this day.
            </span>{" "}
            Use the search above to add foods to any meal, apply a saved
            template from a meal&apos;s menu, or hit{" "}
            <span className="font-medium text-foreground">Auto-fill</span> to
            generate a plan that matches your macros.
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveFood(null)}
        >
          <DragOverlay dropAnimation={null}>
            {activeFoodItem ? (
              <div className="pointer-events-none flex items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 shadow-lg ring-1 ring-foreground/5">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {activeFoodItem.name}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {activeFoodItem.portionSize
                    ? `${activeFoodItem.portionSize} g · `
                    : ""}
                  {activeFoodItem.calories} kcal
                </span>
              </div>
            ) : null}
          </DragOverlay>

          <div className="divide-y divide-border/60">
            {meals.map((meal) => (
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
                onSaveAsTemplate={onSaveAsTemplate}
                onAddFromTemplate={onAddFromTemplate}
                onApplyRecipe={onApplyRecipe}
                onRegenerate={onRegenerateMeal}
                regenerating={isGeneratingMealPlan}
              />
            ))}
          </div>
        </DndContext>
      </section>
    </div>
  );
};

export default MealPlanner;
