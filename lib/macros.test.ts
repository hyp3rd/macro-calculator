import type { PersonalInfo } from "@/components/macro/types";
import { describe, expect, it } from "vitest";
import { computeMacros } from "./macros";

const baseline: PersonalInfo = {
  gender: "male",
  age: 30,
  weight: 70,
  height: 175,
  activityLevel: "moderate",
  goal: "maintain",
  dietType: "balanced",
  weeklyRateKg: 0,
};

describe("computeMacros", () => {
  it("matches the canonical Mifflin-St Jeor example", () => {
    // Male 30yo 70kg 175cm moderate (1.55), maintain.
    // BMR = 10*70 + 6.25*175 - 5*30 + 5 = 1648.75
    // TDEE = BMR × 1.55 = 2555.5
    const r = computeMacros(baseline);
    expect(r.bmr).toBe(1649);
    expect(r.tdee).toBe(2556);
    expect(r.targetCalories).toBe(r.tdee); // maintain → no offset
    expect(r.dailyDelta).toBe(0);
  });

  it("applies the kg/week deficit symmetrically", () => {
    const lose = computeMacros({
      ...baseline,
      goal: "lose",
      weeklyRateKg: 0.5,
    });
    // 0.5 kg/week × 7700 / 7 ≈ -550 kcal/day
    expect(lose.dailyDelta).toBeLessThan(-540);
    expect(lose.dailyDelta).toBeGreaterThan(-560);

    const gain = computeMacros({
      ...baseline,
      goal: "gain",
      weeklyRateKg: 0.5,
    });
    expect(gain.dailyDelta).toBeGreaterThan(540);
    expect(gain.dailyDelta).toBeLessThan(560);
  });

  it("caps the rate at 1% of bodyweight per week", () => {
    // 70kg user requests 2 kg/week — should clamp to 0.7 kg/week.
    const r = computeMacros({ ...baseline, goal: "lose", weeklyRateKg: 2 });
    // 0.7 × 7700 / 7 = 770
    expect(r.dailyDelta).toBeGreaterThan(-790);
    expect(r.dailyDelta).toBeLessThan(-750);
  });

  it("floors calories at max(BMR, 1200)", () => {
    // Tiny user, aggressive deficit → would drop below BMR without floor.
    const r = computeMacros({
      ...baseline,
      weight: 45, // BMR ≈ 1304
      goal: "lose",
      weeklyRateKg: 0.45, // cap is 0.45 kg/week
    });
    // requested ≈ -495; raw target = TDEE(~2020) - 495 = 1525 — still above BMR.
    expect(r.targetCalories).toBeGreaterThanOrEqual(r.bmr);
    expect(r.targetCalories).toBeGreaterThanOrEqual(1200);

    // Extreme case: large deficit + small TDEE.
    const aggressive = computeMacros({
      ...baseline,
      weight: 45,
      activityLevel: "sedentary",
      goal: "lose",
      weeklyRateKg: 0.45,
    });
    expect(aggressive.targetCalories).toBe(Math.max(aggressive.bmr, 1200));
    // dailyDelta in this case is post-floor (what actually happens),
    // requestedDelta is what was asked for before floor.
    expect(aggressive.dailyDelta).not.toBe(aggressive.requestedDelta);
  });

  it("derives per-macro targets that sum (approximately) to total kcal", () => {
    const r = computeMacros({ ...baseline, goal: "lose", weeklyRateKg: 0.5 });
    const kcal = r.protein * 4 + r.carbs * 4 + r.fat * 9;
    // Rounding error within ±10 kcal per macro is expected.
    expect(Math.abs(kcal - r.targetCalories)).toBeLessThan(30);
  });

  it("shifts the macro split based on goal", () => {
    const lose = computeMacros({
      ...baseline,
      goal: "lose",
      weeklyRateKg: 0.5,
    });
    // Lose → 40% protein, higher than maintain's 30%.
    const proteinFraction = (lose.protein * 4) / lose.targetCalories;
    expect(proteinFraction).toBeGreaterThan(0.35);

    const gain = computeMacros({
      ...baseline,
      goal: "gain",
      weeklyRateKg: 0.5,
    });
    // Gain → 45% carbs.
    const carbFraction = (gain.carbs * 4) / gain.targetCalories;
    expect(carbFraction).toBeGreaterThan(0.4);
  });

  it("handles female BMR offset", () => {
    const r = computeMacros({ ...baseline, gender: "female" });
    // Male BMR was 1649, female differs by -166 (male: +5 vs female: -161).
    expect(r.bmr).toBe(1483);
  });

  it("uses manualTdee when provided (overrides BMR × activity)", () => {
    const formula = computeMacros({
      ...baseline,
      activityLevel: "active",
      goal: "lose",
      weeklyRateKg: 0.5,
    });
    // Same inputs but pinning TDEE 400 below the formula estimate.
    const overridden = computeMacros({
      ...baseline,
      activityLevel: "active",
      goal: "lose",
      weeklyRateKg: 0.5,
      manualTdee: formula.tdee - 400,
    });
    expect(overridden.tdee).toBe(formula.tdee - 400);
    // Deficit is preserved; target shifts down by the same 400.
    expect(overridden.targetCalories).toBe(formula.targetCalories - 400);
    expect(overridden.dailyDelta).toBe(formula.dailyDelta);
  });

  it("ignores manualTdee when null, undefined, zero, or negative", () => {
    const expected = computeMacros(baseline).tdee;
    for (const v of [null, undefined, 0, -100]) {
      const r = computeMacros({ ...baseline, manualTdee: v });
      expect(r.tdee).toBe(expected);
    }
  });

  it("respects the safety floor when manualTdee + deficit drops too low", () => {
    const r = computeMacros({
      ...baseline,
      goal: "lose",
      weeklyRateKg: 0.5,
      manualTdee: 1500,
    });
    // Floor is max(bmr, 1200) ≈ 1649 (baseline male 30/175/70). With manual
    // TDEE 1500 the BMR floor is *higher* than TDEE; target snaps to BMR.
    expect(r.targetCalories).toBe(r.bmr);
  });
});
