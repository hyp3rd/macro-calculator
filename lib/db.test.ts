/**
 * @vitest-environment jsdom
 */
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Replace the global IDB factory with a fresh one and re-import the
 * module under test so its cached `dbPromise` is gone. The `auto` import
 * above installs IDBRequest/IDBOpenDBRequest/etc. on globalThis. */
async function freshDb() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  return await import("./db");
}

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
