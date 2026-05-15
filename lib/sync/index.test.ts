import * as db from "@/lib/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushCustomFoods, pushMealTemplates, type SyncResult } from "./index";

// Mock the IDB-backed db module so the sync code is exercised in
// isolation. Each test seeds the mocks with the rows it wants `list*`
// to return; assertions on `upsertCustomFood`/`deleteCustomFood` verify
// the re-mint side effect.
vi.mock("@/lib/db", () => ({
  listCustomFoods: vi.fn(),
  listDailyLogs: vi.fn(),
  listMealTemplates: vi.fn(),
  listRecipes: vi.fn(),
  listWeightEntries: vi.fn(),
  getProfile: vi.fn(),
  saveDailyLog: vi.fn(),
  saveProfile: vi.fn(),
  saveWeightEntry: vi.fn(),
  upsertCustomFood: vi.fn(),
  upsertMealTemplate: vi.fn(),
  upsertRecipe: vi.fn(),
  deleteCustomFood: vi.fn(),
  deleteMealTemplate: vi.fn(),
  deleteRecipe: vi.fn(),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";

function newResult(): SyncResult {
  return {
    pushed: {
      profile: 0,
      dailyLogs: 0,
      weightEntries: 0,
      customFoods: 0,
      mealTemplates: 0,
      recipes: 0,
    },
    pulled: {
      profile: 0,
      dailyLogs: 0,
      weightEntries: 0,
      customFoods: 0,
      mealTemplates: 0,
      recipes: 0,
    },
  };
}

/** Build a tiny Supabase-shaped mock that captures upsert calls and
 * returns whatever the test queues. The real client's `.from(t).upsert(rows)`
 * returns a thenable resolving to `{ error }`; we just return a Promise. */
function makeSupabase(upsert: ReturnType<typeof vi.fn>) {
  return { from: () => ({ upsert }) } as unknown as SupabaseClient;
}

describe("pushCustomFoods — happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts the batch in one shot when there's no collision", async () => {
    vi.mocked(db.listCustomFoods).mockResolvedValue([
      {
        id: "a",
        name: "Tofu",
        protein: 8,
        carbs: 2,
        fat: 4,
        calories: 76,
        createdAt: 0,
      },
      {
        id: "b",
        name: "Oats",
        protein: 13,
        carbs: 67,
        fat: 7,
        calories: 389,
        createdAt: 0,
      },
    ]);
    const upsert = vi.fn().mockResolvedValueOnce({ error: null });
    const supabase = makeSupabase(upsert);
    const result = newResult();

    await pushCustomFoods(supabase, USER_ID, result);

    expect(result.pushed.customFoods).toBe(2);
    // One batch call, no per-row fallback, no re-mint.
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(db.upsertCustomFood).not.toHaveBeenCalled();
    expect(db.deleteCustomFood).not.toHaveBeenCalled();
  });

  it("returns silently when there are no local rows", async () => {
    vi.mocked(db.listCustomFoods).mockResolvedValue([]);
    const upsert = vi.fn();
    const supabase = makeSupabase(upsert);
    const result = newResult();

    await pushCustomFoods(supabase, USER_ID, result);

    expect(result.pushed.customFoods).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("pushCustomFoods — UUID-collision recovery on 42501", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to per-row upserts and re-mints UUIDs that collide", async () => {
    vi.mocked(db.listCustomFoods).mockResolvedValue([
      {
        id: "owned-uuid",
        name: "Tofu",
        protein: 8,
        carbs: 2,
        fat: 4,
        calories: 76,
        createdAt: 0,
      },
      {
        id: "foreign-uuid",
        name: "Oats",
        protein: 13,
        carbs: 67,
        fat: 7,
        calories: 389,
        createdAt: 0,
      },
    ]);

    // Stub crypto.randomUUID so the new id is predictable.
    const newId = "fresh-uuid";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      newId as `${string}-${string}-${string}-${string}-${string}`,
    );

    const upsert = vi.fn();
    // Call 1 — batch upsert hits 42501 (one of the rows collides with a
    // foreign-owned remote row).
    upsert.mockResolvedValueOnce({ error: { code: "42501", message: "RLS" } });
    // Call 2 — single upsert for "owned-uuid" succeeds (user owns it).
    upsert.mockResolvedValueOnce({ error: null });
    // Call 3 — single upsert for "foreign-uuid" hits 42501 (foreign-owned).
    upsert.mockResolvedValueOnce({ error: { code: "42501", message: "RLS" } });
    // Call 4 — re-mint retry for the foreign-uuid food (now under newId)
    // succeeds because the UUID is fresh and there's no collision.
    upsert.mockResolvedValueOnce({ error: null });

    const supabase = makeSupabase(upsert);
    const result = newResult();

    await pushCustomFoods(supabase, USER_ID, result);

    expect(result.pushed.customFoods).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(4);

    // The colliding row got re-minted: new id was upserted to IDB and the
    // old id was deleted. Owned row was untouched in IDB.
    expect(db.upsertCustomFood).toHaveBeenCalledTimes(1);
    expect(db.upsertCustomFood).toHaveBeenCalledWith(
      expect.objectContaining({ id: newId, name: "Oats" }),
    );
    expect(db.deleteCustomFood).toHaveBeenCalledWith("foreign-uuid");
  });

  it("rethrows non-42501 errors from the batch upsert (don't paper over real bugs)", async () => {
    vi.mocked(db.listCustomFoods).mockResolvedValue([
      {
        id: "a",
        name: "Tofu",
        protein: 8,
        carbs: 2,
        fat: 4,
        calories: 76,
        createdAt: 0,
      },
    ]);
    const upsert = vi
      .fn()
      .mockResolvedValueOnce({
        error: { code: "23505", message: "duplicate key" },
      });
    const supabase = makeSupabase(upsert);
    const result = newResult();

    await expect(pushCustomFoods(supabase, USER_ID, result)).rejects.toThrow(
      /push custom foods.*duplicate key/,
    );
    expect(db.upsertCustomFood).not.toHaveBeenCalled();
  });

  it("rethrows non-42501 errors hit during the per-row fallback", async () => {
    vi.mocked(db.listCustomFoods).mockResolvedValue([
      {
        id: "a",
        name: "Tofu",
        protein: 8,
        carbs: 2,
        fat: 4,
        calories: 76,
        createdAt: 0,
      },
    ]);
    const upsert = vi.fn();
    upsert.mockResolvedValueOnce({ error: { code: "42501", message: "RLS" } });
    upsert.mockResolvedValueOnce({
      error: { code: "23502", message: "not null violation" },
    });
    const supabase = makeSupabase(upsert);
    const result = newResult();

    await expect(pushCustomFoods(supabase, USER_ID, result)).rejects.toThrow(
      /push custom foods \(per-row\).*not null violation/,
    );
  });
});

describe("pushMealTemplates — UUID-collision recovery on 42501", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-mints colliding meal_templates UUIDs the same way custom_foods does", async () => {
    vi.mocked(db.listMealTemplates).mockResolvedValue([
      {
        id: "foreign-tpl-id",
        name: "Greek bowl",
        foods: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ]);

    const newId = "fresh-tpl-id";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      newId as `${string}-${string}-${string}-${string}-${string}`,
    );

    const upsert = vi.fn();
    upsert.mockResolvedValueOnce({ error: { code: "42501", message: "RLS" } });
    upsert.mockResolvedValueOnce({ error: { code: "42501", message: "RLS" } });
    upsert.mockResolvedValueOnce({ error: null });

    const supabase = makeSupabase(upsert);
    const result = newResult();

    await pushMealTemplates(supabase, USER_ID, result);

    expect(result.pushed.mealTemplates).toBe(1);
    expect(db.upsertMealTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: newId, name: "Greek bowl" }),
    );
    expect(db.deleteMealTemplate).toHaveBeenCalledWith("foreign-tpl-id");
  });
});
