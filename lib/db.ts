import type {
  Food,
  FoodItem,
  Meal,
  PersonalInfo,
  Recipe,
} from "@/components/macro/types";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";

const DB_NAME = "macro-calculator";
const DB_VERSION = 7;

const STORE_CUSTOM_FOODS = "customFoods";
const STORE_PROFILE = "profile";
const STORE_DAILY_LOGS = "dailyLogs";
const STORE_MEAL_TEMPLATES = "mealTemplates";
const STORE_WEIGHT_HISTORY = "weightHistory";
const STORE_RECIPES = "recipes";

/** Single record key under the `profile` store. We only support one
 * profile in phase 2; this constant makes that explicit. */
const PROFILE_KEY = "default";

/** Versioning mixin every synced row carries since v7. Two timestamps:
 *
 *  - `localUpdatedAt` — wall-clock ISO timestamp of the last *local*
 *    modification. Bumped by every save/upsert from user actions.
 *  - `serverUpdatedAt` — the server's `updated_at` when this row was
 *    last pulled or successfully pushed. `null` if the row was created
 *    locally and has never reached the server. Used as the optimistic-
 *    concurrency token (`.eq("updated_at", serverUpdatedAt)`) on the
 *    next push: if the server's current value differs, our update
 *    affects zero rows and we know another device changed it first.
 *
 *  A row is "dirty" — i.e. waiting to be pushed — when
 *  `serverUpdatedAt == null || localUpdatedAt !== serverUpdatedAt`.
 *
 *  Both fields are *optional* on the type so callers that build row
 *  literals (forms, mappers, tests) don't have to know about sync
 *  internals; the saver functions in this file fill them in, and the
 *  sync engine treats missing/null as "never synced". */
export type Versioned = {
  localUpdatedAt?: string;
  serverUpdatedAt?: string | null;
};

/** Stored custom food. Macros are per 100g; the id is a client-minted
 * UUID so the same record can exist in IndexedDB and Supabase under the
 * same key (no mapping needed for sync). createdAt drives most-recent
 * ordering. */
export type CustomFood = Omit<Food, "id" | "source"> & {
  id: string;
  createdAt: number;
} & Versioned;

/** A single day's meal log. Keyed by `YYYY-MM-DD` in the user's local
 * timezone. The `meals` shape mirrors the in-memory `Meal[]` exactly.
 *
 *  NOTE: This shape will be retired in a follow-up pass once the new
 *  per-meal `meals` store is wired through the hooks. The store stays
 *  available here so existing reads keep working during the cutover. */
export type DailyLog = {
  date: string;
  meals: Meal[];
  /** Legacy ms-epoch timestamp from pre-v7 rows. Kept for backwards
   *  compatibility while we migrate; new writes set
   *  `localUpdatedAt`/`serverUpdatedAt` via the Versioned mixin. */
  updatedAt: number;
} & Versioned;

/** A reusable meal template — the user named some set of foods (e.g.
 * "Greek yogurt bowl") and can apply it to any meal slot on any day. The
 * `foods` array is captured with portions as-saved. Id is a client-minted
 * UUID shared with Supabase. */
export type MealTemplate = {
  id: string;
  name: string;
  foods: FoodItem[];
  createdAt: number;
  /** Legacy ms-epoch timestamp. Still bumped on local writes so the
   *  existing list-sort ("most recently edited first") keeps working
   *  without a refactor — `localUpdatedAt` is the authoritative one
   *  for sync. */
  updatedAt: number;
} & Versioned;

/** A single weigh-in. Keyed by `YYYY-MM-DD` local date — same-day writes
 * overwrite, so the latest weigh-in for a day wins. */
export type WeightEntry = {
  date: string;
  kg: number;
  recordedAt: number;
} & Versioned;

/** Tiny helper that mints the wall-clock timestamp every saver uses.
 *  Centralized so tests can hijack it via vi.useFakeTimers() and the
 *  string format stays consistent. */
function nowIso(): string {
  return new Date().toISOString();
}

/** The profile row stored in IDB. The Versioned mixin tracks sync
 *  state; `_key` is the static keyPath we use because profile is a
 *  single-row store (one profile per user). `getProfile()` strips
 *  these internal fields so callers see a clean PersonalInfo. */
type ProfileRecord = PersonalInfo & { _key: string } & Versioned;

interface MacroDB extends DBSchema {
  [STORE_CUSTOM_FOODS]: {
    key: string;
    value: CustomFood;
    indexes: { byName: string };
  };
  [STORE_PROFILE]: { key: string; value: ProfileRecord };
  [STORE_DAILY_LOGS]: { key: string; value: DailyLog };
  [STORE_MEAL_TEMPLATES]: { key: string; value: MealTemplate };
  [STORE_WEIGHT_HISTORY]: { key: string; value: WeightEntry };
  [STORE_RECIPES]: {
    key: string;
    value: Recipe & Versioned;
    indexes: { byName: string };
  };
}

