import { Edit2, Search, Trash2 } from 'lucide-react';
import React from 'react';
import { Food, FoodItem as FoodItemType } from '../../components/macro/types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface FoodItemProps {
  food: FoodItemType;
  mealId: number;
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

const FoodItem: React.FC<FoodItemProps> = ({
  food,
  mealId,
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
  const isEditing = editingFood.foodId === food.id;
  const isReplacing = replacingFood.foodId === food.id;

  return (
    <tr className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
      <td className="px-4 py-3 whitespace-nowrap">
        {isReplacing ? (
          <div className="relative" ref={replacementSuggestionsRef}>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                value={replacingFood.searchTerm}
                onChange={handleReplacementSearch}
                className="pl-10 py-1 h-9 bg-gray-50 border-gray-200"
                placeholder="Search for food..."
                autoFocus
              />
            </div>
            {replacingFood.showSuggestions && replacingFood.suggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg max-h-60 overflow-auto border border-gray-200">
                <ul className="py-1">
                  {replacingFood.suggestions.map((suggestion, index) => (
                    <li
                      key={index}
                      className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm transition-colors"
                      onClick={() => replaceFood(suggestion)}
                    >
                      {suggestion.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          food.name
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {isEditing ? (
          <div className="flex items-center justify-center">
            <Input
              type="number"
              value={editingFood.portionSize}
              onChange={handleEditPortionChange}
              className="w-20 py-1 h-9 text-center bg-gray-50 border-gray-200"
              min="1"
              max="1000"
            />
          </div>
        ) : (
          food.portionSize || "-"
        )}
      </td>
      <td className="px-4 py-3 text-center font-medium text-teal-600">{food.protein}g</td>
      <td className="px-4 py-3 text-center font-medium text-violet-600">{food.carbs}g</td>
      <td className="px-4 py-3 text-center font-medium text-rose-600">{food.fat}g</td>
      <td className="px-4 py-3 text-center font-medium text-gray-700">{food.calories}</td>
      <td className="px-4 py-3 text-right">
        {isEditing ? (
          <div className="flex items-center justify-end space-x-2">
            <Button
              onClick={saveEditedPortion}
              variant="ghost"
              size="sm"
              className="h-8 text-teal-600 hover:text-teal-700 hover:bg-teal-50"
            >
              Save
            </Button>
            <Button
              onClick={cancelEditing}
              variant="ghost"
              size="sm"
              className="h-8 text-gray-600 hover:text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Button>
          </div>
        ) : isReplacing ? (
          <Button
            onClick={cancelReplacing}
            variant="ghost"
            size="sm"
            className="h-8 text-gray-600 hover:text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Button>
        ) : (
          <div className="flex items-center justify-end space-x-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => startReplacingFood(mealId, food)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Replace food</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => startEditingFood(mealId, food)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Edit portion</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => removeFood(mealId, food.id)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Remove food</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </td>
    </tr>
  );
};

export default FoodItem;