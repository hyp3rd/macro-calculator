import { RefreshCw } from 'lucide-react';
import React from 'react';
import { CalculatedValues, Food, FoodItem, Meal } from '../../components/macro/types';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import AddFoodForm from './AddFoodForm';
import DailyTotals from './DailyTotals';
import MealItem from './MealItem';

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
}

const MealPlanner: React.FC<MealPlannerProps> = ({
  calculatedValues,
  totalMacros,
  meals,
  newFood,
  foodSearch,
  foodSuggestions,
  showSuggestions,
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
  generateMealPlan
}) => {
  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Add Food Form */}
      <AddFoodForm
        meals={meals}
        newFood={newFood}
        foodSearch={foodSearch}
        foodSuggestions={foodSuggestions}
        showSuggestions={showSuggestions}
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
      />

      {/* Meal Plan */}
      <Card className="border-none shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-violet-50 to-rose-50 rounded-t-xl">
          <div>
            <CardTitle className="text-2xl">Meal Plan</CardTitle>
            <CardDescription>Track your daily meals and macros</CardDescription>
          </div>
          <Button
            onClick={generateMealPlan}
            disabled={isGeneratingMealPlan}
            variant="outline"
            className="ml-auto bg-white hover:bg-gray-50"
          >
            {isGeneratingMealPlan ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate Meal Plan
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          {mealPlanMessage && (
            <div
              className={`mb-6 p-4 rounded-xl text-center ${mealPlanMessage.includes("Error") ? "bg-red-50 text-red-600 border border-red-200" : "bg-teal-50 text-teal-600 border border-teal-200"}`}
            >
              {mealPlanMessage}
            </div>
          )}

          <div className="space-y-8">
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
              />
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col">
          <Separator className="mb-6" />
          <DailyTotals
            calculatedValues={calculatedValues}
            totalMacros={totalMacros}
          />
        </CardFooter>
      </Card>
    </div>
  );
};

export default MealPlanner;