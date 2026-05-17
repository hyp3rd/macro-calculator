"use client";

import type { DietPreference, Food, Meal } from "@/components/macro/types";

export type AiPlanRequest = {
  targets: { protein: number; carbs: number; fat: number; calories: number };
  dietPreference: DietPreference;
  mealNames: string[];
  customFoods: Food[];
  /** Cuisines the user enjoys. Empty = no preference. */
  cuisinePreferences: string[];
  /** Hard-filter list of allergens / foods to avoid. */
  allergies: string[];
  /** Soft signal — foods the user dislikes but isn't allergic to. The AI
   * is asked to avoid them when it can. Not enforced server-side. */
  dislikedFoods: string[];
  /** Optional: free-text refinement to apply to a previously-generated
   *  plan (sourced from a refiner pill like "lower sugars"). Requires
   *  `previousMeals` to also be set so the AI has a starting plan to
   *  adjust. */
  refinement?: string;
  /** Optional: the meal plan the user wants adjusted. Required when
   *  `refinement` is set or when `targetMealName` is set. */
  previousMeals?: Meal[];
  /** Optional: regenerate only this meal slot, leaving the rest
   *  unchanged. The AI returns just one meal; the caller replaces
   *  the matching slot in the existing plan. Requires `previousMeals`
   *  so the AI sees the day's context. */
  targetMealName?: string;
};

/** Result of asking the AI for a meal plan. `kind: "ok"` always carries
 * a usable `meals` array; everything else carries enough info for the
 * caller to surface a useful message before falling back to the
 * deterministic planner. */
export type AiPlanResult =
  | { kind: "ok"; meals: Meal[] }
  | { kind: "not-configured" } // 503 — env or auth gate missing
  | { kind: "not-authenticated" } // 401 — guest user
  | { kind: "rate-limited" } // 429
  | { kind: "error"; message: string };

/** POST to /api/meal-plan. Network and non-2xx responses are mapped to
 * discriminated `AiPlanResult` kinds so callers can match instead of
 * branching on HTTP status codes. */
export async function requestAiMealPlan(
  req: AiPlanRequest,
): Promise<AiPlanResult> {
  let res: Response;
  try {
    res = await fetch("/api/meal-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : "Network error",
    };
  }

  if (res.ok) {
    try {
      const data = (await res.json()) as { meals: Meal[] };
      if (!Array.isArray(data.meals)) {
        return { kind: "error", message: "Malformed AI response." };
      }
      return { kind: "ok", meals: data.meals };
    } catch (err) {
      return {
        kind: "error",
        message: err instanceof Error ? err.message : "Malformed AI response.",
      };
    }
  }

  if (res.status === 401) return { kind: "not-authenticated" };
  if (res.status === 503) return { kind: "not-configured" };
  if (res.status === 429) return { kind: "rate-limited" };

  // Any other non-2xx — pull a server-provided message if available.
  const body = (await res.json().catch(() => ({}) as { error?: string })) as {
    error?: string;
  };
  return { kind: "error", message: body.error ?? `HTTP ${res.status}` };
}
