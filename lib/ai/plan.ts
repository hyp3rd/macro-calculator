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

  // Defensive: the AI is *forced* into submit_meal_plan via tool_choice on
  // the last iteration, but it can still hand us a partial / malformed
  // input (missing `meals`, missing `foods`, non-array values). Treat any
  // shape oddity as "no picks" rather than crashing — empty meal slots
  // are far less alarming than a 500 from the route.
  const aiMeals = Array.isArray(aiPlan?.meals) ? aiPlan.meals : [];

  let nextId = startId;
  return mealNames.map((slotName, idx) => {
    const aiMeal =
      aiMeals.find(
        (m) =>
          typeof m?.name === "string" &&
          m.name.toLowerCase().trim() === slotName.toLowerCase().trim(),
      ) ?? aiMeals[idx];

    const foods: FoodItem[] = [];
    if (aiMeal && Array.isArray(aiMeal.foods)) {
      for (const pick of aiMeal.foods) {
        if (!pick || typeof pick.name !== "string") continue;
        const food = byName.get(pick.name.toLowerCase().trim());
        if (!food) continue;
        const grams =
          typeof pick.portionGrams === "number" ? pick.portionGrams : 100;
        foods.push(buildFoodItem(food, clampPortion(grams), nextId++));
      }
    }
    return { id: idx + 1, name: slotName, foods };
  });
}
