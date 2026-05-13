/**
 * @vitest-environment jsdom
 */
import type { Meal, PersonalInfo } from "@/components/macro/types";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function freshDb() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  return await import("./db");
}

const BASELINE_PROFILE: PersonalInfo = {
  gender: "male",
  age: 30,
  weight: 70,
  height: 175,
  activityLevel: "moderate",
  goal: "maintain",
  dietType: "balanced",
  weeklyRateKg: 0.5,
  manualTdee: null,
};

const SAMPLE_MEALS: Meal[] = [
  {
    id: 1,
    name: "Breakfast",
    foods: [
      {
        id: 1,
        name: "Oats",
        protein: 13,
        carbs: 67,
        fat: 7,
        calories: 389,
        portionSize: 100,
      },
    ],
  },
  { id: 2, name: "Lunch", foods: [] },
  { id: 3, name: "Dinner", foods: [] },
  { id: 4, name: "Snacks", foods: [] },
];

describe("addCustomFood", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("inserts a record and returns its auto-assigned id", async () => {
    const { addCustomFood, listCustomFoods } = await freshDb();
    const id = await addCustomFood({
      name: "Whey",
      protein: 80,
      carbs: 8,
      fat: 2,
      calories: 370,
    });
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);

    const rows = await listCustomFoods();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].name).toBe("Whey");
    expect(rows[0].createdAt).toBeGreaterThan(0);
  });

  it("does not crash on the IndexedDB keyPath when id is unspecified", async () => {
    // Regression: previously the call site passed `id: undefined` which
    // IndexedDB rejects as 'not a valid key' for a keyPath store with
    // autoIncrement. https://w3c.github.io/IndexedDB/#extract-a-key-from-a-value-using-a-key-path
    const { addCustomFood } = await freshDb();
    await expect(
      addCustomFood({
        name: "Oats",
        protein: 13,
        carbs: 67,
        fat: 7,
        calories: 389,
      }),
    ).resolves.toBeTypeOf("number");
  });

  it("supports searching by case-insensitive substring", async () => {
    const { addCustomFood, searchCustomFoods } = await freshDb();
    await addCustomFood({
      name: "Greek Yogurt",
      protein: 10,
      carbs: 3.6,
      fat: 0.4,
      calories: 59,
    });
    await addCustomFood({
      name: "Cottage Cheese",
      protein: 11,
      carbs: 3.4,
      fat: 4.3,
      calories: 98,
    });
    const hits = await searchCustomFoods("yogurt");
    expect(hits).toHaveLength(1);
    expect(hits[0].name).toBe("Greek Yogurt");
    expect(hits[0].source).toBe("custom");
  });

  it("orders listCustomFoods newest-first", async () => {
    const { addCustomFood, listCustomFoods } = await freshDb();
    const a = await addCustomFood({
      name: "A",
      protein: 1,
      carbs: 1,
      fat: 1,
      calories: 17,
    });
    await new Promise((r) => setTimeout(r, 5));
    const b = await addCustomFood({
      name: "B",
      protein: 1,
      carbs: 1,
      fat: 1,
      calories: 17,
    });
    const rows = await listCustomFoods();
    expect(rows.map((r) => r.id)).toEqual([b, a]);
  });
});

describe("profile", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("returns null before any profile is saved", async () => {
    const { getProfile } = await freshDb();
    expect(await getProfile()).toBeNull();
  });

  it("round-trips a profile through saveProfile + getProfile", async () => {
    const { getProfile, saveProfile } = await freshDb();
    await saveProfile(BASELINE_PROFILE);
    const loaded = await getProfile();
    expect(loaded).toEqual(BASELINE_PROFILE);
  });

  it("does not expose the internal `_key` field on read", async () => {
    const { getProfile, saveProfile } = await freshDb();
    await saveProfile(BASELINE_PROFILE);
    const loaded = await getProfile();
    expect(loaded).not.toHaveProperty("_key");
  });

  it("overwrites on second saveProfile (single record)", async () => {
    const { getProfile, saveProfile } = await freshDb();
    await saveProfile(BASELINE_PROFILE);
    await saveProfile({ ...BASELINE_PROFILE, weight: 75 });
    const loaded = await getProfile();
    expect(loaded?.weight).toBe(75);
  });
});

