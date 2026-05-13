export type FoodSource = "builtin" | "custom" | "off";

export type Food = {
  /** Stable identifier across the three sources. Builtin derives from name,
   * custom uses the IndexedDB key, OFF uses the product barcode. */
  id?: string;
  source?: FoodSource;
  name: string;
  /** Macros are per 100g so portion sizing stays linear. */
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  category?: string;
  subCategory?: string;
  mealTypes?: string[];
  brand?: string;
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

export type Meal = { id: number; name: string; foods: FoodItem[] };

export type PersonalInfo = {
  gender: "male" | "female";
  age: number;
  weight: number;
  height: number;
  activityLevel: "sedentary" | "light" | "moderate" | "active" | "veryActive";
  goal: "lose" | "maintain" | "gain";
  dietType: "balanced" | "lowCarb" | "lowFat";
  /** Target weight change rate in kg/week. Sign-less; the `goal` field
   * determines whether it's a deficit or surplus. Ignored when goal is
   * "maintain". 1 kg fat ≈ 7700 kcal → daily delta ≈ rate × 1100. */
  weeklyRateKg: number;
  /** Optional measured TDEE override. When set (non-null and > 0), bypasses
   * the BMR × activity multiplier estimate. Use this when you've calibrated
   * against real-world weight change — formula-based TDEE estimates run
   * 10–20% high for many people. */
  manualTdee?: number | null;
};

export type CalculatedValues = {
  bmr: number;
  tdee: number;
  targetCalories: number;
  /** Per-day delta from TDEE. Negative = deficit, positive = surplus. */
  dailyDelta: number;
  /** Per-day delta that was *requested* before clamping to safety floor.
   * If `dailyDelta` !== `requestedDelta`, the UI should warn that the
   * deficit is being capped. */
  requestedDelta: number;
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
  veryActive: 1.9,
};

/** Calories per kg of body-weight change. ~7700 kcal/kg fat is the textbook
 * figure; recent research suggests 7000–7700 depending on body composition.
 * Use 7700 as a conservative default — it under-estimates loss, which is
 * safer than over-promising. */
export const KCAL_PER_KG = 7700;

/** Floor for daily calories. Going below BMR for sustained periods is
 * unsafe and unsustainable. We also floor at an absolute 1200 to catch
 * cases where BMR estimates run low. */
export const MIN_DAILY_KCAL = 1200;

/** Direction multiplier per goal. */
export const goalDirection: Record<PersonalInfo["goal"], -1 | 0 | 1> = {
  lose: -1,
  maintain: 0,
  gain: 1,
};
