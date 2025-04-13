import React from 'react';
import { Food, FoodItem as FoodItemType, Meal as MealType } from '../../components/macro/types';
import { Badge } from '../ui/badge';
import FoodItem from './FoodItem';

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
  removeFood
}) => {
  const totalProtein = Math.round(meal.foods.reduce((sum, food) => sum + food.protein, 0));
  const totalCarbs = Math.round(meal.foods.reduce((sum, food) => sum + food.carbs, 0));
  const totalFat = Math.round(meal.foods.reduce((sum, food) => sum + food.fat, 0));
  const totalCalories = Math.round(meal.foods.reduce((sum, food) => sum + food.calories, 0));

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h3 className="text-xl font-semibold text-gray-800">{meal.name}</h3>
        <Badge variant="outline" className="ml-2 bg-gray-50">
          {totalCalories} cal
        </Badge>
      </div>

      {meal.foods.length === 0 ? (
        <div className="p-6 bg-gray-50 rounded-xl text-center">
          <p className="text-gray-500 italic">No foods added yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Food
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Portion (g)
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Protein
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Carbs
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fat
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Calories
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
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
              {meal.foods.length > 0 && (
                <tr className="bg-gray-50">
                  <td className="px-4 py-3 font-medium">Total</td>
                  <td className="px-4 py-3 text-center">
                    {/* Intentionally empty for Portion column */}
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-teal-600">
                    {totalProtein}g
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-violet-600">
                    {totalCarbs}g
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-rose-600">
                    {totalFat}g
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-gray-700">
                    {totalCalories}
                  </td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MealItem;