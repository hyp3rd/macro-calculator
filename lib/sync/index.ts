"use client";

import {
  deleteCustomFood,
  deleteMealTemplate,
  deleteRecipe,
  getProfile,
  listCustomFoods,
  listDailyLogs,
  listMealTemplates,
  listRecipes,
  listWeightEntries,
  saveDailyLog,
  saveProfile,
  saveWeightEntry,
  upsertCustomFood,
  upsertMealTemplate,
  upsertRecipe,
} from "@/lib/db";
import {
  getSyncStatus,
  setSyncError,
  setSynced,
  setSyncing,
} from "@/lib/sync-status";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  customFoodFromRow,
  customFoodToRow,
  dailyLogFromRow,
  dailyLogToRow,
  mealTemplateFromRow,
  mealTemplateToRow,
  profileFromRow,
  profileToRow,
  recipeFromRow,
  recipeToRow,
  weightFromRow,
  weightToRow,
  type CustomFoodRow,
  type DailyLogRow,
  type MealTemplateRow,
  type ProfileRow,
  type RecipeRow,
  type WeightRow,
} from "./mappers";

export type SyncResult = {
  pushed: {
    profile: number;
    dailyLogs: number;
    weightEntries: number;
    customFoods: number;
    mealTemplates: number;
    recipes: number;
  };
  pulled: {
    profile: number;
    dailyLogs: number;
    weightEntries: number;
    customFoods: number;
    mealTemplates: number;
    recipes: number;
  };
};

const ZERO_COUNTS = {
  profile: 0,
  dailyLogs: 0,
  weightEntries: 0,
  customFoods: 0,
  mealTemplates: 0,
  recipes: 0,
};

/** Push every local row to Supabase via upsert, then pull every remote row
 * into local IDB. Idempotent — the database's last-write-wins triggers
 * (updated_at) plus the upsert semantics let this run repeatedly without
 * duplicating rows. Phase 4b semantic: this is a one-shot reconcile that
 * fires on sign-in, not a continuous loop. */
export async function runInitialSync(
  supabase: SupabaseClient,
  userId: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    pushed: { ...ZERO_COUNTS },
    pulled: { ...ZERO_COUNTS },
  };

  await pushProfile(supabase, userId, result);
  await pushDailyLogs(supabase, userId, result);
  await pushWeightEntries(supabase, userId, result);
  await pushCustomFoods(supabase, userId, result);
  await pushMealTemplates(supabase, userId, result);
  await pushRecipes(supabase, userId, result);

  await pullProfile(supabase, userId, result);
  await pullDailyLogs(supabase, userId, result);
  await pullWeightEntries(supabase, userId, result);
  await pullCustomFoods(supabase, userId, result);
  await pullMealTemplates(supabase, userId, result);
  await pullRecipes(supabase, userId, result);

  return result;
}

/** Wraps {@link runInitialSync} with sync-status side-effects so both the
 * auto-sync on sign-in and any manual "Sync now" button share one path.
 * If a sync is already in flight, returns `null` rather than queueing a
 * second one — concurrent runs against the same user would just race the
 * upserts. */
export async function triggerSync(
  supabase: SupabaseClient,
  userId: string,
): Promise<SyncResult | null> {
  if (getSyncStatus().state === "syncing") return null;
  setSyncing();
  try {
    const result = await runInitialSync(supabase, userId);
    setSynced();
    return result;
  } catch (err) {
    setSyncError(err);
    throw err;
  }
}

/** Per-call timeout for every Supabase request inside `runInitialSync`.
 *  Far longer than the median round-trip (<1 s) — sized to catch truly
 *  hung connections rather than slow ones. */
const CALL_TIMEOUT_MS = 60_000;

/** Run a single Supabase call with a per-call AbortController. Passes the
 *  signal to the caller so it can be attached via PostgREST's
 *  `.abortSignal(signal)`. On timeout, throws a labelled Error so the
 *  sync-status pill can surface a readable reason rather than an
 *  indefinite spinner. */
