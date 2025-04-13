import React from 'react';
import { CalculatedValues, TotalMacros } from '../../components/macro/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';
import { Separator } from '../ui/separator';

interface MacroResultsProps {
  calculatedValues: CalculatedValues;
  totalMacros: TotalMacros;
}

const MacroResults: React.FC<MacroResultsProps> = ({
  calculatedValues,
  totalMacros
}) => {
  // Calculate percentage of target macros reached
  const calculatePercentage = (current: number, target: number) => {
    if (target === 0) return 0;
    return Math.min(Math.round((current / target) * 100), 100);
  };

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="bg-gradient-to-r from-violet-50 to-rose-50 rounded-t-xl">
        <CardTitle className="text-2xl">Your Daily Targets</CardTitle>
        <CardDescription>Based on your personal information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-3 p-4 bg-gray-50 rounded-xl">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Basal Metabolic Rate:</span>
            <span className="font-medium">{calculatedValues.bmr} calories</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total Daily Energy:</span>
            <span className="font-medium">{calculatedValues.tdee} calories</span>
          </div>
          <div className="flex justify-between text-base pt-1">
            <span className="font-medium">Target Calories:</span>
            <span className="font-bold text-teal-600">{calculatedValues.targetCalories} calories</span>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-3 gap-3">
          <div className="macro-card border border-teal-200 bg-teal-50 p-4 rounded-xl text-center">
            <p className="text-xs text-gray-500 mb-1">Protein</p>
            <p className="font-bold text-teal-600 text-xl">{calculatedValues.protein}g</p>
            <p className="text-xs text-gray-400">{calculatedValues.protein * 4} cal</p>
          </div>
          <div className="macro-card border border-violet-200 bg-violet-50 p-4 rounded-xl text-center">
            <p className="text-xs text-gray-500 mb-1">Carbs</p>
            <p className="font-bold text-violet-600 text-xl">{calculatedValues.carbs}g</p>
            <p className="text-xs text-gray-400">{calculatedValues.carbs * 4} cal</p>
          </div>
          <div className="macro-card border border-rose-200 bg-rose-50 p-4 rounded-xl text-center">
            <p className="text-xs text-gray-500 mb-1">Fat</p>
            <p className="font-bold text-rose-600 text-xl">{calculatedValues.fat}g</p>
            <p className="text-xs text-gray-400">{calculatedValues.fat * 9} cal</p>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700">Current Progress</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-teal-600 font-medium">Protein</span>
                <span>
                  {totalMacros.protein}g / {calculatedValues.protein}g
                </span>
              </div>
              <Progress
                value={calculatePercentage(totalMacros.protein, calculatedValues.protein)}
                className="h-2 bg-teal-100"
                indicatorClassName="bg-teal-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-violet-600 font-medium">Carbs</span>
                <span>
                  {totalMacros.carbs}g / {calculatedValues.carbs}g
                </span>
              </div>
              <Progress
                value={calculatePercentage(totalMacros.carbs, calculatedValues.carbs)}
                className="h-2 bg-violet-100"
                indicatorClassName="bg-violet-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-rose-600 font-medium">Fat</span>
                <span>
                  {totalMacros.fat}g / {calculatedValues.fat}g
                </span>
              </div>
              <Progress
                value={calculatePercentage(totalMacros.fat, calculatedValues.fat)}
                className="h-2 bg-rose-100"
                indicatorClassName="bg-rose-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700 font-medium">Calories</span>
                <span>
                  {totalMacros.calories} / {calculatedValues.targetCalories}
                </span>
              </div>
              <Progress
                value={calculatePercentage(totalMacros.calories, calculatedValues.targetCalories)}
                className="h-2 bg-gray-100"
                indicatorClassName="bg-gray-500"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MacroResults;