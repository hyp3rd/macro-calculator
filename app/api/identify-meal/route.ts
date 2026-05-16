import type { DietPreference, Food } from "@/components/macro/types";
import { foodDatabase } from "@/data/food-database";
import { markLastBlockForCache } from "@/lib/ai/anthropic-helpers";
import { getAnthropicConfig } from "@/lib/ai/env";
import { buildNormIndex, matchPick } from "@/lib/ai/plan";
import { getSupabaseServer } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const MODEL: Anthropic.Model = "claude-haiku-4-5";
/** Single-shot vision call — no agent loop. Vision input is the
 *  expensive part; one round trip is plenty for "identify what's in
 *  this picture". */
const MAX_TOKENS = 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Anthropic's documented limit.

/** Macros derived from the catalog for each AI-returned food. The
 *  client uses per-100g + portionGrams so the user can edit grams in
 *  the review dialog and macros recompute locally. */
export type ResolvedMealPhotoFood = {
  name: string;
  per100g: { protein: number; carbs: number; fat: number; calories: number };
  portionGrams: number;
  confidence: "high" | "medium" | "low";
};

export type ResolvedMealPhoto = {
  foods: ResolvedMealPhotoFood[];
  /** Names the AI returned that didn't resolve against the catalog —
   *  shown to the user so they know what was skipped and can add
   *  manually if it matters. */
  unmatched: string[];
};

type RequestBody = {
  /** Base64 (no data: prefix) JPEG/PNG. Capped server-side. */
  imageBase64: string;
  /** MIME type — Anthropic requires us to spell it out. */
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  /** Used for the seed catalog the AI is biased toward. Not enforced
   *  as a filter at this layer — the user is recording what's on the
   *  plate, not asking for compatible suggestions. */
  dietPreference?: DietPreference;
  customFoods?: Food[];
};

type AiSubmittedFood = {
  name: string;
  portionGrams: number;
  confidence?: "high" | "medium" | "low";
};

