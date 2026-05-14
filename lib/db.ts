import type {
  Food,
  FoodItem,
  Meal,
  PersonalInfo,
} from "@/components/macro/types";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";

const DB_NAME = "macro-calculator";
const DB_VERSION = 5;

const STORE_CUSTOM_FOODS = "customFoods";
const STORE_PROFILE = "profile";
const STORE_DAILY_LOGS = "dailyLogs";
const STORE_MEAL_TEMPLATES = "mealTemplates";
const STORE_WEIGHT_HISTORY = "weightHistory";

/** Single record key under the `profile` store. We only support one
 * profile in phase 2; this constant makes that explicit. */
const PROFILE_KEY = "default";

/** Stored custom food. Macros are per 100g; the id is a client-minted
 * UUID so the same record can exist in IndexedDB and Supabase under the
 * same key (no mapping needed for sync). createdAt drives most-recent
 * ordering. */
export type CustomFood = Omit<Food, "id" | "source"> & {
  id: string;
  createdAt: number;
};

/** A single day's meal log. Keyed by `YYYY-MM-DD` in the user's local
 * timezone. The `meals` shape mirrors the in-memory `Meal[]` exactly. */
export type DailyLog = { date: string; meals: Meal[]; updatedAt: number };

/** A reusable meal template — the user named some set of foods (e.g.
 * "Greek yogurt bowl") and can apply it to any meal slot on any day. The
 * `foods` array is captured with portions as-saved. Id is a client-minted
 * UUID shared with Supabase. */
export type MealTemplate = {
  id: string;
  name: string;
  foods: FoodItem[];
  createdAt: number;
  updatedAt: number;
};

/** A single weigh-in. Keyed by `YYYY-MM-DD` local date — same-day writes
 * overwrite, so the latest weigh-in for a day wins. */
export type WeightEntry = { date: string; kg: number; recordedAt: number };

interface MacroDB extends DBSchema {
  [STORE_CUSTOM_FOODS]: {
    key: string;
    value: CustomFood;
    indexes: { byName: string };
  };
  [STORE_PROFILE]: { key: string; value: PersonalInfo & { _key: string } };
  [STORE_DAILY_LOGS]: { key: string; value: DailyLog };
  [STORE_MEAL_TEMPLATES]: { key: string; value: MealTemplate };
  [STORE_WEIGHT_HISTORY]: { key: string; value: WeightEntry };
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
      // v3 → v4: weightHistory store.
      if (oldVersion < 4) {
        db.createObjectStore(STORE_WEIGHT_HISTORY, { keyPath: "date" });
      }
      // v4 → v5: customFoods + mealTemplates switch to client-minted UUID
      // keys so the same row can exist in IndexedDB and Supabase under
      // identical ids. Drop the autoIncrement stores and recreate. Any
      // pre-existing local data is discarded — acceptable while we're
      // still in development; before shipping to real users, this would
      // need an in-place migration that rewrites keys.
      if (oldVersion < 5) {
        if (db.objectStoreNames.contains(STORE_CUSTOM_FOODS)) {
          db.deleteObjectStore(STORE_CUSTOM_FOODS);
        }
        const customFoods = db.createObjectStore(STORE_CUSTOM_FOODS, {
          keyPath: "id",
        });
        customFoods.createIndex("byName", "name", { unique: false });

        if (db.objectStoreNames.contains(STORE_MEAL_TEMPLATES)) {
          db.deleteObjectStore(STORE_MEAL_TEMPLATES);
        }
        db.createObjectStore(STORE_MEAL_TEMPLATES, { keyPath: "id" });
      }
    },
  });
  return dbPromise;
}

// ─── Custom foods ──────────────────────────────────────────────────────────

function mintId(): string {
  // crypto.randomUUID is available in secure contexts (https, localhost)
  // since 2022; this app is React 19 + Next 16 so it's always available.
  return crypto.randomUUID();
}

/** Insert a custom food. Mints a client-side UUID so the same id is
 * shared with Supabase. */
export async function addCustomFood(
  food: Omit<CustomFood, "id" | "createdAt">,
): Promise<string> {
  const db = await getDB();
  const id = mintId();
  await db.put(STORE_CUSTOM_FOODS, { ...food, id, createdAt: Date.now() });
  return id;
}

/** Upsert a custom food at a specific id. Used by the sync layer to write
 * server-sourced rows into local storage without minting a fresh id. */
export async function upsertCustomFood(food: CustomFood): Promise<void> {
  const db = await getDB();
  await db.put(STORE_CUSTOM_FOODS, food);
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

export async function deleteCustomFood(id: string): Promise<void> {
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

/** Save a new meal template. Mints a client-side UUID. */
export async function saveMealTemplate(
  template: Omit<MealTemplate, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  const db = await getDB();
  const now = Date.now();
  const id = mintId();
  await db.put(STORE_MEAL_TEMPLATES, {
    ...template,
    id,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Upsert a template at a specific id. Used by the sync layer. */
export async function upsertMealTemplate(
  template: MealTemplate,
): Promise<void> {
  const db = await getDB();
  await db.put(STORE_MEAL_TEMPLATES, template);
}

export async function listMealTemplates(): Promise<MealTemplate[]> {
  const db = await getDB();
  const rows = await db.getAll(STORE_MEAL_TEMPLATES);
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteMealTemplate(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_MEAL_TEMPLATES, id);
}

// ─── Weight history ────────────────────────────────────────────────────────

/** Record a weigh-in. Same-date saves overwrite, so multiple weigh-ins on
 * the same day collapse to the most recent value. */
export async function saveWeightEntry(date: string, kg: number): Promise<void> {
  const db = await getDB();
  await db.put(STORE_WEIGHT_HISTORY, { date, kg, recordedAt: Date.now() });
}

export async function getWeightEntry(
  date: string,
): Promise<WeightEntry | null> {
  const db = await getDB();
  const row = await db.get(STORE_WEIGHT_HISTORY, date);
  return row ?? null;
}

/** All weight entries, oldest first — the natural order for charts. */
export async function listWeightEntries(): Promise<WeightEntry[]> {
  const db = await getDB();
  const rows = await db.getAll(STORE_WEIGHT_HISTORY);
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function deleteWeightEntry(date: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_WEIGHT_HISTORY, date);
}