async function withTimeout<T>(
  label: string,
  fn: (signal: AbortSignal) => PromiseLike<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" || controller.signal.aborted)
    ) {
      throw new Error(`${label} timed out after ${CALL_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Turn a Supabase PostgrestError into a real `Error` so the message
 * survives React's runtime-error overlay (which calls `.toString()` on
 * thrown values — plain objects render as "[object Object]"). Includes
 * the PGRST/Postgres code when present so 403s carry the actual cause
 * (column grant, RLS, schema-cache stale, etc). Exported so the unit
 * test can pin its formatting; not part of the public sync API. */
export function asError(
  err: { message?: string; code?: string; details?: string; hint?: string },
  context: string,
): Error {
  const parts = [err.message ?? "Supabase error"];
  if (err.code) parts.push(`(${err.code})`);
  if (err.details) parts.push(`— ${err.details}`);
  return new Error(`${context}: ${parts.join(" ")}`);
}

// ─── Push ──────────────────────────────────────────────────────────────────

async function pushProfile(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const profile = await getProfile();
  if (!profile) return;
  const row = profileToRow(userId, profile);
  const { error } = await withTimeout("push profile", (signal) =>
    supabase.from("profiles").upsert(row).abortSignal(signal),
  );
  if (error) throw asError(error, "push profile");
  result.pushed.profile = 1;
}

async function pushDailyLogs(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const logs = await listDailyLogs();
  if (logs.length === 0) return;
  const rows = logs.map((l) => dailyLogToRow(userId, l));
  const { error } = await withTimeout("push daily logs", (signal) =>
    supabase.from("daily_logs").upsert(rows).abortSignal(signal),
  );
  if (error) throw asError(error, "push daily logs");
  result.pushed.dailyLogs = rows.length;
}

async function pushWeightEntries(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const entries = await listWeightEntries();
  if (entries.length === 0) return;
  const rows = entries.map((e) => weightToRow(userId, e));
  const { error } = await withTimeout("push weight history", (signal) =>
    supabase.from("weight_history").upsert(rows).abortSignal(signal),
  );
  if (error) throw asError(error, "push weight history");
  result.pushed.weightEntries = rows.length;
}

/** @internal Exported for unit tests. Not part of the stable sync API. */
export async function pushCustomFoods(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const foods = await listCustomFoods();
  if (foods.length === 0) return;
  const rows = foods.map((f) => customFoodToRow(userId, f));
  const { error } = await withTimeout("push custom foods", (signal) =>
    supabase.from("custom_foods").upsert(rows).abortSignal(signal),
  );
  if (!error) {
    result.pushed.customFoods = rows.length;
    return;
  }

  // Postgres 42501 + "(USING expression)" on a custom_foods upsert means a
  // remote row exists with the same UUID owned by a different user — the
  // RLS UPDATE path can't see it, so the whole batch fails. Recover by
  // re-trying per row and re-minting the UUID on collision so the row
  // INSERTs fresh under a guaranteed-unique key. The user's data is
  // preserved; only the opaque id changes.
  const code = (error as { code?: string }).code;
  if (code !== "42501") throw asError(error, "push custom foods");

  let pushed = 0;
  for (const food of foods) {
    const row = customFoodToRow(userId, food);
    const single = await withTimeout("push custom foods (per-row)", (signal) =>
      supabase.from("custom_foods").upsert(row).abortSignal(signal),
    );
    if (!single.error) {
      pushed++;
      continue;
    }
    if ((single.error as { code?: string }).code !== "42501") {
      throw asError(single.error, "push custom foods (per-row)");
    }
    // Collision on this row's UUID. Re-mint locally, then INSERT fresh.
    const newId = crypto.randomUUID();
    await upsertCustomFood({ ...food, id: newId });
    await deleteCustomFood(food.id);
    const retry = await withTimeout(
      "push custom foods (re-mint retry)",
      (signal) =>
        supabase
          .from("custom_foods")
          .upsert(customFoodToRow(userId, { ...food, id: newId }))
          .abortSignal(signal),
    );
    if (retry.error)
      throw asError(retry.error, "push custom foods (re-mint retry)");
    pushed++;
  }
  result.pushed.customFoods = pushed;
}

/** @internal Exported for unit tests. Not part of the stable sync API. */
export async function pushMealTemplates(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const templates = await listMealTemplates();
  if (templates.length === 0) return;
  const rows = templates.map((t) => mealTemplateToRow(userId, t));
  const { error } = await withTimeout("push meal templates", (signal) =>
    supabase.from("meal_templates").upsert(rows).abortSignal(signal),
  );
  if (!error) {
    result.pushed.mealTemplates = rows.length;
    return;
  }

  // Same UUID-collision recovery as custom_foods: a remote row exists with
  // the same UUID owned by another user → RLS UPDATE path is blocked → 403.
  // Per-row retry; re-mint local UUID on collision and INSERT fresh.
  const code = (error as { code?: string }).code;
  if (code !== "42501") throw asError(error, "push meal templates");

  let pushed = 0;
  for (const template of templates) {
    const row = mealTemplateToRow(userId, template);
    const single = await withTimeout(
      "push meal templates (per-row)",
      (signal) =>
        supabase.from("meal_templates").upsert(row).abortSignal(signal),
    );
    if (!single.error) {
      pushed++;
      continue;
    }
    if ((single.error as { code?: string }).code !== "42501") {
      throw asError(single.error, "push meal templates (per-row)");
    }
    const newId = crypto.randomUUID();
    await upsertMealTemplate({ ...template, id: newId });
    await deleteMealTemplate(template.id);
    const retry = await withTimeout(
      "push meal templates (re-mint retry)",
      (signal) =>
        supabase
          .from("meal_templates")
          .upsert(mealTemplateToRow(userId, { ...template, id: newId }))
          .abortSignal(signal),
    );
    if (retry.error)
      throw asError(retry.error, "push meal templates (re-mint retry)");
    pushed++;
  }
  result.pushed.mealTemplates = pushed;
}

/** @internal Exported for unit tests. Not part of the stable sync API. */
export async function pushRecipes(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const recipes = await listRecipes();
  if (recipes.length === 0) return;
  const rows = recipes.map((r) => recipeToRow(userId, r));
  const { error } = await withTimeout("push recipes", (signal) =>
    supabase.from("recipes").upsert(rows).abortSignal(signal),
  );
  if (!error) {
    result.pushed.recipes = rows.length;
    return;
  }

  // Same UUID-collision recovery as custom_foods / meal_templates: per-row
  // retry with re-minted local UUID on 42501.
  const code = (error as { code?: string }).code;
  if (code !== "42501") throw asError(error, "push recipes");

  let pushed = 0;
  for (const recipe of recipes) {
    const row = recipeToRow(userId, recipe);
    const single = await withTimeout("push recipes (per-row)", (signal) =>
      supabase.from("recipes").upsert(row).abortSignal(signal),
    );
    if (!single.error) {
      pushed++;
      continue;
    }
    if ((single.error as { code?: string }).code !== "42501") {
      throw asError(single.error, "push recipes (per-row)");
    }
    const newId = crypto.randomUUID();
    await upsertRecipe({ ...recipe, id: newId });
    await deleteRecipe(recipe.id);
    const retry = await withTimeout("push recipes (re-mint retry)", (signal) =>
      supabase
        .from("recipes")
        .upsert(recipeToRow(userId, { ...recipe, id: newId }))
        .abortSignal(signal),
    );
    if (retry.error) throw asError(retry.error, "push recipes (re-mint retry)");
    pushed++;
  }
  result.pushed.recipes = pushed;
}

// ─── Pull ──────────────────────────────────────────────────────────────────

async function pullProfile(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const { data, error } = await withTimeout("pull profile", (signal) =>
    supabase
      .from("profiles")
      .select("user_id, payload, updated_at")
      .eq("user_id", userId)
      .abortSignal(signal)
      .maybeSingle(),
  );
  if (error) throw asError(error, "pull profile");
  if (!data) return;
  const profile = profileFromRow(data as ProfileRow);
  await saveProfile(profile);
  result.pulled.profile = 1;
}

async function pullDailyLogs(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const { data, error } = await withTimeout("pull daily logs", (signal) =>
    supabase
      .from("daily_logs")
      .select("user_id, date, meals, updated_at")
      .eq("user_id", userId)
      .abortSignal(signal),
  );
  if (error) throw asError(error, "pull daily logs");
  if (!data) return;
  for (const row of data as DailyLogRow[]) {
    const log = dailyLogFromRow(row);
    await saveDailyLog(log.date, log.meals);
    result.pulled.dailyLogs++;
  }
}

async function pullWeightEntries(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const { data, error } = await withTimeout("pull weight history", (signal) =>
    supabase
      .from("weight_history")
      .select("user_id, date, kg, recorded_at, updated_at")
      .eq("user_id", userId)
      .abortSignal(signal),
  );
  if (error) throw asError(error, "pull weight history");
  if (!data) return;
  for (const row of data as WeightRow[]) {
    const entry = weightFromRow(row);
    await saveWeightEntry(entry.date, entry.kg);
    result.pulled.weightEntries++;
  }
}

async function pullCustomFoods(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const { data, error } = await withTimeout("pull custom foods", (signal) =>
    supabase
      .from("custom_foods")
      .select(
        "id, user_id, name, protein, carbs, fat, calories, brand, category, sub_category, diet_kind, created_at, updated_at",
      )
      .eq("user_id", userId)
      .abortSignal(signal),
  );
  if (error) throw asError(error, "pull custom foods");
  if (!data) return;
  for (const row of data as CustomFoodRow[]) {
    await upsertCustomFood(customFoodFromRow(row));
    result.pulled.customFoods++;
  }
}

async function pullMealTemplates(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const { data, error } = await withTimeout("pull meal templates", (signal) =>
    supabase
      .from("meal_templates")
      .select("id, user_id, name, foods, created_at, updated_at")
      .eq("user_id", userId)
      .abortSignal(signal),
  );
  if (error) throw asError(error, "pull meal templates");
  if (!data) return;
  for (const row of data as MealTemplateRow[]) {
    await upsertMealTemplate(mealTemplateFromRow(row));
    result.pulled.mealTemplates++;
  }
}

async function pullRecipes(
  supabase: SupabaseClient,
  userId: string,
  result: SyncResult,
) {
  const { data, error } = await withTimeout("pull recipes", (signal) =>
    supabase
      .from("recipes")
      .select(
        "id, user_id, name, ingredients, cuisine, notes, created_at, updated_at",
      )
      .eq("user_id", userId)
      .abortSignal(signal),
  );
  if (error) throw asError(error, "pull recipes");
  if (!data) return;
  for (const row of data as RecipeRow[]) {
    await upsertRecipe(recipeFromRow(row));
    result.pulled.recipes++;
  }
}
