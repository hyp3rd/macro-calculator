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

/** A single food identified in the photo. The client uses per-100g +
 *  portionGrams so the user can edit grams in the review dialog and
 *  macros recompute locally.
 *
 *  When `estimated` is true, the macros came from the model rather
 *  than the catalog — surface that to the user with a clear badge so
 *  they can correct or skip. We allow this exception to the usual
 *  "catalog is the only source of macros" rule because the user is
 *  identifying what's already on their plate; refusing to add a
 *  tomato just because tomato isn't pre-seeded would be worse than
 *  giving them an editable estimate. Estimated foods can be promoted
 *  to custom foods on confirm so the next photo of the same food
 *  resolves to the catalog instead. */
export type ResolvedMealPhotoFood = {
  name: string;
  per100g: { protein: number; carbs: number; fat: number; calories: number };
  portionGrams: number;
  confidence: "high" | "medium" | "low";
  /** True when macros came from the model, false when they came from
   *  the seed/custom catalog. */
  estimated: boolean;
};

export type ResolvedMealPhoto = { foods: ResolvedMealPhotoFood[] };

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
  /** Per-100g macros the AI estimates. Required for every food so we
   *  can fall back to these for items not in the catalog. */
  macrosPer100g?: {
    protein?: number;
    carbs?: number;
    fat?: number;
    calories?: number;
  };
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

  const systemPrompt = `You are identifying foods in a photograph the user took of food they're about to eat. For each visible item, estimate the portion in grams AND the per-100g macros.

Rules:
- When a visible food matches one in the seed catalog, USE THE EXACT CATALOG NAME (the server will use the catalog's macros, not your estimates, for matched names).
- For foods not in the catalog, give a short natural name (e.g. "tomato", "white rice", "grilled salmon"). Your macro estimates WILL be used for these — be honest and reasonable.
- Always include per-100g macros for every food, even ones in the catalog (we'll prefer catalog values when they match).
- Estimate grams from visual cues — typical portion is 50–300 g per item; oils/sauces are smaller (5–30 g).
- Typical macro ranges per 100 g: protein 0–30 g, carbs 0–80 g, fat 0–100 g, calories 0–900 kcal. A pure fat is mostly fat; a pure carb is mostly carbs; meats are mostly protein + fat.
- Confidence: "high" if you're sure, "medium" if visually similar to alternatives, "low" if it's a guess.
- Skip items you can't reasonably identify or estimate.
- Return 1–8 foods total. Don't pad the list — fewer high-confidence items beats many low-confidence ones.

Seed catalog (per 100g):
${catalogLines}

Submit your answer via submit_meal_foods and stop.`;

  const tool: Anthropic.Tool = {
    name: "submit_meal_foods",
    description:
      "Final output: the foods you identified with portion grams + per-100g macros. Required.",
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
                description: "Estimated portion in grams (5–500).",
              },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              macrosPer100g: {
                type: "object",
                description:
                  "Per-100g macros. Used directly when the food isn't in the seed catalog; otherwise the catalog values win.",
                properties: {
                  protein: { type: "number" },
                  carbs: { type: "number" },
                  fat: { type: "number" },
                  calories: { type: "number" },
                },
                required: ["protein", "carbs", "fat", "calories"],
              },
            },
            required: ["name", "portionGrams", "macrosPer100g"],
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
  //
  //    Items that resolve to the catalog use catalog macros (truth).
  //    Items that don't resolve fall back to the AI's per-100g
  //    estimates so the user can still log them — the review dialog
  //    surfaces these with an "AI estimate" badge and (optionally)
  //    promotes them to custom foods on confirm so the next photo of
  //    the same food matches the catalog instead.
  const byNorm = buildNormIndex(catalog);
  const resolved: ResolvedMealPhotoFood[] = [];
  for (const item of aiFoods) {
    if (
      !item ||
      typeof item.name !== "string" ||
      typeof item.portionGrams !== "number"
    ) {
      continue;
    }
    const food = matchPick(item.name, catalog, byNorm);
    if (food) {
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
        estimated: false,
      });
      continue;
    }
    // Unmatched — use AI macros. Skip the item if the model didn't
    // supply usable macros (we'd rather drop than show all-zeros).
    const aiMacros = sanitizeMacros(item.macrosPer100g);
    if (!aiMacros) continue;
    resolved.push({
      name: cleanName(item.name),
      per100g: aiMacros,
      portionGrams: clampGrams(item.portionGrams),
      confidence: normalizeConfidence(item.confidence),
      estimated: true,
    });
  }

  const out: ResolvedMealPhoto = { foods: resolved };
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

/** Tidy up an AI-returned food name into something we'd be happy
 *  saving as a custom food. Capitalizes the first letter, trims, drops
 *  trailing punctuation. Doesn't reshape the user-facing string
 *  beyond cosmetics — we want the model's noun, not our reinterpretation. */
function cleanName(raw: string): string {
  const trimmed = raw.trim().replace(/[.,;:]+$/, "");
  if (!trimmed) return raw;
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

type AiMacros = NonNullable<AiSubmittedFood["macrosPer100g"]>;

/** Validate the AI's per-100g macros. Returns the cleaned shape or
 *  `null` if any required field is missing / non-finite / negative.
 *  All-zero is allowed (water, plain tea) — the user can always edit. */
function sanitizeMacros(
  m: AiMacros | undefined,
): { protein: number; carbs: number; fat: number; calories: number } | null {
  if (!m) return null;
  const isOk = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (!isOk(m.protein) || !isOk(m.carbs) || !isOk(m.fat) || !isOk(m.calories)) {
    return null;
  }
  // Cap at sane upper bounds so a hallucinated 9999 doesn't poison the
  // sums in the review dialog.
  return {
    protein: Math.min(m.protein, 100),
    carbs: Math.min(m.carbs, 100),
    fat: Math.min(m.fat, 100),
    calories: Math.min(m.calories, 900),
  };
}
