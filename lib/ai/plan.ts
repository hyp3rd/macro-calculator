import type { Food, FoodItem, Meal } from "@/components/macro/types";

/** The AI returns a list of meal slots with food picks identified by name +
 * portion in grams. Macros are computed server-side from the catalog so the
 * AI can't hallucinate nutrient values — it only picks foods and sizes. */
export type AiMealPick = { name: string; portionGrams: number };
export type AiMealSlot = { name: string; foods: AiMealPick[] };
export type AiPlanShape = { meals: AiMealSlot[] };

const PORTION_MIN = 5;
const PORTION_MAX = 500;
const PORTION_SNAP = 5;

function clampPortion(grams: number): number {
  if (!Number.isFinite(grams)) return PORTION_MIN;
  const snapped = Math.round(grams / PORTION_SNAP) * PORTION_SNAP;
  return Math.max(PORTION_MIN, Math.min(PORTION_MAX, snapped));
}

function buildFoodItem(food: Food, grams: number, id: number): FoodItem {
  const ratio = grams / 100;
  return {
    id,
    name: food.name,
    protein: Number.parseFloat((food.protein * ratio).toFixed(1)),
    carbs: Number.parseFloat((food.carbs * ratio).toFixed(1)),
    fat: Number.parseFloat((food.fat * ratio).toFixed(1)),
    calories: Math.round(food.calories * ratio),
    portionSize: grams,
    originalValues: {
      proteinPer100g: food.protein,
      carbsPer100g: food.carbs,
      fatPer100g: food.fat,
      caloriesPer100g: food.calories,
    },
  };
}

/** Convert an AI plan into the local `Meal[]` shape used by the meal-plan
 * view. Picks whose `name` doesn't exactly match a catalog entry (case-
 * insensitive) are silently dropped — we never invent macros for foods the
 * AI hallucinated. Portions are clamped + snapped to the same grid the
 * deterministic planner uses. */
export function aiPlanToMeals(
  aiPlan: AiPlanShape,
  mealNames: string[],
  catalog: Food[],
  startId: number = Date.now(),
): Meal[] {
  const byName = new Map<string, Food>();
  for (const f of catalog) byName.set(f.name.toLowerCase().trim(), f);

  let nextId = startId;
  return mealNames.map((slotName, idx) => {
    const aiMeal =
      aiPlan.meals.find(
        (m) => m.name.toLowerCase().trim() === slotName.toLowerCase().trim(),
      ) ?? aiPlan.meals[idx];

    const foods: FoodItem[] = [];
    if (aiMeal) {
      for (const pick of aiMeal.foods) {
        const food = byName.get(pick.name.toLowerCase().trim());
        if (!food) continue;
        foods.push(
          buildFoodItem(food, clampPortion(pick.portionGrams), nextId++),
        );
      }
    }
    return { id: idx + 1, name: slotName, foods };
  });
}
