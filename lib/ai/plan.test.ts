import type { Food } from "@/components/macro/types";
import { describe, expect, it } from "vitest";
import { aiPlanToMeals, type AiPlanShape } from "./plan";

const catalog: Food[] = [
  { name: "Chicken Breast", protein: 31, carbs: 0, fat: 3.6, calories: 165 },
  { name: "Oats", protein: 13, carbs: 67, fat: 7, calories: 389 },
  { name: "Olive Oil", protein: 0, carbs: 0, fat: 100, calories: 884 },
];

describe("aiPlanToMeals", () => {
  it("matches AI picks back to the catalog and computes macros from the catalog", () => {
    const ai: AiPlanShape = {
      meals: [
        { name: "Breakfast", foods: [{ name: "Oats", portionGrams: 100 }] },
        {
          name: "Lunch",
          foods: [{ name: "Chicken Breast", portionGrams: 200 }],
        },
      ],
    };
    const meals = aiPlanToMeals(ai, ["Breakfast", "Lunch"], catalog, 1);
    expect(meals).toHaveLength(2);
    expect(meals[0].foods).toHaveLength(1);
    // Macros are computed from catalog × portion ratio, NOT from anything
    // the AI invented.
    expect(meals[0].foods[0].name).toBe("Oats");
    expect(meals[0].foods[0].portionSize).toBe(100);
    expect(meals[0].foods[0].protein).toBe(13);
    expect(meals[1].foods[0].name).toBe("Chicken Breast");
    expect(meals[1].foods[0].portionSize).toBe(200);
    expect(meals[1].foods[0].protein).toBe(62); // 31 × 2
    expect(meals[1].foods[0].calories).toBe(330); // 165 × 2
  });

  it("drops hallucinated foods (name not in catalog)", () => {
    const ai: AiPlanShape = {
      meals: [
        {
          name: "Breakfast",
          foods: [
            { name: "Oats", portionGrams: 80 },
            { name: "Unicorn Bacon", portionGrams: 100 }, // not in catalog
          ],
        },
      ],
    };
    const meals = aiPlanToMeals(ai, ["Breakfast"], catalog);
    expect(meals[0].foods).toHaveLength(1);
    expect(meals[0].foods[0].name).toBe("Oats");
  });

  it("matches food names case-insensitively and trims whitespace", () => {
    const ai: AiPlanShape = {
      meals: [
        { name: "Breakfast", foods: [{ name: "  oats  ", portionGrams: 50 }] },
      ],
    };
    const meals = aiPlanToMeals(ai, ["Breakfast"], catalog);
    expect(meals[0].foods).toHaveLength(1);
    expect(meals[0].foods[0].name).toBe("Oats");
  });

  it("clamps portions to [5, 500] g and snaps to 5g grid", () => {
    const ai: AiPlanShape = {
      meals: [
        {
          name: "Breakfast",
          foods: [
            { name: "Oats", portionGrams: 0 }, // → 5
            { name: "Olive Oil", portionGrams: 999 }, // → 500
            { name: "Chicken Breast", portionGrams: 122 }, // → 120 (snap)
          ],
        },
      ],
    };
    const meals = aiPlanToMeals(ai, ["Breakfast"], catalog);
    expect(meals[0].foods[0].portionSize).toBe(5);
    expect(meals[0].foods[1].portionSize).toBe(500);
    expect(meals[0].foods[2].portionSize).toBe(120);
  });

  it("matches meal slots by name first, falls back to positional", () => {
    // AI returns meals in a different order — still matched by name.
    const ai: AiPlanShape = {
      meals: [
        {
          name: "Lunch",
          foods: [{ name: "Chicken Breast", portionGrams: 150 }],
        },
        { name: "Breakfast", foods: [{ name: "Oats", portionGrams: 80 }] },
      ],
    };
    const meals = aiPlanToMeals(ai, ["Breakfast", "Lunch"], catalog);
    expect(meals[0].name).toBe("Breakfast");
    expect(meals[0].foods[0].name).toBe("Oats");
    expect(meals[1].name).toBe("Lunch");
    expect(meals[1].foods[0].name).toBe("Chicken Breast");
  });

  it("returns empty meals for slots the AI didn't fill", () => {
    const ai: AiPlanShape = {
      meals: [
        { name: "Breakfast", foods: [{ name: "Oats", portionGrams: 50 }] },
      ],
    };
    const meals = aiPlanToMeals(ai, ["Breakfast", "Dinner"], catalog);
    expect(meals[1].name).toBe("Dinner");
    expect(meals[1].foods).toHaveLength(0);
  });

  it("mints distinct ids starting from the given startId", () => {
    const ai: AiPlanShape = {
      meals: [
        {
          name: "Breakfast",
          foods: [
            { name: "Oats", portionGrams: 50 },
            { name: "Olive Oil", portionGrams: 10 },
          ],
        },
      ],
    };
    const meals = aiPlanToMeals(ai, ["Breakfast"], catalog, 100);
    expect(meals[0].foods[0].id).toBe(100);
    expect(meals[0].foods[1].id).toBe(101);
  });
});
