export type Food = {
    name: string;
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
    category?: string;
    subCategory?: string;
    mealTypes: string[];
};

export type FoodItem = {
    id: number;
    name: string;
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
    portionSize: number;
    selectedMealId?: number;
    category?: string;
    subCategory?: string;
    originalValues?: {
        proteinPer100g: number;
        carbsPer100g: number;
        fatPer100g: number;
        caloriesPer100g: number;
    };
};

export type Meal = {
    id: number;
    name: string;
    foods: FoodItem[];
};

export type PersonalInfo = {
    gender: 'male' | 'female';
    age: number;
    weight: number;
    height: number;
    activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';
    goal: 'lose' | 'maintain' | 'gain';
    dietType: 'balanced' | 'lowCarb' | 'lowFat';
};

export type CalculatedValues = {
    bmr: number;
    tdee: number;
    targetCalories: number;
    protein: number;
    carbs: number;
    fat: number;
};

export type TotalMacros = {
    protein: number;
    carbs: number;
    fat: number;
    calories: number;
};

// Constants
export const activityMultipliers: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9
};

export const goalAdjustments: Record<string, number> = {
    lose: 0.8,
    maintain: 1.0,
    gain: 1.15
};