import type { PersonalInfo } from "@/components/macro/types";
import type { CustomFood, DailyLog, MealTemplate, WeightEntry } from "@/lib/db";
import { describe, expect, it } from "vitest";
import {
  customFoodFromRow,
  customFoodToRow,
  dailyLogFromRow,
  dailyLogToRow,
  mealTemplateFromRow,
  mealTemplateToRow,
  profileFromRow,
  profileToRow,
  weightFromRow,
  weightToRow,
} from "./mappers";

const USER = "11111111-1111-4111-8111-111111111111";

const PROFILE: PersonalInfo = {
  gender: "male",
  age: 30,
  weight: 70,
  height: 175,
  activityLevel: "moderate",
  goal: "maintain",
  dietType: "balanced",
  dietPreference: "omnivore",
  cuisinePreferences: [],
  allergies: [],
  dislikedFoods: [],
  weeklyRateKg: 0.5,
  manualTdee: null,
};

describe("profile mappers", () => {
  it("round-trips profile → row → profile", () => {
    const row = profileToRow(USER, PROFILE);
    expect(row.user_id).toBe(USER);
    expect(row.payload).toEqual(PROFILE);
    // Adding the updated_at the DB would assign…
    const fullRow = { ...row, updated_at: "2026-05-13T10:00:00Z" };
    expect(profileFromRow(fullRow)).toEqual(PROFILE);
  });

  it("preserves cuisinePreferences and allergies through the JSONB blob", () => {
    // Regression cover for the new fields: profile rows are stored as
    // JSONB so adding fields shouldn't require schema changes — but it
    // also means it's silently easy to drop a field if a mapper ever
    // gets explicit. Pin the round-trip.
    const profile: PersonalInfo = {
      ...PROFILE,
      cuisinePreferences: ["Italian", "Japanese", "Korean"],
      allergies: ["peanuts", "shellfish"],
    };
    const row = profileToRow(USER, profile);
    const back = profileFromRow({ ...row, updated_at: "2026-05-13T10:00:00Z" });
    expect(back.cuisinePreferences).toEqual(["Italian", "Japanese", "Korean"]);
    expect(back.allergies).toEqual(["peanuts", "shellfish"]);
  });

  it("preserves displayName, dislikedFoods, and macroSplit through the JSONB blob", () => {
    // The JSONB-passthrough mapper makes adding fields cheap, but the
    // round-trip is the only thing pinning that contract. If anyone ever
    // converts profileToRow/profileFromRow into an explicit field-by-field
    // mapper, this test fails first.
    const profile: PersonalInfo = {
      ...PROFILE,
      displayName: "Alex",
      dislikedFoods: ["oats", "broccoli"],
      macroSplit: { protein: 40, carbs: 35, fat: 25 },
    };
    const row = profileToRow(USER, profile);
    const back = profileFromRow({ ...row, updated_at: "2026-05-13T10:00:00Z" });
    expect(back.displayName).toBe("Alex");
    expect(back.dislikedFoods).toEqual(["oats", "broccoli"]);
    expect(back.macroSplit).toEqual({ protein: 40, carbs: 35, fat: 25 });
  });
});

describe("daily log mappers", () => {
  const LOG: DailyLog = {
    date: "2026-05-13",
    meals: [
      { id: 1, name: "Breakfast", foods: [] },
      { id: 2, name: "Lunch", foods: [] },
    ],
    updatedAt: Date.parse("2026-05-13T10:00:00Z"),
  };

  it("toRow strips updated_at (DB assigns it)", () => {
    const row = dailyLogToRow(USER, LOG);
    expect(row).toEqual({
      user_id: USER,
      date: "2026-05-13",
      meals: LOG.meals,
    });
  });

  it("fromRow parses ISO updated_at into epoch ms", () => {
    const log = dailyLogFromRow({
      user_id: USER,
      date: "2026-05-13",
      meals: LOG.meals,
      updated_at: "2026-05-13T10:00:00.000Z",
    });
    expect(log).toEqual(LOG);
  });
});

