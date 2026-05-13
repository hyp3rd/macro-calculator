import type {
  Food,
  FoodItem,
  Meal,
  PersonalInfo,
} from "@/components/macro/types";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";

const DB_NAME = "macro-calculator";
const DB_VERSION = 3;

const STORE_CUSTOM_FOODS = "customFoods";
const STORE_PROFILE = "profile";
const STORE_DAILY_LOGS = "dailyLogs";
const STORE_MEAL_TEMPLATES = "mealTemplates";

/** Single record key under the `profile` store. We only support one
 * profile in phase 2; this constant makes that explicit. */
const PROFILE_KEY = "default";

/** Stored custom food. Macros are per 100g; the runtime ID is assigned by
 * IndexedDB. createdAt drives most-recent ordering. */
export type CustomFood = Omit<Food, "id" | "source"> & {
  id: number;
  createdAt: number;
};

/** A single day's meal log. Keyed by `YYYY-MM-DD` in the user's local
 * timezone. The `meals` shape mirrors the in-memory `Meal[]` exactly. */
export type DailyLog = { date: string; meals: Meal[]; updatedAt: number };

/** A reusable meal template — the user named some set of foods (e.g.
 * "Greek yogurt bowl") and can apply it to any meal slot on any day. The
 * `foods` array is captured with portions as-saved. */
export type MealTemplate = {
  id: number;
  name: string;
  foods: FoodItem[];
  createdAt: number;
  updatedAt: number;
};

interface MacroDB extends DBSchema {
  [STORE_CUSTOM_FOODS]: {
    key: number;
    value: CustomFood;
    indexes: { byName: string };
  };
  [STORE_PROFILE]: { key: string; value: PersonalInfo & { _key: string } };
  [STORE_DAILY_LOGS]: { key: string; value: DailyLog };
  [STORE_MEAL_TEMPLATES]: { key: number; value: MealTemplate };
}

let dbPromise: Promise<IDBPDatabase<MacroDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MacroDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable on server"));
  }
  dbPromise ??= openDB<MacroDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // v0 → v1: customFoods store.
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE_CUSTOM_FOODS, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("byName", "name", { unique: false });
      }
      // v1 → v2: profile + dailyLogs stores.
      if (oldVersion < 2) {
        db.createObjectStore(STORE_PROFILE, { keyPath: "_key" });
        db.createObjectStore(STORE_DAILY_LOGS, { keyPath: "date" });
      }
      // v2 → v3: mealTemplates store.
      if (oldVersion < 3) {
        db.createObjectStore(STORE_MEAL_TEMPLATES, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    },
  });
  return dbPromise;
}

// ─── Custom foods ──────────────────────────────────────────────────────────

/** Insert a custom food. Returns the assigned id. The `id` field is
 * omitted from the put payload — IndexedDB rejects an explicit `undefined`
 * key when the store has `keyPath` + `autoIncrement`, so let the store
 * generate the key itself. */
export async function addCustomFood(
  food: Omit<CustomFood, "id" | "createdAt">,
): Promise<number> {
  const db = await getDB();
  const id = await db.add(STORE_CUSTOM_FOODS, {
    ...food,
    createdAt: Date.now(),
  } as CustomFood);
  return id as number;
}

export async function listCustomFoods(): Promise<CustomFood[]> {
  const db = await getDB();
  const rows = await db.getAll(STORE_CUSTOM_FOODS);
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function searchCustomFoods(
  query: string,
  limit = 5,
): Promise<Food[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const all = await listCustomFoods();
  return all
    .filter((f) => f.name.toLowerCase().includes(trimmed))
    .slice(0, limit)
    .map(customToFood);
}

export async function deleteCustomFood(id: number): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_CUSTOM_FOODS, id);
}

export function customToFood(c: CustomFood): Food {
  return {
    id: `custom:${c.id}`,
    source: "custom",
    name: c.name,
    protein: c.protein,
    carbs: c.carbs,
    fat: c.fat,
    calories: c.calories,
    category: c.category,
    subCategory: c.subCategory,
    brand: c.brand,
  };
}

// ─── Profile ───────────────────────────────────────────────────────────────

/** Read the single saved profile. Returns `null` if no profile has been
 * persisted yet (first run). */
export async function getProfile(): Promise<PersonalInfo | null> {
  const db = await getDB();
  const row = await db.get(STORE_PROFILE, PROFILE_KEY);
  if (!row) return null;
  // Strip the internal `_key` field before returning.
  const { _key: _ignored, ...profile } = row;
  void _ignored;
  return profile;
}

export async function saveProfile(profile: PersonalInfo): Promise<void> {
  const db = await getDB();
  await db.put(STORE_PROFILE, { ...profile, _key: PROFILE_KEY });
}

// ─── Daily logs ────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` for the given Date in the user's local timezone. */
export function dateKey(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Convenience: today's local date key. */
export function todayKey(): string {
  return dateKey();
}

export async function getDailyLog(date: string): Promise<DailyLog | null> {
  const db = await getDB();
  const row = await db.get(STORE_DAILY_LOGS, date);
  return row ?? null;
}

export async function saveDailyLog(date: string, meals: Meal[]): Promise<void> {
  const db = await getDB();
  await db.put(STORE_DAILY_LOGS, { date, meals, updatedAt: Date.now() });
}

/** All saved daily logs, newest first. Cheap because we only have one
 * record per day. */
export async function listDailyLogs(): Promise<DailyLog[]> {
  const db = await getDB();
  const rows = await db.getAll(STORE_DAILY_LOGS);
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function deleteDailyLog(date: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_DAILY_LOGS, date);
}

// ─── Meal templates ────────────────────────────────────────────────────────

/** Save a new meal template. The IndexedDB store auto-assigns the id —
 * we do not pass an explicit `undefined` (would crash the keyPath +
 * autoIncrement evaluation, same as customFoods). */
export async function saveMealTemplate(
  template: Omit<MealTemplate, "id" | "createdAt" | "updatedAt">,
): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const id = await db.add(STORE_MEAL_TEMPLATES, {
    ...template,
    createdAt: now,
    updatedAt: now,
  } as MealTemplate);
  return id as number;
}

/** All saved templates, newest first. */
export async function listMealTemplates(): Promise<MealTemplate[]> {
  const db = await getDB();
  const rows = await db.getAll(STORE_MEAL_TEMPLATES);
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteMealTemplate(id: number): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_MEAL_TEMPLATES, id);
}
