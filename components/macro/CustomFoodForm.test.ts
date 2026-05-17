import { describe, expect, it } from "vitest";
import { validateBreakdown } from "./CustomFoodForm";

const EMPTY = {
  carbs: 0,
  fat: 0,
  sugars: "" as const,
  addedSugars: "" as const,
  fiber: "" as const,
  saturatedFat: "" as const,
  transFat: "" as const,
  monoFat: "" as const,
  polyFat: "" as const,
};

describe("validateBreakdown — sub-macros vs total macros invariants", () => {
  it("passes when all sub-macros are empty (the default for most foods)", () => {
    expect(validateBreakdown({ ...EMPTY, carbs: 30, fat: 5 })).toBeNull();
  });

  it("rejects sugars > carbs (the user's example: 20g carbs / 50g sugars)", () => {
    const err = validateBreakdown({ ...EMPTY, carbs: 20, sugars: 50 });
    expect(err).toMatch(/Sugars/);
    expect(err).toMatch(/carbs/);
  });

  it("rejects sugars + fiber > carbs (both subsets of total carbs)", () => {
    const err = validateBreakdown({
      ...EMPTY,
      carbs: 30,
      sugars: 20,
      fiber: 15,
    });
    expect(err).toMatch(/Sugars/);
  });

  it("rejects added sugars > total sugars (added is a subset of total)", () => {
    const err = validateBreakdown({
      ...EMPTY,
      carbs: 80,
      sugars: 20,
      addedSugars: 30,
    });
    expect(err).toMatch(/Added sugars/);
    expect(err).toMatch(/total sugars/);
  });

  it("rejects added sugars when total sugars wasn't set (the user's other example)", () => {
    const err = validateBreakdown({ ...EMPTY, carbs: 80, addedSugars: 200 });
    expect(err).toMatch(/total sugars/);
    expect(err).toMatch(/first/);
  });

  it("rejects fat subtypes summing over total fat", () => {
    const err = validateBreakdown({
      ...EMPTY,
      fat: 10,
      saturatedFat: 4,
      transFat: 1,
      monoFat: 4,
      polyFat: 3, // 4+1+4+3 = 12 > 10
    });
    expect(err).toMatch(/Saturated/);
    expect(err).toMatch(/total fat/);
  });

  it("tolerates ≤ 0.5 g label-rounding overshoot", () => {
    // 12 + 4 = 16 — just barely over the 15 g carbs, within tolerance.
    expect(
      validateBreakdown({ ...EMPTY, carbs: 15, sugars: 12, fiber: 3.4 }),
    ).toBeNull();
    // 16.6 vs 15 → over tolerance → rejected.
    expect(
      validateBreakdown({ ...EMPTY, carbs: 15, sugars: 12, fiber: 4.6 }),
    ).not.toBeNull();
  });

  it("accepts the common case: a few sub-macros set, others empty", () => {
    expect(
      validateBreakdown({
        ...EMPTY,
        carbs: 50,
        fat: 10,
        sugars: 15,
        fiber: 5,
        saturatedFat: 3,
      }),
    ).toBeNull();
  });
});
