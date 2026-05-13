import type { Food } from "@/components/macro/types";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";

const DB_NAME = "macro-calculator";
const DB_VERSION = 1;
const STORE = "customFoods";

/** Stored custom food. Macros are per 100g; the runtime ID is assigned by
 * IndexedDB. createdAt drives most-recent ordering. */
export type CustomFood = Omit<Food, "id" | "source"> & {
  id: number;
  createdAt: number;
};

interface MacroDB extends DBSchema {
  [STORE]: { key: number; value: CustomFood; indexes: { byName: string } };
}

let dbPromise: Promise<IDBPDatabase<MacroDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MacroDB>> {
  if (typeof window === "undefined") {
    // Guard against accidental SSR import; IndexedDB only exists in the browser.
    return Promise.reject(new Error("IndexedDB unavailable on server"));
  }
  dbPromise ??= openDB<MacroDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE, {
        keyPath: "id",
        autoIncrement: true,
      });
      store.createIndex("byName", "name", { unique: false });
    },
  });
  return dbPromise;
}

/** Insert a custom food. Returns the assigned id. The `id` field is
 * omitted from the put payload — IndexedDB rejects an explicit `undefined`
 * key when the store has `keyPath` + `autoIncrement`, so let the store
 * generate the key itself. */
export async function addCustomFood(
  food: Omit<CustomFood, "id" | "createdAt">,
): Promise<number> {
  const db = await getDB();
  const id = await db.add(STORE, {
    ...food,
    createdAt: Date.now(),
  } as CustomFood);
  return id as number;
}

/** All custom foods, newest first. */
export async function listCustomFoods(): Promise<CustomFood[]> {
  const db = await getDB();
  const rows = await db.getAll(STORE);
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/** Substring match on name, case-insensitive. Returns Food shape ready to
 * feed into the existing portionSize × ratio logic. */
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
  await db.delete(STORE, id);
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
