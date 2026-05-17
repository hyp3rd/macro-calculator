/** Pure shape conversion between the local IDB types and the Supabase row
 * shapes. The local types use camelCase + epoch ms; Postgres uses
 * snake_case + ISO timestamps. We keep these as plain functions so they
 * can be unit-tested without spinning up Supabase. */
import type {
  FoodKind,
  Meal,
  PersonalInfo,
  Recipe,
} from "@/components/macro/types";
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
  /** Nullable until the user classifies; client treats null as omnivore-only. */
  diet_kind: string | null;
  /** Manual drag-and-drop position. Optional + nullable because pre-v7
   *  rows from the server don't have the column, and rows the user
   *  hasn't dragged yet leave it null (the client falls back to
   *  createdAt order). */
  sort_order?: number | null;
  /** Macro-breakdown (sugars / fiber / fat-subtypes). All optional +
   *  nullable per the migration — pre-0008 rows don't have them; we
   *  treat undefined/null as "unknown" for display purposes. */
  sugars?: number | null;
  added_sugars?: number | null;
  fiber?: number | null;
  saturated_fat?: number | null;
  trans_fat?: number | null;
  mono_fat?: number | null;
  poly_fat?: number | null;
  created_at: string;
  updated_at: string;
};

/** The set of strings stored in `diet_kind`. Mirrors the FoodKind union;
 * keeping it here as a Set lets us validate values read back from Supabase
 * (e.g. a hand-edit in the dashboard) without trusting the row blindly. */
const FOOD_KIND_VALUES = new Set<FoodKind>([
  "land-meat",
  "seafood",
  "egg",
  "dairy",
  "honey",
  "plant",
]);

function parseDietKind(value: string | null): FoodKind | undefined {
  if (value && FOOD_KIND_VALUES.has(value as FoodKind))
    return value as FoodKind;
  return undefined;
}

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
    diet_kind: food.dietKind ?? null,
    sort_order: food.sortOrder ?? null,
    sugars: food.sugars ?? null,
    added_sugars: food.addedSugars ?? null,
    fiber: food.fiber ?? null,
    saturated_fat: food.saturatedFat ?? null,
    trans_fat: food.transFat ?? null,
    mono_fat: food.monoFat ?? null,
    poly_fat: food.polyFat ?? null,
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
    dietKind: parseDietKind(row.diet_kind),
    sortOrder: row.sort_order ?? undefined,
    sugars: row.sugars ?? undefined,
    addedSugars: row.added_sugars ?? undefined,
    fiber: row.fiber ?? undefined,
    saturatedFat: row.saturated_fat ?? undefined,
    transFat: row.trans_fat ?? undefined,
    monoFat: row.mono_fat ?? undefined,
    polyFat: row.poly_fat ?? undefined,
    createdAt: Date.parse(row.created_at),
  };
}

// ─── Meal templates ────────────────────────────────────────────────────────

export type MealTemplateRow = {
  id: string;
  user_id: string;
  name: string;
  foods: MealTemplate["foods"];
  sort_order?: number | null;
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
    sort_order: template.sortOrder ?? null,
    created_at: new Date(template.createdAt).toISOString(),
  };
}

export function mealTemplateFromRow(row: MealTemplateRow): MealTemplate {
  return {
    id: row.id,
    name: row.name,
    foods: row.foods,
    sortOrder: row.sort_order ?? undefined,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}

// ─── Recipes ───────────────────────────────────────────────────────────────

export type RecipeRow = {
  id: string;
  user_id: string;
  name: string;
  ingredients: Recipe["ingredients"];
  cuisine: string | null;
  notes: string | null;
  sort_order?: number | null;
  created_at: string;
  updated_at: string;
};

export function recipeToRow(
  userId: string,
  recipe: Recipe & { sortOrder?: number },
): Omit<RecipeRow, "updated_at"> {
  return {
    id: recipe.id,
    user_id: userId,
    name: recipe.name,
    ingredients: recipe.ingredients,
    cuisine: recipe.cuisine ?? null,
    notes: recipe.notes ?? null,
    sort_order: recipe.sortOrder ?? null,
    created_at: new Date(recipe.createdAt).toISOString(),
  };
}

/** The IDB row carries `sortOrder` (per the `Sortable` mixin in
 *  `lib/db.ts`); the global `Recipe` type doesn't, so the mapper
 *  returns a widened type that includes the optional field. Sync's
 *  `applyServerRecipe` accepts the wider shape. */
export function recipeFromRow(row: RecipeRow): Recipe & { sortOrder?: number } {
  return {
    id: row.id,
    name: row.name,
    ingredients: row.ingredients,
    cuisine: row.cuisine ?? undefined,
    notes: row.notes ?? undefined,
    sortOrder: row.sort_order ?? undefined,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  };
}