describe("weight mappers", () => {
  const ENTRY: WeightEntry = {
    date: "2026-05-13",
    kg: 70.5,
    recordedAt: Date.parse("2026-05-13T08:30:00Z"),
  };

  it("round-trips weight entry", () => {
    const row = weightToRow(USER, ENTRY);
    expect(row.kg).toBe(70.5);
    expect(row.recorded_at).toBe("2026-05-13T08:30:00.000Z");
    const back = weightFromRow({
      ...row,
      user_id: USER,
      updated_at: "2026-05-13T08:30:00.000Z",
    });
    expect(back).toEqual(ENTRY);
  });
});

describe("custom food mappers", () => {
  const FOOD: CustomFood = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Whey",
    protein: 80,
    carbs: 8,
    fat: 2,
    calories: 370,
    brand: "MyBrand",
    createdAt: Date.parse("2026-05-13T08:00:00Z"),
  };

  it("maps optional brand and category to null on the row side", () => {
    const minimal: CustomFood = {
      id: FOOD.id,
      name: "Minimal",
      protein: 1,
      carbs: 1,
      fat: 1,
      calories: 17,
      createdAt: Date.now(),
    };
    const row = customFoodToRow(USER, minimal);
    expect(row.brand).toBeNull();
    expect(row.category).toBeNull();
    expect(row.sub_category).toBeNull();
  });

  it("round-trips through the row shape", () => {
    const row = customFoodToRow(USER, FOOD);
    const back = customFoodFromRow({
      ...row,
      user_id: USER,
      updated_at: "2026-05-13T08:00:00.000Z",
    });
    expect(back).toEqual(FOOD);
  });

  it("fromRow restores undefined for null brand/category/dietKind", () => {
    const back = customFoodFromRow({
      id: FOOD.id,
      user_id: USER,
      name: "x",
      protein: 0,
      carbs: 0,
      fat: 0,
      calories: 0,
      brand: null,
      category: null,
      sub_category: null,
      diet_kind: null,
      created_at: "2026-05-13T08:00:00.000Z",
      updated_at: "2026-05-13T08:00:00.000Z",
    });
    expect(back.brand).toBeUndefined();
    expect(back.category).toBeUndefined();
    expect(back.subCategory).toBeUndefined();
    expect(back.dietKind).toBeUndefined();
  });

  it("fromRow round-trips a valid dietKind value", () => {
    const back = customFoodFromRow({
      id: FOOD.id,
      user_id: USER,
      name: "Tofu",
      protein: 8,
      carbs: 2,
      fat: 4,
      calories: 76,
      brand: null,
      category: null,
      sub_category: null,
      diet_kind: "plant",
      created_at: "2026-05-13T08:00:00.000Z",
      updated_at: "2026-05-13T08:00:00.000Z",
    });
    expect(back.dietKind).toBe("plant");
  });

  it("fromRow rejects unknown dietKind strings (treat as unclassified)", () => {
    const back = customFoodFromRow({
      id: FOOD.id,
      user_id: USER,
      name: "x",
      protein: 0,
      carbs: 0,
      fat: 0,
      calories: 0,
      brand: null,
      category: null,
      sub_category: null,
      diet_kind: "not-a-real-kind",
      created_at: "2026-05-13T08:00:00.000Z",
      updated_at: "2026-05-13T08:00:00.000Z",
    });
    expect(back.dietKind).toBeUndefined();
  });
});

describe("meal template mappers", () => {
  const TEMPLATE: MealTemplate = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Greek yogurt bowl",
    foods: [
      {
        id: 1,
        name: "Yogurt",
        protein: 10,
        carbs: 4,
        fat: 0,
        calories: 60,
        portionSize: 100,
      },
    ],
    createdAt: Date.parse("2026-05-13T08:00:00Z"),
    updatedAt: Date.parse("2026-05-13T09:00:00Z"),
  };

  it("round-trips template", () => {
    const row = mealTemplateToRow(USER, TEMPLATE);
    const back = mealTemplateFromRow({
      ...row,
      user_id: USER,
      updated_at: "2026-05-13T09:00:00.000Z",
    });
    expect(back).toEqual(TEMPLATE);
  });
});
