import React from 'react';
import { CalculatedValues, TotalMacros } from '../../components/macro/types';
import { Card, CardContent } from '../ui/card';
import { Progress } from '../ui/progress';

interface DailyTotalsProps {
  calculatedValues: CalculatedValues;
  totalMacros: TotalMacros;
}

const DailyTotals: React.FC<DailyTotalsProps> = ({
  calculatedValues,
  totalMacros
}) => {
  // Calculate percentage of target macros reached
  const calculatePercentage = (current: number, target: number) => {
    if (target === 0) return 0;
    return Math.min(Math.round((current / target) * 100), 100);
  };

  return (
    <div className="w-full">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">Daily Totals</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="macro-card border border-teal-200 bg-teal-50 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-gray-500 mb-1">Protein</p>
            <p className="text-2xl font-bold text-teal-600">{totalMacros.protein}g</p>
            <p className="text-xs text-gray-400 mb-2">Target: {calculatedValues.protein}g</p>
            <Progress
              value={calculatePercentage(totalMacros.protein, calculatedValues.protein)}
              className="h-1.5 bg-teal-100"
              indicatorClassName="bg-teal-500"
            />
          </CardContent>
        </Card>
        <Card className="macro-card border border-violet-200 bg-violet-50 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-gray-500 mb-1">Carbs</p>
            <p className="text-2xl font-bold text-violet-600">{totalMacros.carbs}g</p>
            <p className="text-xs text-gray-400 mb-2">Target: {calculatedValues.carbs}g</p>
            <Progress
              value={calculatePercentage(totalMacros.carbs, calculatedValues.carbs)}
              className="h-1.5 bg-violet-100"
              indicatorClassName="bg-violet-500"
            />
          </CardContent>
        </Card>
        <Card className="macro-card border border-rose-200 bg-rose-50 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-gray-500 mb-1">Fat</p>
            <p className="text-2xl font-bold text-rose-600">{totalMacros.fat}g</p>
            <p className="text-xs text-gray-400 mb-2">Target: {calculatedValues.fat}g</p>
            <Progress
              value={calculatePercentage(totalMacros.fat, calculatedValues.fat)}
              className="h-1.5 bg-rose-100"
              indicatorClassName="bg-rose-500"
            />
          </CardContent>
        </Card>
        <Card className="macro-card border border-gray-200 bg-gray-50 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-gray-500 mb-1">Calories</p>
            <p className="text-2xl font-bold text-gray-700">{totalMacros.calories}</p>
            <p className="text-xs text-gray-400 mb-2">Target: {calculatedValues.targetCalories}</p>
            <Progress
              value={calculatePercentage(totalMacros.calories, calculatedValues.targetCalories)}
              className="h-1.5 bg-gray-100"
              indicatorClassName="bg-gray-500"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DailyTotals;