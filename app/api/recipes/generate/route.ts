import type { DietPreference, Food, Recipe } from "@/components/macro/types";
import { foodDatabase } from "@/data/food-database";
import { markLastBlockForCache } from "@/lib/ai/anthropic-helpers";
import { getAnthropicConfig } from "@/lib/ai/env";
import { searchOpenFoodFactsServer } from "@/lib/ai/off-search";
import {
  resolveAiRecipe,
  type AiRecipeSubmit,
  unmatchedIngredientNames,
} from "@/lib/ai/recipe";
import { filterByDiet } from "@/lib/diet";
import { getSupabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const MODEL: Anthropic.Model = "claude-haiku-4-5";
/** Hard ceiling on the agent loop. Same shape as meal-plan: each iter is
 *  one Anthropic call + (optionally) one OFF search. Realistic recipes
 *  land in 1–2 iterations; the last iter forces submit_recipe so the loop
 *  is guaranteed to exit. */
const MAX_ITERATIONS = 4;
const MAX_TOKENS_PER_ITERATION = 1024;
const HINT_MAX_LEN = 200;

function buildResolutionCatalog(
  seed: Food[],
  offFoods: Food[],
  allergies: string[],
): Food[] {
  let c = [...seed, ...offFoods];
  if (allergies.length > 0) {
    c = c.filter((f) => {
      const name = f.name.toLowerCase();
      return !allergies.some((a) => a.length > 0 && name.includes(a));
    });
  }
  return c;
}

type RequestBody = {
  dietPreference: DietPreference;
  cuisinePreferences?: string[];
  allergies?: string[];
  dislikedFoods?: string[];
  customFoods?: Food[];
  /** Optional one-line steer ("something Korean and light"). Capped at
   *  HINT_MAX_LEN chars and passed verbatim in the initial user message. */
  hint?: string;
};

/** Generate one recipe via the same multi-turn agent pattern as
 *  /api/meal-plan, but composing a single Recipe (not a day plan). The AI
 *  has two tools: `search_open_food_facts` (identical) and `submit_recipe`
 *  which ends the loop. Macros are computed deterministically by
 *  `resolveAiRecipe` from a catalog snapshot — the AI never invents
 *  nutrient values. Auth-gated + AI-feature-gated, same as meal-plan. */
export async function POST(req: Request): Promise<NextResponse> {
  // 1. Auth gate.
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
          "AI recipe suggestion isn't configured on this deployment (ANTHROPIC_API_KEY missing).",
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
  if (!body.dietPreference) {
    return NextResponse.json(
      { error: "Missing required field: dietPreference." },
      { status: 400 },
    );
  }

  // 4. Pre-build the diet-filtered seed catalog.
  const seedCatalog = filterByDiet(
    [...foodDatabase, ...(body.customFoods ?? [])],
    body.dietPreference,
  );
  if (seedCatalog.length === 0) {
    return NextResponse.json(
      {
        error: `No foods match the ${body.dietPreference} diet preference. Add some custom foods classified as compatible.`,
      },
      { status: 400 },
    );
  }

  // 5. Build prompt context.
  const cuisines = (body.cuisinePreferences ?? []).filter(Boolean);
  const allergies = (body.allergies ?? [])
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  const dislikes = (body.dislikedFoods ?? [])
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const hint =
    typeof body.hint === "string"
      ? body.hint.trim().slice(0, HINT_MAX_LEN)
      : "";

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
      ? `Cuisine preferences: ${cuisines.join(", ")}. Pick a cuisine that fits and stay coherent within it.`
      : "Cuisine preferences: none specified — pick whatever feels coherent.";
  const allergyLine =
    allergies.length > 0
      ? `ALLERGIES (hard filter — NEVER include any ingredient whose name contains these substrings): ${allergies.join(", ")}.`
      : "Allergies: none specified.";
  const dislikeLine =
    dislikes.length > 0
      ? `Disliked ingredients (soft preference — avoid when you can): ${dislikes.join(", ")}.`
      : "Disliked ingredients: none specified.";

  const systemPrompt = `You are proposing ONE recipe (not a day plan) that the user could realistically cook. Coherence and a single coherent cuisine matter more than hitting macro targets.

Rules:
- 4 to 10 ingredients. Keep them coherent — don't mix Italian pasta with Korean banchan.
- Each ingredient has a portion in grams (5 to 500g per ingredient).
- ${cuisineLine}
- ${allergyLine}
- ${dislikeLine}
- Give the recipe a short concrete name (≤80 chars).
- Optional 1–3 sentence \`notes\` field for a prep summary. Keep it brief.

How to find ingredients:
- A small seed catalog is provided below — use these when they fit.
- If a key cuisine-specific ingredient is missing, CALL \`search_open_food_facts\` (at most twice total — each call adds latency). Use concrete queries like "kimchi", "harissa".
- AS SOON as you have all ingredients, CALL \`submit_recipe\`. Do not over-search.
- Use the EXACT \`name\` field of each ingredient (from the seed catalog or from an earlier OFF result in this conversation) so the server can match it.

Seed catalog (per 100g):
${catalogLines}`;

  const anthropic = new Anthropic({ apiKey: ai.apiKey });
  const offFoodsSeen: Food[] = [];
  const offFoodsByName = new Map<string, true>();

  const initialText = hint
    ? `User hint: ${hint}\n\nPropose one recipe. Use search_open_food_facts if needed, then call submit_recipe.`
    : "Propose one recipe. Use search_open_food_facts if needed, then call submit_recipe.";

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: initialText,
          cache_control: { type: "ephemeral" },
        },
      ],
    },
  ];

  const tools: Anthropic.Tool[] = [
    {
      name: "search_open_food_facts",
      description:
        "Search the Open Food Facts public database for foods. Returns up to 5 matching products with per-100g macros. Use concrete queries (e.g. 'kimchi', 'tempeh', 'tahini').",
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
      name: "submit_recipe",
      description:
        "Final output: submit the recipe. After calling this, stop — you're done.",
      input_schema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Recipe name — short and concrete (≤80 chars).",
          },
          ingredients: {
            type: "array",
            description: "Ingredients with grams. 4–10 items.",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Ingredient name — must match the seed catalog or a previously-returned OFF result.",
                },
                portionGrams: {
                  type: "number",
                  description: "Portion in grams (5–500).",
                },
              },
              required: ["name", "portionGrams"],
            },
          },
          cuisine: { type: "string", description: "Cuisine label (optional)." },
          notes: {
            type: "string",
            description: "1–3 sentence prep summary (optional).",
          },
        },
        required: ["name", "ingredients"],
      },
    },
  ];

  let finalSubmit: AiRecipeSubmit | null = null;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
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
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        tool_choice: isLastIteration
          ? { type: "tool", name: "submit_recipe" }
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

    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

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
            text: "You didn't call a tool. Either call search_open_food_facts to find more foods, or call submit_recipe to finalize.",
          },
        ],
      };
      markLastBlockForCache(nudge);
      messages.push(nudge);
      continue;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      if (toolUse.name === "submit_recipe") {
        const submitted = toolUse.input as AiRecipeSubmit;
        // Validate names against the current catalog. On zero-resolve with
        // iterations remaining, feed back the unmatched names so the model
        // can self-correct — same pattern as meal-plan.
        const catalogNow = buildResolutionCatalog(
          seedCatalog,
          offFoodsSeen,
          allergies,
        );
        const previewRecipe = resolveAiRecipe(submitted, catalogNow);
        if (previewRecipe.ingredients.length === 0 && !isLastIteration) {
          const unmatched = unmatchedIngredientNames(submitted, catalogNow);
          const validSample = catalogNow
            .slice(0, 20)
            .map((f) => f.name)
            .join(", ");
          const unmatchedSample = unmatched.slice(0, 10).join(", ");
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Your recipe resolved to zero ingredients — none of these names matched the catalog: ${unmatchedSample || "(no ingredients at all)"}. Use names exactly as they appear in the seed catalog (e.g., ${validSample}) or in earlier search_open_food_facts results. Call submit_recipe again with corrected names.`,
            is_error: true,
          });
          continue;
        }
        finalSubmit = submitted;
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
          const reason = err instanceof Error ? err.message : "unknown error";
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Open Food Facts search failed: ${reason}. Try a different query or call submit_recipe.`,
            is_error: true,
          });
          continue;
        }
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
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Unknown tool: ${toolUse.name}`,
        is_error: true,
      });
    }

    if (finalSubmit) break;

    const toolResultMsg: Anthropic.MessageParam = {
      role: "user",
      content: toolResults,
    };
    markLastBlockForCache(toolResultMsg);
    messages.push(toolResultMsg);
  }

  if (!finalSubmit) {
    return NextResponse.json(
      { error: "AI iteration cap reached without submitting a recipe." },
      { status: 502 },
    );
  }

  const resolutionCatalog = buildResolutionCatalog(
    seedCatalog,
    offFoodsSeen,
    allergies,
  );
  const draft = resolveAiRecipe(finalSubmit, resolutionCatalog);
  if (draft.ingredients.length === 0) {
    return NextResponse.json(
      {
        error:
          "AI submitted an empty recipe (no ingredients matched the catalog after filtering).",
      },
      { status: 502 },
    );
  }

  // Return the draft Recipe. The client opens RecipeForm pre-filled with
  // this and lets the user review/edit before saving — we do NOT persist
  // server-side. id/createdAt/updatedAt are minted at save time client-side.
  const recipe: Omit<Recipe, "id" | "createdAt" | "updatedAt"> = draft;
  return NextResponse.json({ recipe });
}
