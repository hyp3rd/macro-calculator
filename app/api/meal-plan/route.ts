import type { DietPreference, Food, Meal } from "@/components/macro/types";
import { markLastBlockForCache } from "@/lib/ai/anthropic-helpers";
import { buildResolutionCatalog, buildSeedCatalog } from "@/lib/ai/catalog";
import { getAnthropicConfig } from "@/lib/ai/env";
import { searchOpenFoodFactsServer } from "@/lib/ai/off-search";
import {
  aiPlanToMeals,
  type AiPlanShape,
  unmatchedPickNames,
} from "@/lib/ai/plan";
import { getSupabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const MODEL: Anthropic.Model = "claude-haiku-4-5";
/** Hard ceiling on the agent loop. Each iteration is one Anthropic call
 * + (optionally) one OFF search. Realistic plans land in 1–3 iterations.
 * On the very last iteration we force `tool_choice: submit_meal_plan` so
 * the loop is *guaranteed* to exit with a plan rather than time out. */
const MAX_ITERATIONS = 5;
/** Per-iteration response cap. Tool-call responses are tiny (a JSON
 * payload + maybe a sentence of preamble); 1024 is plenty and keeps
 * each round-trip under ~2 s on Haiku 4.5. */
const MAX_TOKENS_PER_ITERATION = 1024;

type RequestBody = {
  targets: { protein: number; carbs: number; fat: number; calories: number };
  dietPreference: DietPreference;
  mealNames: string[];
  /** User's saved custom foods — same shape as Food at the wire level. */
  customFoods?: Food[];
  /** Cuisines the user enjoys. Empty = no preference. */
  cuisinePreferences?: string[];
  /** Hard filter — the AI must avoid any food matching these substrings. */
  allergies?: string[];
  /** Soft preference — the AI is asked to avoid these but the converter
   * doesn't filter them. Foods the user dislikes but isn't allergic to. */
  dislikedFoods?: string[];
  /** Free-text adjustment the user wants applied to a *previously*
   *  generated plan — sourced from a refiner pill (e.g. "lower sugars",
   *  "adapt for celiacs"). When present, `previousMeals` must also be
   *  set so the AI sees what to modify rather than starting from
   *  scratch. */
  refinement?: string;
  /** The meal plan the user wants the AI to adjust. Required when
   *  `refinement` is set. Each meal is the same shape the meal-planner
   *  UI uses (id, name, foods). The AI sees the foods + portions and
   *  is asked to apply the refinement on top. */
  previousMeals?: Meal[];
  /** Optional: regenerate ONLY this meal slot, leaving the others
   *  unchanged. Must match one of the `mealNames` exactly (e.g.
   *  "Breakfast"). Requires `previousMeals` so the AI knows what's
   *  on the rest of the day's plate; the client then replaces only
   *  this slot in the returned plan. */
  targetMealName?: string;
};

/** Generate a coherent one-day meal plan using Claude Haiku 4.5 in a
 * multi-turn agent loop. The AI has two tools:
 *
 *  - `search_open_food_facts(query, limit)` — pulls live foods from OFF
 *    so the plan isn't capped at the 35-item built-in catalog. Useful
 *    when the user has cuisine preferences the local catalog doesn't
 *    cover (Korean, Ethiopian, Japanese, etc.).
 *
 *  - `submit_meal_plan(meals)` — final output. Stops the loop.
 *
 * Macros are computed server-side from the matching catalog (built-in
 * + custom + foods returned by tool calls in this session), so the AI
 * can't hallucinate nutrient values. Allergies are enforced at two
 * layers: the system prompt tells the AI to avoid them; the converter
 * drops any pick whose name contains an allergen substring.
 *
 * Auth-gated (signed-in users only) and feature-gated on
 * `ANTHROPIC_API_KEY`. */
export async function POST(req: Request): Promise<NextResponse> {
  // 1. Auth gate — mirrors /api/delete-account.
  const supabase = await getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // 2. AI feature gate.
  const ai = getAnthropicConfig();
  if (!ai) {
    return NextResponse.json(
      {
        error:
          "AI meal planning isn't configured on this deployment (ANTHROPIC_API_KEY missing).",
      },
      { status: 503 },
    );
  }

  // 3. Validate body.
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    !body.targets ||
    !body.dietPreference ||
    !Array.isArray(body.mealNames) ||
    body.mealNames.length === 0
  ) {
    return NextResponse.json(
      { error: "Missing required fields: targets, dietPreference, mealNames." },
      { status: 400 },
    );
  }

  // 4. Pre-build the diet-filtered seed catalog. The AI sees this in the
  //    system prompt + can expand it via search_open_food_facts.
  const seedCatalog = buildSeedCatalog(body.dietPreference, body.customFoods);
  if (!seedCatalog) {
    return NextResponse.json(
      {
        error: `No foods match the ${body.dietPreference} diet preference. Add some custom foods classified as compatible.`,
      },
      { status: 400 },
    );
  }

  // 5. Build the system prompt + agent instructions.
  const cuisines = (body.cuisinePreferences ?? []).filter(Boolean);
  const allergies = (body.allergies ?? [])
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  const dislikes = (body.dislikedFoods ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const distributionHint =
    body.mealNames.length === 4
      ? "Roughly 25% Breakfast, 35% Lunch, 30% Dinner, 10% Snacks."
      : "Spread the targets across the meal slots in a sensible way.";

  const catalogLines = seedCatalog
    .map(
      (f) =>
        `- ${f.name}: P${f.protein} C${f.carbs} F${f.fat} ${f.calories}kcal${
          f.category ? ` (${f.category})` : ""
        }`,
    )
    .join("\n");

  const cuisineLine =
    cuisines.length > 0
      ? `Cuisine preferences: ${cuisines.join(", ")}. Lean into these — pick foods that feel native to these cuisines.`
      : "Cuisine preferences: none specified — plan freely.";
  const allergyLine =
    allergies.length > 0
      ? `ALLERGIES (hard filter — NEVER include any food whose name contains these substrings): ${allergies.join(", ")}.`
      : "Allergies: none specified.";
  const dislikeLine =
    dislikes.length > 0
      ? `Disliked foods (soft preference — avoid when you can, but it's OK to include if it's the only way to hit the targets): ${dislikes.join(", ")}.`
      : "Disliked foods: none specified.";

  // Optional refinement block — appended when the request is a "tweak
  // this previously-generated plan" rather than a fresh generation.
  // The user message also includes the previous meals as starting
  // context (see below); the system prompt just adds the constraint.
  const refinement = (body.refinement ?? "").trim();
  const refinementBlock = refinement
    ? `\n\nThe user wants the following adjustment to the plan you previously suggested below: ${refinement}\nApply this refinement while keeping the macros close to the targets above and respecting the same allergies / diet / cuisine constraints. You may keep meals that already satisfy the refinement unchanged; only swap or adjust the ones that don't.`
    : "";

  // Single-meal regeneration: the user wants only one slot rebuilt
  // (the "regenerate this meal" sparkles button in the meal planner).
  // We tell the AI explicitly to return ONLY that meal — saves tokens
  // and avoids accidentally clobbering meals the user is keeping. The
  // client merges the returned single meal into the right slot.
  const targetMealName = (body.targetMealName ?? "").trim();
  const targetMealBlock = targetMealName
    ? `\n\nYou are regenerating ONE meal slot only: "${targetMealName}". The other meals are shown below as fixed context — DO NOT change or include them. Your submit_meal_plan call MUST contain exactly one meal in the \`meals\` array, with \`name\` set to "${targetMealName}". Keep this meal's macros sensible relative to the day's overall targets minus what the other meals already contribute (don't try to over-balance — just propose a good-looking meal in the same culinary register as the rest of the day).`
    : "";

  const systemPrompt = `You are a meal planner and a competent home cook. Design a one-day plan that approximately hits the daily macro targets while producing meals a real person would actually eat — culturally coherent, palatable, and properly composed.

PALATABILITY RULES (these matter more than hitting macros perfectly):

Every meal must form a recognizable dish or a sensible plate. A "meal" is not a list of macros — it's food. Apply these tests before submitting:

- **No standalone fats.** Olive oil, butter, ghee, etc. are condiments / cooking media. They are NEVER a meal on their own and NEVER a snack on their own. If you want them in the macros, attach them to a real food: "salad with olive oil dressing", "rice with butter".
- **One protein per meal, with rare exceptions.** Don't mix two meats / two fishes / meat-and-fish in the same meal unless it's culturally normal (surf-and-turf is fine; pangasius + salmon is not). A meal with salmon AND pangasius reads as a bug.
- **Snacks must be snacks people actually eat.** Acceptable snack patterns: a piece of fruit; nuts; yogurt; cheese with crackers; a protein bar. UNACCEPTABLE: raw fish in a snack, oil in a snack, cheese + fish + berries. If you can't picture eating it standing up between meals, it's not a snack.
- **Coherence by meal slot.** Breakfast = breakfast foods (oats, eggs, yogurt, toast, fruit, smoothies, pancakes). Dinner = dinner foods (proteins + grains + vegetables, soups, stews, pasta dishes). Don't put dinner foods at breakfast or breakfast foods at dinner.
- **No naked carbs / naked protein.** A meal of only rice is not a meal. A meal of only chicken breast is not a meal. Pair carbs + protein + a vegetable or fat for every main meal.
- **Cuisine consistency within a meal.** If a meal leans Japanese, don't add parmesan. If it leans Mexican, don't add miso. Mixed-cuisine *days* are fine; mixed-cuisine single *meals* are not.

OTHER RULES:

- Use 2–4 foods per main meal. Snacks can be 1–2 foods.
- Distribution: ${distributionHint}
- ${cuisineLine}
- ${allergyLine}
- ${dislikeLine}${refinementBlock}${targetMealBlock}

FOOD LOOKUP:

- A small seed catalog is provided below — use these when they fit.
- When the seed catalog doesn't cover the cuisines or specific foods you want, CALL the \`search_open_food_facts\` tool. Use it AT MOST 1–2 times total per plan — each call adds latency. Search with concrete queries (e.g. "kimchi", "harissa chickpeas") — broad queries like "food" don't work well.
- ALL portions are in grams. Macros are per 100g.
- AS SOON as you have enough foods to fill the requested meal slots, CALL \`submit_meal_plan\`. Do not over-search. The seed catalog alone is usually sufficient.
- Use the EXACT \`name\` field of each food (from the seed catalog or from an OFF result you saw earlier in this conversation) so the server can match it.

BEFORE SUBMITTING, re-read your plan and ask: "would I actually serve this to a friend?" If any meal fails that test, fix it before calling submit_meal_plan.

Seed catalog (per 100g):
${catalogLines}`;

  // 6. Run the agent loop. Captures all OFF foods seen across iterations
  //    so the converter can resolve names back to macros.
  const anthropic = new Anthropic({ apiKey: ai.apiKey });
  const offFoodsSeen: Food[] = [];
  const offFoodsByName = new Map<string, true>();

  // Initial user message uses a content-block array (not a bare string) so
  // we can attach `cache_control` and extend the cached prefix into the
  // transcript as the loop progresses.
  // When this is a refinement, render the previous meals as a bullet
  // list the AI can see — far more useful than asking it to re-derive
  // a plan from scratch when only a constraint changed. Skipped when
  // there's no previousMeals (i.e. a fresh generation).
  // Render the previous meals as a bullet list when either a
  // refinement OR a single-meal regeneration is in flight — both
  // need the AI to see what's already on the rest of the day's
  // plate. Fresh generations (no refinement, no target) skip the
  // block to save tokens.
  const needsPreviousMeals =
    (refinement || targetMealName) &&
    Array.isArray(body.previousMeals) &&
    body.previousMeals.length > 0;
  const previousMealsLabel = targetMealName
    ? `\n\nThe other meals (DO NOT change or include them in your response):`
    : `\n\nPreviously suggested plan (to adjust per the refinement above):`;
  const previousMealsBlock = needsPreviousMeals
    ? `${previousMealsLabel}\n${(body.previousMeals ?? [])
        .filter(
          (m) =>
            // When regenerating a single slot, omit the target itself
            // from the "other meals" context — the AI is rebuilding it
            // from scratch, no need to anchor on what was there.
            !targetMealName ||
            m.name.toLowerCase() !== targetMealName.toLowerCase(),
        )
        .map((m) => {
          const items =
            m.foods.length === 0
              ? "  (empty)"
              : m.foods
                  .map(
                    (f) =>
                      `  - ${f.name} (${f.portionSize ?? 100} g, ${Math.round(
                        f.calories,
                      )} kcal)`,
                  )
                  .join("\n");
          return `${m.name}:\n${items}`;
        })
        .join("\n")}`
    : "";

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Daily targets: protein ${body.targets.protein}g, carbs ${body.targets.carbs}g, fat ${body.targets.fat}g, ${body.targets.calories} kcal.
Meal slots (in order): ${body.mealNames.join(", ")}.${previousMealsBlock}

Plan the day. Use search_open_food_facts as needed, then call submit_meal_plan.`,
          cache_control: { type: "ephemeral" },
        },
      ],
    },
  ];

  const tools: Anthropic.Tool[] = [
    {
      name: "search_open_food_facts",
      description:
        "Search the Open Food Facts public database for foods. Returns up to 5 matching products with per-100g macros. Use concrete queries (e.g. 'kimchi', 'tempeh', 'tahini') rather than generic ones.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term — be specific." },
          limit: {
            type: "number",
            description: "Max results (1–5). Default 5.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "submit_meal_plan",
      description:
        "Final output: submit the day's meal plan. After calling this, stop — you're done.",
      input_schema: {
        type: "object",
        properties: {
          meals: {
            type: "array",
            description:
              "One entry per requested meal slot, in the same order.",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Meal slot name matching one of the requested slots.",
                },
                foods: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        description:
                          "Food name — must match the seed catalog or a previously-returned OFF result.",
                      },
                      portionGrams: {
                        type: "number",
                        description: "Portion size in grams (5–500).",
                      },
                    },
                    required: ["name", "portionGrams"],
                  },
                },
              },
              required: ["name", "foods"],
            },
          },
        },
        required: ["meals"],
      },
    },
  ];

  let finalPlan: AiPlanShape | null = null;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Last iteration → force submit_meal_plan so the loop is *guaranteed*
    // to exit with a plan rather than time out searching forever.
    const isLastIteration = iter === MAX_ITERATIONS - 1;
    let response: Anthropic.Message;
    try {
      response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS_PER_ITERATION,
        system: [
          {
            type: "text",
            text: systemPrompt,
            // System + tool list are stable across the loop; cache them.
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        tool_choice: isLastIteration
          ? { type: "tool", name: "submit_meal_plan" }
          : { type: "auto" },
        messages,
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        return NextResponse.json(
          { error: "AI is rate-limited. Try again shortly." },
          { status: 429 },
        );
      }
      if (err instanceof Anthropic.AuthenticationError) {
        return NextResponse.json(
          { error: "AI authentication failed — check ANTHROPIC_API_KEY." },
          { status: 503 },
        );
      }
      const message = err instanceof Error ? err.message : "AI request failed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    // Append the assistant's full content (text + tool_use blocks) so the
    // next turn's tool_result can reference the tool_use ids.
    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    // No tool call in this turn — the model returned only text. Nudge it
    // and let the next iteration try again (the forced-submit on the
    // last iteration guarantees we still exit cleanly).
    if (toolUseBlocks.length === 0) {
      if (isLastIteration) {
        return NextResponse.json(
          {
            error: `AI returned no tool call on the forced-submit iteration (stop_reason=${response.stop_reason}).`,
          },
          { status: 502 },
        );
      }
      const nudge: Anthropic.MessageParam = {
        role: "user",
        content: [
          {
            type: "text",
            text: "You didn't call a tool. Either call search_open_food_facts to find more foods, or call submit_meal_plan to finalize.",
          },
        ],
      };
      markLastBlockForCache(nudge);
      messages.push(nudge);
      continue;
    }
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      if (toolUse.name === "submit_meal_plan") {
        const submitted = toolUse.input as AiPlanShape;
        // Resolve against the current catalog (seed + OFF foods seen so
        // far, minus allergens) BEFORE accepting the plan. If everything
        // the AI submitted fails to match and we still have iterations
        // left, send the unmatched names back as an is_error tool_result
        // and let it self-correct — that's far better than 502-ing on an
        // empty plan when the model was just paraphrasing names.
        const catalogNow = buildResolutionCatalog(
          seedCatalog,
          offFoodsSeen,
          allergies,
        );
        const previewMeals = aiPlanToMeals(
          submitted,
          body.mealNames,
          catalogNow,
        );
        const allEmpty = previewMeals.every((m) => m.foods.length === 0);
        if (allEmpty && !isLastIteration) {
          const unmatched = unmatchedPickNames(submitted, catalogNow);
          const validSample = catalogNow
            .slice(0, 20)
            .map((f) => f.name)
            .join(", ");
          const unmatchedSample = unmatched.slice(0, 10).join(", ");
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Your plan resolved to zero foods — none of these names matched the catalog: ${unmatchedSample || "(no picks at all)"}. Use names exactly as they appear in the seed catalog (e.g., ${validSample}) or in earlier search_open_food_facts results. Call submit_meal_plan again with corrected names.`,
            is_error: true,
          });
          continue;
        }
        finalPlan = submitted;
        break;
      }
      if (toolUse.name === "search_open_food_facts") {
        const input = toolUse.input as { query?: string; limit?: number };
        let found: Food[];
        try {
          found = await searchOpenFoodFactsServer(
            input.query ?? "",
            input.limit ?? 5,
          );
        } catch (err) {
          // OFF is best-effort: surface the failure to the model as an
          // is_error tool_result so it can retry with a different query or
          // proceed straight to submit_meal_plan with the seed catalog.
          // Without this we'd let the throw escape the loop → unhandled 500.
          const reason = err instanceof Error ? err.message : "unknown error";
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Open Food Facts search failed: ${reason}. Try a different query or call submit_meal_plan.`,
            is_error: true,
          });
          continue;
        }
        // Deduplicate by name so the same product doesn't accumulate
        // across multiple searches.
        for (const f of found) {
          const key = f.name.toLowerCase().trim();
          if (!offFoodsByName.has(key)) {
            offFoodsByName.set(key, true);
            offFoodsSeen.push(f);
          }
        }
        const resultLines = found
          .map(
            (f) =>
              `- ${f.name}: P${f.protein} C${f.carbs} F${f.fat} ${f.calories}kcal${
                f.brand ? ` (${f.brand})` : ""
              }`,
          )
          .join("\n");
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content:
            found.length === 0
              ? "No matching products. Try a different query."
              : `${found.length} match${found.length === 1 ? "" : "es"} (per 100g):\n${resultLines}`,
        });
        continue;
      }
      // Unknown tool — shouldn't happen since we control the tool list.
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Unknown tool: ${toolUse.name}`,
        is_error: true,
      });
    }

    if (finalPlan) break;

    // Feed tool results back for the next iteration. Cache the last block
    // so the next turn re-uses this transcript prefix.
    const toolResultMsg: Anthropic.MessageParam = {
      role: "user",
      content: toolResults,
    };
    markLastBlockForCache(toolResultMsg);
    messages.push(toolResultMsg);
  }

  if (!finalPlan) {
    return NextResponse.json(
      { error: "AI iteration cap reached without submitting a plan." },
      { status: 502 },
    );
  }

  // 7. Resolve the AI plan against the same catalog the in-loop validation
  //    used: seed (built-in + customs, diet-filtered) + OFF foods seen this
  //    run, minus allergens. Defense in depth — even if the AI sneaks an
  //    allergen past the system prompt, the converter drops it here.
  const resolutionCatalog = buildResolutionCatalog(
    seedCatalog,
    offFoodsSeen,
    allergies,
  );

  const meals: Meal[] = aiPlanToMeals(
    finalPlan,
    body.mealNames,
    resolutionCatalog,
  );

  // If every meal slot ended up empty, the AI's submit was effectively
  // garbage (no foods, or every food name hallucinated past matching).
  // Surface that as a 502 so the client can fall back to the deterministic
  // planner — silently returning an empty plan would look like success.
  if (meals.every((m) => m.foods.length === 0)) {
    return NextResponse.json(
      {
        error:
          "AI submitted an empty plan (no foods matched the catalog after filtering).",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ meals });
}