let dbPromise: Promise<IDBPDatabase<MacroDB>> | null = null;

function getDB(): Promise<IDBPDatabase<MacroDB>> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable on server"));
  }
  dbPromise ??= openDB<MacroDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
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
      // v5 → v6: recipes store. New, additive — no existing data to migrate.
      if (oldVersion < 6) {
        const recipes = db.createObjectStore(STORE_RECIPES, { keyPath: "id" });
        recipes.createIndex("byName", "name", { unique: false });
      }
      // v6 → v7: add Versioned mixin fields to every existing row in
      // every synced store. Without this, the sync engine would
      // interpret every legacy row as "dirty" (serverUpdatedAt === null
      // / undefined) and try to UPDATE-with-version-check against a
      // null token — which would 0-row and look like a conflict.
      //
      // We mark legacy rows with `localUpdatedAt = nowIso()` and
      // `serverUpdatedAt = null`. The next sync will push them as
      // "new" rows (PK upsert wins anyway since the server-side row
      // already has the same id and a real `updated_at`). The pull
      // half then writes back the canonical server values, restoring
      // the steady-state invariant `localUpdatedAt === serverUpdatedAt`.
      if (oldVersion < 7) {
        // Use the *upgrade* transaction `idb` already passed us — we
        // must not open a new one inside the upgrade callback or the
        // versionchange tx will close before our cursors finish.
        const stores: ReadonlyArray<
          | typeof STORE_PROFILE
          | typeof STORE_DAILY_LOGS
          | typeof STORE_WEIGHT_HISTORY
          | typeof STORE_CUSTOM_FOODS
          | typeof STORE_MEAL_TEMPLATES
          | typeof STORE_RECIPES
        > = [
          STORE_PROFILE,
          STORE_DAILY_LOGS,
          STORE_WEIGHT_HISTORY,
          STORE_CUSTOM_FOODS,
          STORE_MEAL_TEMPLATES,
          STORE_RECIPES,
        ];
        for (const name of stores) {
          // The idb cursor-iteration pattern: `openCursor()` returns a
          // Promise resolving to a cursor; `cursor.continue()` returns
          // a Promise for the next cursor (or null). We need to await
          // sequentially inside the upgrade tx so the versionchange
          // transaction stays open through the loop.
          void (async () => {
            const store = transaction.objectStore(name);
            let cursor = await store.openCursor();
            while (cursor) {
              const value = cursor.value as Partial<Versioned>;
              if (
                value.localUpdatedAt == null ||
                value.serverUpdatedAt === undefined
              ) {
                await cursor.update({
                  ...cursor.value,
                  localUpdatedAt:
                    value.localUpdatedAt ?? new Date().toISOString(),
                  serverUpdatedAt: value.serverUpdatedAt ?? null,
                });
              }
              cursor = await cursor.continue();
            }
          })();
        }
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
 *  shared with Supabase. New row → `serverUpdatedAt: null` until the
 *  next sync push acks it. */
export async function addCustomFood(
  food: Omit<CustomFood, "id" | "createdAt" | keyof Versioned>,
): Promise<string> {
  const db = await getDB();
  const id = mintId();
  await db.put(STORE_CUSTOM_FOODS, {
    ...food,
    id,
    createdAt: Date.now(),
    localUpdatedAt: nowIso(),
    serverUpdatedAt: null,
  });
  return id;
}

/** Upsert a custom food at a specific id. Used by the edit flow to
 *  replace a row in place (preserves the existing server token so the
 *  push knows which version it branches from). The sync-layer
 *  equivalent for server-pulled rows is `applyServerCustomFood`. */
export async function upsertCustomFood(
  food: Omit<CustomFood, keyof Versioned> & Partial<Versioned>,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE_CUSTOM_FOODS, food.id);
  await db.put(STORE_CUSTOM_FOODS, {
    ...food,
    localUpdatedAt: nowIso(),
    serverUpdatedAt: food.serverUpdatedAt ?? existing?.serverUpdatedAt ?? null,
  });
}