/** Identify foods in a meal photo via Claude Haiku 4.5 vision. The model
 *  returns names + portion estimates; we resolve each against the seed
 *  catalog (built-in + the user's custom foods, no diet filter) using the
 *  same `matchPick` semantics as the meal-plan and recipe routes. Macros
 *  come from the catalog × grams — never from the model.
 *
 *  Single Anthropic call (no agent loop). Auth-gated + AI-feature-gated
 *  like the other AI routes. */
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

  // 2. AI gate.
  const ai = getAnthropicConfig();
  if (!ai) {
    return NextResponse.json(
      {
        error:
          "AI meal identification isn't configured on this deployment (ANTHROPIC_API_KEY missing).",
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
  if (!body.imageBase64 || typeof body.imageBase64 !== "string") {
    return NextResponse.json({ error: "Missing image data." }, { status: 400 });
  }
  if (
    body.mediaType !== "image/jpeg" &&
    body.mediaType !== "image/png" &&
    body.mediaType !== "image/webp"
  ) {
    return NextResponse.json(
      { error: "Unsupported media type. Use JPEG, PNG, or WebP." },
      { status: 400 },
    );
  }
  // Rough byte estimate — base64 inflates by ~33% so multiply back.
  const approxBytes = Math.floor((body.imageBase64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      {
        error: `Image too large (${Math.round(approxBytes / 1024)} KB). Max ${MAX_IMAGE_BYTES / 1024} KB.`,
      },
      { status: 413 },
    );
  }

  // 4. Build the catalog. NB: no diet filter here — the user is
  //    identifying what's already on the plate, not asking for
  //    suggestions. Allergies still filter at the resolution layer.
  const catalog: Food[] = [...foodDatabase, ...(body.customFoods ?? [])];
  const catalogLines = catalog
    .map(
      (f) =>
        `- ${f.name}: P${f.protein} C${f.carbs} F${f.fat} ${f.calories}kcal`,
    )
    .join("\n");

  const systemPrompt = `You are identifying foods in a photograph the user took of food they're about to eat. For each visible item, estimate the portion in grams.

Rules:
- When a visible food matches one in the seed catalog, USE THE EXACT CATALOG NAME so the server can resolve macros. The catalog is the source of macro truth.
- For foods not in the catalog, return a natural short name (we'll try to match heuristically).
- Estimate grams from visual cues — typical portion is 50–300 g per item; oils/sauces are smaller (5–30 g).
- Confidence: "high" if you're sure, "medium" if visually similar to alternatives, "low" if it's a guess.
- Skip items you can't reasonably identify or estimate grams for.
- Return 1–8 foods total. Don't pad the list.

Seed catalog (per 100g):
${catalogLines}

Submit your answer via submit_meal_foods and stop.`;

  const tool: Anthropic.Tool = {
    name: "submit_meal_foods",
    description:
      "Final output: the foods you identified with portion grams. Required.",
    input_schema: {
      type: "object",
      properties: {
        foods: {
          type: "array",
          description: "Identified foods. 1–8 items.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description:
                  "Food name — prefer the exact seed-catalog name when applicable.",
              },
              portionGrams: {
                type: "number",
                description: "Estimated portion in grams.",
              },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["name", "portionGrams"],
          },
        },
      },
      required: ["foods"],
    },
  };

  // 5. Call Anthropic with the image content block. `markLastBlockForCache`
  //    has handled `"image"` blocks since the helper was extracted — we
  //    let it cache the prefix for free.
  const userMessage: Anthropic.MessageParam = {
    role: "user",
    content: [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: body.mediaType,
          data: body.imageBase64,
        },
      },
      {
        type: "text",
        text: "Identify the foods in this photo and submit via submit_meal_foods.",
      },
    ],
  };
  markLastBlockForCache(userMessage);

  const anthropic = new Anthropic({ apiKey: ai.apiKey });
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [tool],
      tool_choice: { type: "tool", name: "submit_meal_foods" },
      messages: [userMessage],
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

  // 6. Extract the tool_use block. tool_choice was forced, so this is
  //    guaranteed unless the model misbehaves.
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse || toolUse.name !== "submit_meal_foods") {
    return NextResponse.json(
      {
        error: `AI returned no submission (stop_reason=${response.stop_reason}).`,
      },
      { status: 502 },
    );
  }

  const submitted = toolUse.input as { foods?: AiSubmittedFood[] };
  const aiFoods = Array.isArray(submitted.foods) ? submitted.foods : [];

  // 7. Resolve names against the catalog. Same matcher the meal-plan
  //    and recipe routes use — normalized exact match + word-boundary
  //    substring fallback (handles "rolled oats" → "Oats", etc).
  const byNorm = buildNormIndex(catalog);
  const resolved: ResolvedMealPhotoFood[] = [];
  const unmatched: string[] = [];
  for (const item of aiFoods) {
    if (
      !item ||
      typeof item.name !== "string" ||
      typeof item.portionGrams !== "number"
    ) {
      continue;
    }
    const food = matchPick(item.name, catalog, byNorm);
    if (!food) {
      unmatched.push(item.name);
      continue;
    }
    resolved.push({
      name: food.name,
      per100g: {
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        calories: food.calories,
      },
      portionGrams: clampGrams(item.portionGrams),
      confidence: normalizeConfidence(item.confidence),
    });
  }

  const out: ResolvedMealPhoto = { foods: resolved, unmatched };
  return NextResponse.json(out);
}

function clampGrams(g: number): number {
  if (!Number.isFinite(g)) return 100;
  // Round to nearest 5 g, clamp [5, 500] — same grid the deterministic
  // planner uses.
  const snapped = Math.round(g / 5) * 5;
  return Math.max(5, Math.min(500, snapped));
}

function normalizeConfidence(c: unknown): "high" | "medium" | "low" {
  return c === "high" || c === "medium" || c === "low" ? c : "medium";
}
