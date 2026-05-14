import type { DietPreference, Food, Meal } from "@/components/macro/types";
import { foodDatabase } from "@/data/food-database";
import { getAnthropicConfig } from "@/lib/ai/env";
import { aiPlanToMeals, type AiPlanShape } from "@/lib/ai/plan";
import { filterByDiet } from "@/lib/diet";
import { getSupabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const MODEL: Anthropic.Model = "claude-haiku-4-5";

type RequestBody = {
  targets: { protein: number; carbs: number; fat: number; calories: number };
  dietPreference: DietPreference;
  mealNames: string[];
  /** User's saved custom foods — same shape as Food at the wire level.
   * Server merges them with the built-in catalog before sending to the AI. */
  customFoods?: Food[];
};

/** Generate a coherent one-day meal plan using Claude Haiku 4.5. The AI is
 * constrained via tool use to return only food *names* + portions — macros
 * are computed server-side from the catalog so the model can't invent
 * nutrient values. Hallucinated foods (name not in catalog) are dropped.
 *
 * Auth-gated (signed-in users only) and feature-gated on
 * `ANTHROPIC_API_KEY` — when unset the route returns 503 and the client
 * falls back to the deterministic planner. */
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

  // 4. Build the catalog the AI is allowed to pick from. Diet filter runs
  //    here too — the AI gets a pre-filtered list rather than the prompt
  //    having to explain "skip these because vegan".
  const catalog = filterByDiet(
    [...foodDatabase, ...(body.customFoods ?? [])],
    body.dietPreference,
  );
  if (catalog.length === 0) {
    return NextResponse.json(
      {
        error: `No foods match the ${body.dietPreference} diet preference. Add some custom foods classified as compatible.`,
      },
      { status: 400 },
    );
  }

  // 5. Call Anthropic with tool-use to force a JSON-shaped response. The
  //    cache_control on the last system block also covers the tool list
  //    (render order: tools → system → messages), so the static prompt +
  //    catalog get cached when the prefix is large enough (Haiku 4.5 min
  //    cacheable prefix: 4096 tokens). For small catalogs this is a no-op.
  const distributionHint =
    body.mealNames.length === 4
      ? "Roughly 25% Breakfast, 35% Lunch, 30% Dinner, 10% Snacks."
      : "Spread the targets across the meal slots in a sensible way.";

  const catalogLines = catalog
    .map(
      (f) =>
        `- ${f.name}: P${f.protein} C${f.carbs} F${f.fat} ${f.calories}kcal${
          f.category ? ` (${f.category})` : ""
        }`,
    )
    .join("\n");

  const systemPrompt = `You are a meal planner. Given daily macro targets and a curated food catalog, design a one-day plan that approximately hits the targets while keeping food combinations coherent and culturally appropriate per meal.

Rules:
- Pick foods ONLY from the catalog below. Use the food's exact \`name\` so the server can match it.
- All portions are in grams. Macros in the catalog are per 100g.
- Coherence matters more than perfect macro precision. Breakfast should feel like breakfast; dinner like dinner. Don't pair olive oil + tuna + oats for breakfast.
- Distribution: ${distributionHint}
- Use 2–4 foods per meal. Snacks can be 1–2.
- Return your plan by calling the \`submit_meal_plan\` tool.

Food catalog (per 100g):
${catalogLines}`;

  const anthropic = new Anthropic({ apiKey: ai.apiKey });

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: "submit_meal_plan",
          description:
            "Submit the day's meal plan with foods and portions per meal.",
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
                              "Food name from the catalog (exact match).",
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
      ],
      tool_choice: { type: "tool", name: "submit_meal_plan" },
      messages: [
        {
          role: "user",
          content: `Daily targets: protein ${body.targets.protein}g, carbs ${body.targets.carbs}g, fat ${body.targets.fat}g, ${body.targets.calories} kcal.
Meal slots (in order): ${body.mealNames.join(", ")}.

Generate the plan now by calling submit_meal_plan.`,
        },
      ],
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

  // 6. Extract the tool_use block — tool_choice forced its presence.
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse || toolUse.name !== "submit_meal_plan") {
    return NextResponse.json(
      { error: "AI didn't return a structured plan." },
      { status: 502 },
    );
  }

  // 7. Convert AI shape → local Meal[]. The converter drops hallucinated
  //    foods and clamps/snaps portions to the same 5g grid the
  //    deterministic planner uses.
  const meals: Meal[] = aiPlanToMeals(
    toolUse.input as AiPlanShape,
    body.mealNames,
    catalog,
  );

  return NextResponse.json({ meals });
}