/** Sync-layer hook: write a server-pulled custom food. */
export async function applyServerCustomFood(
  food: Omit<CustomFood, keyof Versioned>,
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  await db.put(STORE_CUSTOM_FOODS, {
    ...food,
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
}

/** Sync-layer hook: refresh the version token after a successful push. */
export async function markCustomFoodSynced(
  id: string,
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  const row = await db.get(STORE_CUSTOM_FOODS, id);
  if (!row) return;
  await db.put(STORE_CUSTOM_FOODS, {
    ...row,
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
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
 * persisted yet (first run). Strips internal sync fields. */
export async function getProfile(): Promise<PersonalInfo | null> {
  const row = await getProfileRecord();
  if (!row) return null;
  const { localUpdatedAt: _local, serverUpdatedAt: _server, ...profile } = row;
  void _local;
  void _server;
  return profile;
}

/** Sync-layer hook: returns the profile row plus its Versioned fields
 *  so the sync engine can read `serverUpdatedAt` as the optimistic-
 *  concurrency token. Returns `null` for a never-saved profile. */
export async function getProfileRecord(): Promise<
  (PersonalInfo & Versioned) | null
> {
  const db = await getDB();
  const row = await db.get(STORE_PROFILE, PROFILE_KEY);
  if (!row) return null;
  const { _key: _ignored, ...rest } = row;
  void _ignored;
  return rest;
}

/** Save a profile from a user action. Bumps `localUpdatedAt`; the
 *  sync layer will detect this row as dirty and push it. Preserves the
 *  existing `serverUpdatedAt` token so the push knows which server
 *  version it's branching from. */
export async function saveProfile(profile: PersonalInfo): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE_PROFILE, PROFILE_KEY);
  await db.put(STORE_PROFILE, {
    ...profile,
    _key: PROFILE_KEY,
    localUpdatedAt: nowIso(),
    serverUpdatedAt: existing?.serverUpdatedAt ?? null,
  });
}

/** Sync-layer hook: write the profile we just pulled from the server.
 *  Sets both timestamps to the server's `updated_at` so the row reads
 *  as clean (localUpdatedAt === serverUpdatedAt) and won't be re-pushed. */
export async function applyServerProfile(
  profile: PersonalInfo,
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  await db.put(STORE_PROFILE, {
    ...profile,
    _key: PROFILE_KEY,
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
}

/** Sync-layer hook: after a successful push, refresh the local
 *  `serverUpdatedAt` to the value the server just stamped on us so
 *  future pushes carry the right concurrency token. The payload
 *  itself doesn't change; only the metadata. */
export async function markProfileSynced(
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  const row = await db.get(STORE_PROFILE, PROFILE_KEY);
  if (!row) return;
  await db.put(STORE_PROFILE, {
    ...row,
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
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
  const existing = await db.get(STORE_DAILY_LOGS, date);
  const now = nowIso();
  await db.put(STORE_DAILY_LOGS, {
    date,
    meals,
    updatedAt: Date.now(),
    localUpdatedAt: now,
    serverUpdatedAt: existing?.serverUpdatedAt ?? null,
  });
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

/** Sync-layer hook: write a server-pulled daily log. Marks the row
 *  clean so it won't be re-pushed. Uses the server's `updated_at` as
 *  both the local and server token. */
export async function applyServerDailyLog(
  date: string,
  meals: Meal[],
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  await db.put(STORE_DAILY_LOGS, {
    date,
    meals,
    updatedAt: Date.parse(serverUpdatedAt) || Date.now(),
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
}

/** Sync-layer hook: refresh the version token after a successful push. */
export async function markDailyLogSynced(
  date: string,
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  const row = await db.get(STORE_DAILY_LOGS, date);
  if (!row) return;
  await db.put(STORE_DAILY_LOGS, {
    ...row,
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
}

// ─── Meal templates ────────────────────────────────────────────────────────

/** Save a new meal template. Mints a client-side UUID. */
export async function saveMealTemplate(
  template: Omit<
    MealTemplate,
    "id" | "createdAt" | "updatedAt" | keyof Versioned
  >,
): Promise<string> {
  const db = await getDB();
  const now = Date.now();
  const id = mintId();
  await db.put(STORE_MEAL_TEMPLATES, {
    ...template,
    id,
    createdAt: now,
    updatedAt: now,
    localUpdatedAt: nowIso(),
    serverUpdatedAt: null,
  });
  return id;
}

/** Upsert a template at a specific id. Used by the local edit flow and
 *  by the sync layer's UUID-collision recovery path. Preserves the
 *  caller-provided `serverUpdatedAt` if any (for sync-layer use); falls
 *  back to the existing row's token; ultimately null. */
export async function upsertMealTemplate(
  template: Omit<MealTemplate, keyof Versioned> & Partial<Versioned>,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE_MEAL_TEMPLATES, template.id);
  await db.put(STORE_MEAL_TEMPLATES, {
    ...template,
    localUpdatedAt: nowIso(),
    serverUpdatedAt:
      template.serverUpdatedAt ?? existing?.serverUpdatedAt ?? null,
  });
}

/** Sync-layer hook: write a server-pulled template. */
export async function applyServerMealTemplate(
  template: Omit<MealTemplate, keyof Versioned>,
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  await db.put(STORE_MEAL_TEMPLATES, {
    ...template,
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
}

/** Sync-layer hook: refresh the version token after a successful push. */
export async function markMealTemplateSynced(
  id: string,
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  const row = await db.get(STORE_MEAL_TEMPLATES, id);
  if (!row) return;
  await db.put(STORE_MEAL_TEMPLATES, {
    ...row,
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
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
 * the same day collapse to the most recent value. Preserves the row's
 * existing `serverUpdatedAt` so the push knows the right base version. */
export async function saveWeightEntry(date: string, kg: number): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE_WEIGHT_HISTORY, date);
  await db.put(STORE_WEIGHT_HISTORY, {
    date,
    kg,
    recordedAt: Date.now(),
    localUpdatedAt: nowIso(),
    serverUpdatedAt: existing?.serverUpdatedAt ?? null,
  });
}

/** Sync-layer hook: write a server-pulled weight entry. */
export async function applyServerWeightEntry(
  date: string,
  kg: number,
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  await db.put(STORE_WEIGHT_HISTORY, {
    date,
    kg,
    recordedAt: Date.parse(serverUpdatedAt) || Date.now(),
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
}

/** Sync-layer hook: refresh the version token after a successful push. */
export async function markWeightEntrySynced(
  date: string,
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  const row = await db.get(STORE_WEIGHT_HISTORY, date);
  if (!row) return;
  await db.put(STORE_WEIGHT_HISTORY, {
    ...row,
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
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

// ─── Recipes ───────────────────────────────────────────────────────────────

/** Save a new recipe. Mints a client-side UUID so the same id is shared
 *  with Supabase (mirrors meal templates). */
export async function addRecipe(
  recipe: Omit<Recipe, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  const db = await getDB();
  const now = Date.now();
  const id = mintId();
  await db.put(STORE_RECIPES, {
    ...recipe,
    id,
    createdAt: now,
    updatedAt: now,
    localUpdatedAt: nowIso(),
    serverUpdatedAt: null,
  });
  return id;
}

/** Upsert a recipe at a specific id. Used by the edit flow and the
 *  sync layer's UUID-collision recovery path. Preserves the
 *  caller-provided `serverUpdatedAt` for sync-layer use; falls back to
 *  the existing row's token; ultimately null. */
export async function upsertRecipe(
  recipe: Recipe & Partial<Versioned>,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get(STORE_RECIPES, recipe.id);
  await db.put(STORE_RECIPES, {
    ...recipe,
    localUpdatedAt: nowIso(),
    serverUpdatedAt:
      recipe.serverUpdatedAt ?? existing?.serverUpdatedAt ?? null,
  });
}

/** Sync-layer hook: write a server-pulled recipe. */
export async function applyServerRecipe(
  recipe: Recipe,
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  await db.put(STORE_RECIPES, {
    ...recipe,
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
}

/** Sync-layer hook: refresh the version token after a successful push. */
export async function markRecipeSynced(
  id: string,
  serverUpdatedAt: string,
): Promise<void> {
  const db = await getDB();
  const row = await db.get(STORE_RECIPES, id);
  if (!row) return;
  await db.put(STORE_RECIPES, {
    ...row,
    localUpdatedAt: serverUpdatedAt,
    serverUpdatedAt,
  });
}

export async function listRecipes(): Promise<Array<Recipe & Versioned>> {
  const db = await getDB();
  const rows = await db.getAll(STORE_RECIPES);
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteRecipe(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_RECIPES, id);
}

// ─── Bulk ──────────────────────────────────────────────────────────────────

/** Wipes every store. Used by the Delete account flow so a future sign-in
 * on the same device starts from a truly empty slate (otherwise the next
 * sync would push the leftover rows into the new user's account). Runs
 * in a single transaction so a mid-flight failure either clears all
 * stores or none — no half-state. */
export async function clearAllStores(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(
    [
      STORE_CUSTOM_FOODS,
      STORE_PROFILE,
      STORE_DAILY_LOGS,
      STORE_MEAL_TEMPLATES,
      STORE_WEIGHT_HISTORY,
      STORE_RECIPES,
    ],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore(STORE_CUSTOM_FOODS).clear(),
    tx.objectStore(STORE_PROFILE).clear(),
    tx.objectStore(STORE_DAILY_LOGS).clear(),
    tx.objectStore(STORE_MEAL_TEMPLATES).clear(),
    tx.objectStore(STORE_WEIGHT_HISTORY).clear(),
    tx.objectStore(STORE_RECIPES).clear(),
    tx.done,
  ]);
}
