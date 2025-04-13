import { Plus, Search } from 'lucide-react';
import React from 'react';
import { Food, FoodItem, Meal } from '../../components/macro/types';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface AddFoodFormProps {
  meals: Meal[];
  newFood: FoodItem;
  foodSearch: string;
  foodSuggestions: Food[];
  showSuggestions: boolean;
  portionSize: number;
  suggestionsRef: React.RefObject<HTMLDivElement>;
  setFoodSearch: (value: string) => void;
  setNewFood: (food: FoodItem) => void;
  setShowSuggestions: (show: boolean) => void;
  setPortionSize: (size: number) => void;
  handleFoodSearch: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFoodSelect: (food: Food) => void;
  handlePortionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFoodChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  addFood: () => void;
}

const AddFoodForm: React.FC<AddFoodFormProps> = ({
  meals,
  newFood,
  foodSearch,
  foodSuggestions,
  showSuggestions,
  portionSize,
  suggestionsRef,
  setNewFood,
  handleFoodSearch,
  handleFoodSelect,
  handlePortionChange,
  handleFoodChange,
  addFood
}) => {
  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="bg-gradient-to-r from-teal-50 to-violet-50 rounded-t-xl">
        <CardTitle className="text-2xl">Add Food</CardTitle>
        <CardDescription>Search for foods or enter custom nutrition values</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          <div className="lg:col-span-2">
            <Label htmlFor="foodSearch" className="text-gray-700">
              Food Name
            </Label>
            <div className="relative mt-1" ref={suggestionsRef}>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="foodSearch"
                  type="text"
                  value={foodSearch}
                  onChange={handleFoodSearch}
                  className="pl-10 bg-gray-50 border-gray-200"
                  placeholder="Search for a food..."
                />
              </div>
              {showSuggestions && foodSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg max-h-60 overflow-auto border border-gray-200">
                  <ul className="py-1">
                    {foodSuggestions.map((food, index) => (
                      <li
                        key={index}
                        className="px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => handleFoodSelect(food)}
                      >
                        {food.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="portionSize" className="text-gray-700">
              Portion (g)
            </Label>
            <Input
              id="portionSize"
              type="number"
              value={portionSize}
              onChange={handlePortionChange}
              className="mt-1 bg-gray-50 border-gray-200"
              min="0"
              step="1"
            />
          </div>

          <div>
            <Label htmlFor="protein" className="text-gray-700">
              Protein (g)
            </Label>
            <Input
              id="protein"
              name="protein"
              type="number"
              value={newFood.protein}
              onChange={handleFoodChange}
              className="mt-1 bg-gray-50 border-gray-200"
              min="0"
              step="0.1"
            />
          </div>

          <div>
            <Label htmlFor="carbs" className="text-gray-700">
              Carbs (g)
            </Label>
            <Input
              id="carbs"
              name="carbs"
              type="number"
              value={newFood.carbs}
              onChange={handleFoodChange}
              className="mt-1 bg-gray-50 border-gray-200"
              min="0"
              step="0.1"
            />
          </div>

          <div>
            <Label htmlFor="fat" className="text-gray-700">
              Fat (g)
            </Label>
            <Input
              id="fat"
              name="fat"
              type="number"
              value={newFood.fat}
              onChange={handleFoodChange}
              className="mt-1 bg-gray-50 border-gray-200"
              min="0"
              step="0.1"
            />
          </div>

          <div>
            <Label htmlFor="calories" className="text-gray-700">
              Calories
            </Label>
            <Input
              id="calories"
              name="calories"
              type="number"
              value={newFood.calories}
              onChange={handleFoodChange}
              className="mt-1 bg-gray-100 border-gray-200"
              readOnly
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-grow">
            <Label htmlFor="selectedMealId" className="text-gray-700">
              Add to Meal
            </Label>
            <Select
              value={newFood.selectedMealId?.toString() || ""}
              onValueChange={(value) => setNewFood({ ...newFood, selectedMealId: Number.parseInt(value) })}
            >
              <SelectTrigger className="mt-1 bg-gray-50 border-gray-200">
                <SelectValue placeholder="Select meal" />
              </SelectTrigger>
              <SelectContent>
                {meals.map((meal) => (
                  <SelectItem key={meal.id} value={meal.id.toString()}>
                    {meal.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button onClick={addFood} className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Food
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AddFoodForm;