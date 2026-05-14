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
  dietPreference: "omnivore",
  cuisinePreferences: [],
  allergies: [],
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

  it("inserts a record and returns its client-minted UUID", async () => {
    const { addCustomFood, listCustomFoods } = await freshDb();
    const id = await addCustomFood({
      name: "Whey",
      protein: 80,
      carbs: 8,
      fat: 2,
      calories: 370,
    });
    expect(typeof id).toBe("string");
    // UUID format check (8-4-4-4-12).
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const rows = await listCustomFoods();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].name).toBe("Whey");
    expect(rows[0].createdAt).toBeGreaterThan(0);
  });

  it("addCustomFood mints distinct UUIDs across calls", async () => {
    const { addCustomFood } = await freshDb();
    const a = await addCustomFood({
      name: "A",
      protein: 1,
      carbs: 1,
      fat: 1,
      calories: 17,
    });
    const b = await addCustomFood({
      name: "B",
      protein: 1,
      carbs: 1,
      fat: 1,
      calories: 17,
    });
    expect(a).not.toBe(b);
  });

  it("upsertCustomFood writes at a caller-supplied id (used by sync)", async () => {
    const { upsertCustomFood, listCustomFoods } = await freshDb();
    await upsertCustomFood({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Whey from server",
      protein: 80,
      carbs: 8,
      fat: 2,
      calories: 370,
      createdAt: Date.now(),
    });
    const rows = await listCustomFoods();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("00000000-0000-4000-8000-000000000001");
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
    expect(typeof id).toBe("string");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

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

  it("saveMealTemplate returns a UUID and mints distinct values", async () => {
    const { saveMealTemplate } = await freshDb();
    const a = await saveMealTemplate({
      name: "A",
      foods: SAMPLE_MEALS[0].foods,
    });
    const b = await saveMealTemplate({
      name: "B",
      foods: SAMPLE_MEALS[0].foods,
    });
    expect(a).not.toBe(b);
    expect(typeof a).toBe("string");
  });

  it("upsertMealTemplate writes at a caller-supplied id (used by sync)", async () => {
    const { upsertMealTemplate, listMealTemplates } = await freshDb();
    await upsertMealTemplate({
      id: "11111111-1111-4111-8111-111111111111",
      name: "From server",
      foods: SAMPLE_MEALS[0].foods,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const rows = await listMealTemplates();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("11111111-1111-4111-8111-111111111111");
  });
});

describe("weight history", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("round-trips an entry through save + get", async () => {
    const { saveWeightEntry, getWeightEntry } = await freshDb();
    await saveWeightEntry("2026-05-13", 70.5);
    const row = await getWeightEntry("2026-05-13");
    expect(row?.date).toBe("2026-05-13");
    expect(row?.kg).toBe(70.5);
    expect(row?.recordedAt).toBeGreaterThan(0);
  });

  it("returns null for a date with no entry", async () => {
    const { getWeightEntry } = await freshDb();
    expect(await getWeightEntry("2026-01-01")).toBeNull();
  });

  it("overwrites on same-day save (latest wins)", async () => {
    const { saveWeightEntry, getWeightEntry, listWeightEntries } =
      await freshDb();
    await saveWeightEntry("2026-05-13", 70);
    await saveWeightEntry("2026-05-13", 71);
    expect((await getWeightEntry("2026-05-13"))?.kg).toBe(71);
    expect(await listWeightEntries()).toHaveLength(1);
  });

  it("listWeightEntries orders chronologically (oldest first)", async () => {
    const { saveWeightEntry, listWeightEntries } = await freshDb();
    await saveWeightEntry("2026-05-15", 72);
    await saveWeightEntry("2026-05-13", 70);
    await saveWeightEntry("2026-05-14", 71);
    const rows = await listWeightEntries();
    expect(rows.map((r) => r.date)).toEqual([
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
    ]);
  });

  it("deleteWeightEntry removes the record", async () => {
    const { saveWeightEntry, deleteWeightEntry, listWeightEntries } =
      await freshDb();
    await saveWeightEntry("2026-05-13", 70);
    await deleteWeightEntry("2026-05-13");
    expect(await listWeightEntries()).toHaveLength(0);
  });
});

describe("clearAllStores", () => {
  beforeEach(async () => {
    await freshDb();
  });

  it("empties every store in one shot", async () => {
    const db = await freshDb();
    await db.saveProfile(BASELINE_PROFILE);
    await db.saveDailyLog("2026-05-13", SAMPLE_MEALS);
    await db.saveWeightEntry("2026-05-13", 70);
    await db.addCustomFood({
      name: "Whey",
      protein: 80,
      carbs: 8,
      fat: 2,
      calories: 370,
    });
    await db.saveMealTemplate({
      name: "Oats bowl",
      foods: SAMPLE_MEALS[0].foods,
    });

    await db.clearAllStores();

    expect(await db.getProfile()).toBeNull();
    expect(await db.listDailyLogs()).toHaveLength(0);
    expect(await db.listWeightEntries()).toHaveLength(0);
    expect(await db.listCustomFoods()).toHaveLength(0);
    expect(await db.listMealTemplates()).toHaveLength(0);
  });

  it("is idempotent — running on an already-empty DB is a no-op", async () => {
    const { clearAllStores, listCustomFoods } = await freshDb();
    await clearAllStores();
    await clearAllStores();
    expect(await listCustomFoods()).toHaveLength(0);
  });
});
