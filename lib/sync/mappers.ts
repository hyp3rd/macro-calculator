/** Pure shape conversion between the local IDB types and the Supabase row
 * shapes. The local types use camelCase + epoch ms; Postgres uses
 * snake_case + ISO timestamps. We keep these as plain functions so they
 * can be unit-tested without spinning up Supabase. */
import type { Meal, PersonalInfo } from "@/components/macro/types";
import type { CustomFood, DailyLog, MealTemplate, WeightEntry } from "@/lib/db";

// ─── Profile ───────────────────────────────────────────────────────────────

export type ProfileRow = {
  user_id: string;
  payload: PersonalInfo;
  updated_at: string;
};

export function profileToRow(
  userId: string,
  profile: PersonalInfo,
): Pick<ProfileRow, "user_id" | "payload"> {
  return { user_id: userId, payload: profile };
}

export function profileFromRow(row: ProfileRow): PersonalInfo {
  return row.payload;
}

// ─── Daily logs ────────────────────────────────────────────────────────────

export type DailyLogRow = {
  user_id: string;
  date: string;
  meals: Meal[];
  updated_at: string;
};

export function dailyLogToRow(
  userId: string,
  log: DailyLog,
): Pick<DailyLogRow, "user_id" | "date" | "meals"> {
  return { user_id: userId, date: log.date, meals: log.meals };
}

export function dailyLogFromRow(row: DailyLogRow): DailyLog {
  return {
    date: row.date,
    meals: row.meals,
    updatedAt: Date.parse(row.updated_at),
  };
}

// ─── Weight history ────────────────────────────────────────────────────────

export type WeightRow = {
  user_id: string;
  date: string;
  kg: number;
  recorded_at: string;
  updated_at: string;
};

export function weightToRow(
  userId: string,
  entry: WeightEntry,
): Pick<WeightRow, "user_id" | "date" | "kg" | "recorded_at"> {
  return {
    user_id: userId,
    date: entry.date,
    kg: entry.kg,
    recorded_at: new Date(entry.recordedAt).toISOString(),
  };
}

export function weightFromRow(row: WeightRow): WeightEntry {
  return {
    date: row.date,
    kg: row.kg,
    recordedAt: Date.parse(row.recorded_at),
  };
}

// ─── Custom foods ──────────────────────────────────────────────────────────

export type CustomFoodRow = {
  id: string;
  user_id: string;
  name: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  brand: string | null;
  category: string | null;
  sub_category: string | null;
  created_at: string;
  updated_at: string;
};

export function customFoodToRow(
  userId: string,
  food: CustomFood,
): Omit<CustomFoodRow, "updated_at"> {
  return {
    id: food.id,
    user_id: userId,
    name: food.name,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    calories: food.calories,
    brand: food.brand ?? null,
    category: food.category ?? null,
    sub_category: food.subCategory ?? null,
    created_at: new Date(food.createdAt).toISOString(),
  };
}

export function customFoodFromRow(row: CustomFoodRow): CustomFood {
  return {
    id: row.id,
    name: row.name,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    calories: row.calories,
    brand: row.brand ?? undefined,
    category: row.category ?? undefined,
    subCategory: row.sub_category ?? undefined,
    createdAt: Date.parse(row.created_at),
  };
}

// ─── Meal templates ────────────────────────────────────────────────────────

export type MealTemplateRow = {
  id: string;
  user_id: string;
  name: string;
  foods: MealTemplate["foods"];
  created_at: string;
  updated_at: string;
};

export function mealTemplateToRow(
  userId: string,
  template: MealTemplate,
): Omit<MealTemplateRow, "updated_at"> {
  return {
    id: template.id,
    user_id: userId,
    name: template.name,
    foods: template.foods,
    created_at: new Date(template.createdAt).toISOString(),
  };
}

export function mealTemplateFromRow(row: MealTemplateRow): MealTemplate {
  return {
    id: row.id,
    name: row.name,
    foods: row.foods,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}