describe("daily logs", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("returns null for a day with no log", async () => {
    const { getDailyLog } = await freshDb();
    expect(await getDailyLog("2026-01-01")).toBeNull();
  });

  it("round-trips a log", async () => {
    const { getDailyLog, saveDailyLog } = await freshDb();
    await saveDailyLog("2026-05-13", SAMPLE_MEALS);
    const loaded = await getDailyLog("2026-05-13");
    expect(loaded?.date).toBe("2026-05-13");
    expect(loaded?.meals).toEqual(SAMPLE_MEALS);
    expect(loaded?.updatedAt).toBeGreaterThan(0);
  });

  it("uses the date as the key (overwrites on same-day save)", async () => {
    const { getDailyLog, saveDailyLog, listDailyLogs } = await freshDb();
    await saveDailyLog("2026-05-13", SAMPLE_MEALS);
    await saveDailyLog("2026-05-13", []);
    expect(await listDailyLogs()).toHaveLength(1);
    const loaded = await getDailyLog("2026-05-13");
    expect(loaded?.meals).toEqual([]);
  });

  it("orders listDailyLogs newest-first", async () => {
    const { saveDailyLog, listDailyLogs } = await freshDb();
    await saveDailyLog("2026-05-11", []);
    await saveDailyLog("2026-05-13", []);
    await saveDailyLog("2026-05-12", []);
    const rows = await listDailyLogs();
    expect(rows.map((r) => r.date)).toEqual([
      "2026-05-13",
      "2026-05-12",
      "2026-05-11",
    ]);
  });

  it("dateKey produces ISO YYYY-MM-DD in local timezone", async () => {
    const { dateKey } = await freshDb();
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05"); // month is 0-indexed
    expect(dateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("meal templates", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("round-trips a template through save + list", async () => {
    const { saveMealTemplate, listMealTemplates } = await freshDb();
    const foods = SAMPLE_MEALS[0].foods;
    const id = await saveMealTemplate({ name: "Oats bowl", foods });
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);

    const rows = await listMealTemplates();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].name).toBe("Oats bowl");
    expect(rows[0].foods).toEqual(foods);
    expect(rows[0].createdAt).toBeGreaterThan(0);
    expect(rows[0].updatedAt).toBe(rows[0].createdAt);
  });

  it("orders listMealTemplates newest-first", async () => {
    const { saveMealTemplate, listMealTemplates } = await freshDb();
    const a = await saveMealTemplate({
      name: "A",
      foods: SAMPLE_MEALS[0].foods,
    });
    await new Promise((r) => setTimeout(r, 5));
    const b = await saveMealTemplate({
      name: "B",
      foods: SAMPLE_MEALS[0].foods,
    });
    const rows = await listMealTemplates();
    expect(rows.map((r) => r.id)).toEqual([b, a]);
  });

  it("deleteMealTemplate removes the record", async () => {
    const { saveMealTemplate, listMealTemplates, deleteMealTemplate } =
      await freshDb();
    const id = await saveMealTemplate({
      name: "Doomed",
      foods: SAMPLE_MEALS[0].foods,
    });
    await deleteMealTemplate(id);
    expect(await listMealTemplates()).toHaveLength(0);
  });

  it("does not crash on the IndexedDB keyPath when id is unspecified", async () => {
    // Same regression class as customFoods — verify the autoIncrement
    // path doesn't see an explicit undefined.
    const { saveMealTemplate } = await freshDb();
    await expect(
      saveMealTemplate({ name: "Smoke", foods: SAMPLE_MEALS[0].foods }),
    ).resolves.toBeTypeOf("number");
  });
});
