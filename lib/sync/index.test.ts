import * as db from "@/lib/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pushCustomFoods, pushMealTemplates, type SyncResult } from "./index";

// Mock the IDB-backed db module so the sync code is exercised in
// isolation. Each test seeds the mocks with the rows it wants `list*`
// to return; assertions on `mark*Synced` / `upsert*` / `delete*`
// verify the per-row side effects.
vi.mock("@/lib/db", () => ({
  listCustomFoods: vi.fn(),
  listDailyLogs: vi.fn(),
  listMealTemplates: vi.fn(),
  listRecipes: vi.fn(),
  listWeightEntries: vi.fn(),
  getProfileRecord: vi.fn(),
  applyServerCustomFood: vi.fn(),
  applyServerDailyLog: vi.fn(),
  applyServerMealTemplate: vi.fn(),
  applyServerProfile: vi.fn(),
  applyServerRecipe: vi.fn(),
  applyServerWeightEntry: vi.fn(),
  markCustomFoodSynced: vi.fn(),
  markDailyLogSynced: vi.fn(),
  markMealTemplateSynced: vi.fn(),
  markProfileSynced: vi.fn(),
  markRecipeSynced: vi.fn(),
  markWeightEntrySynced: vi.fn(),
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
    conflicts: 0,
  };
}

/** Build a Supabase-shaped mock that captures the call chain so each
 *  test can assert what the push pipeline did. The new push path goes
 *  through one of two chains depending on whether the row has a
 *  serverUpdatedAt token:
 *
 *    - No token (insert):
 *      from(t).upsert(row).select("updated_at").abortSignal(sig).single()
 *
 *    - Has token (update with version check):
 *      from(t).update(row).eq(pk1).eq(pk2)…
 *        .eq("updated_at", base).select("updated_at").abortSignal(sig).maybeSingle()
 *
 *  Both terminate at a Promise<{ data, error }>. The mock takes
 *  per-operation handlers and a global call log. */
type OpResult = { data: unknown; error: unknown };

function makeSupabase(opts: {
  upsert?: (row: unknown) => OpResult;
  update?: (
    row: unknown,
    pkFields: Record<string, unknown>,
    base: string,
  ) => OpResult;
}) {
  const upsertCalls: unknown[] = [];
  const updateCalls: Array<{
    row: unknown;
    pkFields: Record<string, unknown>;
    base: string;
  }> = [];

  const sb = {
    from: () => ({
      upsert: (row: unknown) => {
        upsertCalls.push(row);
        const r = opts.upsert
          ? opts.upsert(row)
          : { data: { updated_at: "2026-05-16T12:00:00Z" }, error: null };
        return {
          select: () => ({
            abortSignal: () => ({ single: () => Promise.resolve(r) }),
          }),
        };
      },
      update: (row: unknown) => {
        const pkFields: Record<string, unknown> = {};
        let base: string = "";
        const filterBuilder = {
          eq: (k: string, v: unknown) => {
            if (k === "updated_at") {
              base = v as string;
            } else {
              pkFields[k] = v;
            }
            return filterBuilder;
          },
          select: () => ({
            abortSignal: () => ({
              maybeSingle: () => {
                updateCalls.push({ row, pkFields, base });
                const r = opts.update
                  ? opts.update(row, pkFields, base)
                  : {
                      data: { updated_at: "2026-05-16T12:01:00Z" },
                      error: null,
                    };
                return Promise.resolve(r);
              },
            }),
          }),
        };
        return filterBuilder;
      },
    }),
  } as unknown as SupabaseClient;

  return { sb, upsertCalls, updateCalls };
}

describe("pushCustomFoods — per-row push with optimistic concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("INSERTs each new (no server token) row and marks it synced", async () => {
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
    const { sb, upsertCalls } = makeSupabase({});
    const result = newResult();

    await pushCustomFoods(sb, USER_ID, result);

    expect(result.pushed.customFoods).toBe(2);
    expect(result.conflicts).toBe(0);
    expect(upsertCalls).toHaveLength(2);
    expect(vi.mocked(db.markCustomFoodSynced)).toHaveBeenCalledTimes(2);
  });

  it("UPDATEs each existing (server token present) row with .eq('updated_at', base)", async () => {
    vi.mocked(db.listCustomFoods).mockResolvedValue([
      {
        id: "a",
        name: "Tofu",
        protein: 8,
        carbs: 2,
        fat: 4,
        calories: 76,
        createdAt: 0,
        localUpdatedAt: "2026-05-16T13:00:00Z",
        serverUpdatedAt: "2026-05-16T12:00:00Z",
      },
    ]);
    const { sb, updateCalls } = makeSupabase({});
    const result = newResult();

    await pushCustomFoods(sb, USER_ID, result);

    expect(result.pushed.customFoods).toBe(1);
    expect(updateCalls).toHaveLength(1);
    // The version-check filter must carry the row's old serverUpdatedAt.
    expect(updateCalls[0].base).toBe("2026-05-16T12:00:00Z");
    expect(updateCalls[0].pkFields).toEqual({ id: "a" });
  });

  it("treats zero rows affected (stale base) as a CONFLICT and increments counter", async () => {
    vi.mocked(db.listCustomFoods).mockResolvedValue([
      {
        id: "a",
        name: "Tofu",
        protein: 8,
        carbs: 2,
        fat: 4,
        calories: 76,
        createdAt: 0,
        localUpdatedAt: "2026-05-16T13:00:00Z",
        serverUpdatedAt: "2026-05-16T12:00:00Z",
      },
    ]);
    const { sb } = makeSupabase({
      // Simulate "another device pushed first" — Postgres returns 0
      // rows because our base no longer matches the row's updated_at.
      update: () => ({ data: null, error: null }),
    });
    const result = newResult();

    await pushCustomFoods(sb, USER_ID, result);

    expect(result.pushed.customFoods).toBe(0);
    expect(result.conflicts).toBe(1);
    expect(vi.mocked(db.markCustomFoodSynced)).not.toHaveBeenCalled();
  });

  it("skips clean rows (localUpdatedAt === serverUpdatedAt) to avoid no-op pushes", async () => {
    vi.mocked(db.listCustomFoods).mockResolvedValue([
      {
        id: "a",
        name: "Tofu",
        protein: 8,
        carbs: 2,
        fat: 4,
        calories: 76,
        createdAt: 0,
        localUpdatedAt: "2026-05-16T12:00:00Z",
        serverUpdatedAt: "2026-05-16T12:00:00Z",
      },
    ]);
    const { sb, upsertCalls, updateCalls } = makeSupabase({});
    const result = newResult();

    await pushCustomFoods(sb, USER_ID, result);

    expect(result.pushed.customFoods).toBe(0);
    expect(upsertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("returns silently when there are no local rows", async () => {
    vi.mocked(db.listCustomFoods).mockResolvedValue([]);
    const { sb, upsertCalls, updateCalls } = makeSupabase({});
    const result = newResult();

    await pushCustomFoods(sb, USER_ID, result);

    expect(result.pushed.customFoods).toBe(0);
    expect(upsertCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("re-mints colliding UUIDs on 42501 and retries (RLS row-owned-by-another-user recovery)", async () => {
    vi.mocked(db.listCustomFoods).mockResolvedValue([
      {
        id: "collides",
        name: "Tofu",
        protein: 8,
        carbs: 2,
        fat: 4,
        calories: 76,
        createdAt: 0,
      },
    ]);
    let firstAttempt = true;
    const { sb } = makeSupabase({
      upsert: () => {
        if (firstAttempt) {
          firstAttempt = false;
          // First UUID collides with another user's row → 42501.
          return { data: null, error: { code: "42501" } };
        }
        // Retry with re-minted UUID succeeds.
        return { data: { updated_at: "2026-05-16T12:00:00Z" }, error: null };
      },
    });
    const result = newResult();

    await pushCustomFoods(sb, USER_ID, result);

    expect(result.pushed.customFoods).toBe(1);
    expect(vi.mocked(db.upsertCustomFood)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.deleteCustomFood)).toHaveBeenCalledWith("collides");
  });

  it("rethrows non-42501 errors instead of swallowing them", async () => {
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
    const { sb } = makeSupabase({
      upsert: () => ({
        data: null,
        error: { code: "23505", message: "duplicate key" },
      }),
    });
    const result = newResult();

    await expect(pushCustomFoods(sb, USER_ID, result)).rejects.toThrow(
      /duplicate key/,
    );
  });
});

describe("pushMealTemplates — same per-row semantics as customFoods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-mints colliding UUIDs on 42501 and retries", async () => {
    vi.mocked(db.listMealTemplates).mockResolvedValue([
      {
        id: "collides",
        name: "Greek bowl",
        foods: [],
        createdAt: 0,
        updatedAt: 0,
      },
    ]);
    let firstAttempt = true;
    const { sb } = makeSupabase({
      upsert: () => {
        if (firstAttempt) {
          firstAttempt = false;
          return { data: null, error: { code: "42501" } };
        }
        return { data: { updated_at: "2026-05-16T12:00:00Z" }, error: null };
      },
    });
    const result = newResult();

    await pushMealTemplates(sb, USER_ID, result);

    expect(result.pushed.mealTemplates).toBe(1);
    expect(vi.mocked(db.upsertMealTemplate)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.deleteMealTemplate)).toHaveBeenCalledWith("collides");
  });
});
